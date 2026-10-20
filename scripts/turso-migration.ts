import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from '@libsql/client';
import type { State } from '../src/lib/model';
import { decodeState, encodeState, getTursoDocument, putTursoDocument, setupTurso } from '../src/server/turso';

export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export type Snapshot = { state: State; raw: Buffer; documents: { id: string; bytes: Buffer; hash: string }[] };

export async function loadSnapshot(directory: string): Promise<Snapshot> {
  const raw = await readFile(path.join(directory, 'state.json'));
  const state = JSON.parse(raw.toString('utf8')) as State;
  if (!Number.isSafeInteger(state.version) || state.version < 0 ||
      !['documents', 'movements', 'products', 'audit', 'lossKeywords'].every(key => Array.isArray(state[key as keyof State]))) {
    throw new Error('O estado local não tem o formato esperado.');
  }
  const ids = new Set<string>();
  const documents: Snapshot['documents'] = [];
  for (const doc of state.documents) {
    if (!/^[a-f0-9-]{36}$/i.test(doc.id) || ids.has(doc.id)) throw new Error('ID de documento inválido ou repetido.');
    ids.add(doc.id);
    const bytes = await readFile(path.join(directory, 'documents', doc.id));
    const hash = sha256(bytes);
    if (bytes.length !== doc.size || hash !== doc.hash) throw new Error(`Integridade do documento ${doc.id} não confere.`);
    documents.push({ id: doc.id, bytes, hash });
  }
  return { state, raw, documents };
}

export async function backupSnapshot(snapshot: Snapshot, directory: string) {
  await mkdir(path.join(directory, 'documents'), { recursive: true });
  await writeFile(path.join(directory, 'state.json'), snapshot.raw, { flag: 'wx', mode: 0o600 });
  for (const doc of snapshot.documents) {
    await writeFile(path.join(directory, 'documents', doc.id), doc.bytes, { flag: 'wx', mode: 0o600 });
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({
    stateSha256: sha256(snapshot.raw),
    documents: snapshot.documents.map(({ id, hash, bytes }) => ({ id, sha256: hash, size: bytes.length })),
  }, null, 2), { flag: 'wx', mode: 0o600 });
}

async function verifyDocuments(client: Client, snapshot: Snapshot) {
  for (const doc of snapshot.documents) {
    if (sha256(await getTursoDocument(client, doc.id)) !== doc.hash) throw new Error(`Documento ${doc.id} difere no destino.`);
  }
}

export async function verifySnapshot(client: Client, snapshot: Snapshot) {
  const rows = await client.execute('SELECT data FROM hf_state WHERE id = 1');
  if (!rows.rows[0] || !encodeState(decodeState(rows.rows[0].data)).equals(encodeState(snapshot.state))) {
    throw new Error('O estado do destino difere da cópia local.');
  }
  await verifyDocuments(client, snapshot);
}

export async function migrateSnapshot(client: Client, snapshot: Snapshot, beforePublish?: () => Promise<void>) {
  await setupTurso(client);
  const current = await client.execute('SELECT data FROM hf_state WHERE id = 1');
  if (current.rows.length) {
    // Safe to repeat a completed migration, but never replace a different state.
    await verifySnapshot(client, snapshot);
    return;
  }
  // Each document is committed separately to stay within remote transaction timeouts.
  // Interrupted runs can resume; conflicting bytes cause verification to fail.
  for (const doc of snapshot.documents) await putTursoDocument(client, doc.id, doc.bytes);
  await verifyDocuments(client, snapshot);
  await beforePublish?.();
  const tx = await client.transaction('write');
  try {
    const existing = await tx.execute('SELECT id FROM hf_state WHERE id = 1');
    if (existing.rows.length) throw new Error('O destino foi alterado durante a migração. Nenhum estado foi substituído.');
    await tx.execute({ sql: 'INSERT INTO hf_state (id, data) VALUES (1, ?)', args: [encodeState(snapshot.state)] });
    await tx.commit();
  } finally {
    tx.close();
  }
  await verifySnapshot(client, snapshot);
}
