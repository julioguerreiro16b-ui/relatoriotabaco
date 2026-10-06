import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { emptyState, type State } from '@/lib/model';
const root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.HF_LOCAL_DATA_DIR || '.data');
const filename = path.join(root, 'state.json');
let sqlClient: ReturnType<typeof postgres> | undefined;
let setup: Promise<void> | undefined;
async function database() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') throw new Error('Configure DATABASE_URL para armazenamento online antes de publicar.');
    return null;
  }
  sqlClient ??= postgres(process.env.DATABASE_URL, { max: 3, idle_timeout: 20, connect_timeout: 15, prepare: false });
  const sql = sqlClient;
  setup ??= (async () => {
    await sql.begin(async tx => {
      await tx`CREATE TABLE IF NOT EXISTS hf_state (id integer PRIMARY KEY CHECK (id=1), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
      await tx`CREATE TABLE IF NOT EXISTS hf_documents (id uuid PRIMARY KEY, bytes bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
      // Supabase exposes public tables through its Data API. These tables are server-only:
      // no client policies; the database owner used by the backend retains direct access.
      await tx`ALTER TABLE hf_state ENABLE ROW LEVEL SECURITY`;
      await tx`ALTER TABLE hf_documents ENABLE ROW LEVEL SECURITY`;
      await tx`INSERT INTO hf_state(id,data) VALUES (1,${tx.json(emptyState() as never)}) ON CONFLICT DO NOTHING`;
    });
  })().catch(e => { setup = undefined; throw e; });
  await setup; return sql;
}
async function localRead(): Promise<State> {
  try { return JSON.parse(await readFile(filename,'utf8')); }
  catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyState(); throw e; }
}
export async function readState(): Promise<State> {
  const sql = await database();
  if (sql) { const rows = await sql`SELECT data FROM hf_state WHERE id=1`; return { ...rows[0].data as State, storage:'postgres' }; }
  return { ...await localRead(), storage:'local' };
}
// Serialize local updates; PostgreSQL uses a row lock across all serverless instances.
let queue: Promise<unknown> = Promise.resolve();
export function updateState<T>(fn: (state:State) => T | Promise<T>, expectedVersion?: number): Promise<T> {
  const task = async () => {
    const sql = await database();
    if (sql) return await sql.begin(async tx => {
      const rows = await tx`SELECT data FROM hf_state WHERE id=1 FOR UPDATE`;
      const state = rows[0].data as State;
      if (expectedVersion !== undefined && state.version !== expectedVersion) throw new Error('Os dados mudaram em outra sessão. Atualize a página antes de salvar.');
      const result = await fn(state); state.version++;
      await tx`UPDATE hf_state SET data=${tx.json(state as never)}, updated_at=now() WHERE id=1`;
      return result as never;
    }) as T;
    const state = await localRead();
    if (expectedVersion !== undefined && state.version !== expectedVersion) throw new Error('Os dados mudaram em outra sessão. Atualize a página antes de salvar.');
    const result = await fn(state); state.version++;
    await mkdir(root, {recursive:true});
    await writeFile(filename+'.tmp', JSON.stringify(state), {mode:0o600});
    await rename(filename+'.tmp',filename); return result;
  };
  const result = queue.then(task,task); queue = result.catch(() => {}); return result;
}
export async function putDocument(id:string, bytes:Buffer) {
  const sql = await database();
  if (sql) { await sql`INSERT INTO hf_documents(id,bytes) VALUES (${id},${bytes}) ON CONFLICT DO NOTHING`; return; }
  await mkdir(path.join(root,'documents'),{recursive:true});
  await writeFile(path.join(root,'documents',id),bytes,{mode:0o600});
}
export async function getDocument(id:string): Promise<Buffer> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Documento inválido');
  const sql = await database();
  if (sql) { const rows = await sql`SELECT bytes FROM hf_documents WHERE id=${id}`; if (!rows[0]) throw new Error('Documento não encontrado'); return rows[0].bytes; }
  return readFile(path.join(root,'documents',id));
}
