import { createClient, type Client } from '@libsql/client';
import { gzipSync, gunzipSync } from 'node:zlib';
import { emptyState, type State } from '../lib/model';

// Compress the versioned JSON so historical workbooks do not inflate network responses.
export function encodeState(state: State): Buffer {
  const { storage: _storage, ...data } = state;
  return gzipSync(Buffer.from(JSON.stringify(data)));
}

export function decodeState(data: unknown): State {
  if (!(data instanceof ArrayBuffer) && !Buffer.isBuffer(data)) throw new Error('Estado inválido no Turso.');
  return JSON.parse(gunzipSync(Buffer.from(data as ArrayBuffer)).toString('utf8')) as State;
}

export function createTursoClient(url = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN): Client {
  if (!url) throw new Error('Configure TURSO_DATABASE_URL.');
  const local = url.startsWith('file:');
  if (local && process.env.NODE_ENV === 'production') throw new Error('Use um banco Turso remoto em produção.');
  if (!local && !/^(libsql|https):\/\//.test(url)) throw new Error('Use a URL libsql:// ou https:// do Turso.');
  if (!local && !authToken) throw new Error('Configure TURSO_AUTH_TOKEN.');
  return createClient({ url, authToken: local ? undefined : authToken });
}

export async function setupTurso(client: Client) {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS hf_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data BLOB NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS hf_documents (
      id TEXT PRIMARY KEY,
      bytes BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ], 'write');
}

export async function readTursoState(client: Client): Promise<State> {
  const result = await client.execute('SELECT data FROM hf_state WHERE id = 1');
  return { ...(result.rows[0] ? decodeState(result.rows[0].data) : emptyState()), storage: 'turso' };
}

export async function updateTursoState<T>(client: Client, fn: (state: State) => T | Promise<T>, expectedVersion?: number): Promise<T> {
  // BEGIN IMMEDIATE serializes writers across application instances.
  const tx = await client.transaction('write');
  try {
    const rows = await tx.execute('SELECT data FROM hf_state WHERE id = 1');
    const state = rows.rows[0] ? decodeState(rows.rows[0].data) : emptyState();
    if (expectedVersion !== undefined && state.version !== expectedVersion) {
      throw new Error('Os dados mudaram em outra sessão. Atualize a página antes de salvar.');
    }
    const result = await fn(state);
    state.version++;
    await tx.execute({
      sql: `INSERT INTO hf_state (id, data) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
      args: [encodeState(state)],
    });
    await tx.commit();
    return result;
  } finally {
    tx.close();
  }
}

export async function putTursoDocument(client: Client, id: string, bytes: Buffer) {
  await client.execute({ sql: 'INSERT INTO hf_documents (id, bytes) VALUES (?, ?) ON CONFLICT(id) DO NOTHING', args: [id, bytes] });
}

export async function getTursoDocument(client: Client, id: string): Promise<Buffer> {
  const rows = await client.execute({ sql: 'SELECT bytes FROM hf_documents WHERE id = ?', args: [id] });
  if (!rows.rows[0]) throw new Error('Documento não encontrado');
  return Buffer.from(rows.rows[0].bytes as ArrayBuffer);
}

let client: Client | undefined;
let setup: Promise<void> | undefined;
export async function tursoDatabase(): Promise<Client | null> {
  if (!process.env.TURSO_DATABASE_URL) {
    if (process.env.TURSO_AUTH_TOKEN) throw new Error('Configure TURSO_DATABASE_URL junto com TURSO_AUTH_TOKEN.');
    return null;
  }
  client ??= createTursoClient();
  setup ??= setupTurso(client).catch(error => { setup = undefined; throw error; });
  await setup;
  return client;
}
