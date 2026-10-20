import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { emptyState } from '../src/lib/model';
import { setupTurso, updateTursoState, readTursoState, getTursoDocument } from '../src/server/turso';
import { loadSnapshot, migrateSnapshot, verifySnapshot, sha256, type Snapshot } from '../scripts/turso-migration';

function fixture(): Snapshot {
  const state = emptyState();
  const bytes = Buffer.from([0, 255, 128, 13, 10, 42]);
  const doc = { id: randomUUID(), bytes, hash: sha256(bytes) };
  state.version = 42;
  state.lossKeywords = ['perda', 'ação'];
  state.documents = [{
    id: doc.id, hash: doc.hash, size: bytes.length, name: 'original.pdf', mime: 'application/pdf',
    importedAt: new Date().toISOString(), source: 'history', sheets: [], batch: randomUUID(),
  }];
  return { state, raw: Buffer.from(JSON.stringify(state)), documents: [doc] };
}

test('Turso preserves state and binary documents; migration never overwrites different data', async () => {
  const client = createClient({ url: ':memory:' });
  try {
    const snapshot = fixture();
    await migrateSnapshot(client, snapshot);
    await verifySnapshot(client, snapshot);
    assert.deepEqual(await getTursoDocument(client, snapshot.documents[0].id), snapshot.documents[0].bytes);
    assert.equal((await readTursoState(client)).version, 42);
    await migrateSnapshot(client, snapshot);
    await updateTursoState(client, state => { state.lossKeywords.push('new'); }, 42);
    await assert.rejects(migrateSnapshot(client, snapshot), /difere/);
    assert.equal((await readTursoState(client)).version, 43);
  } finally { client.close(); }
});

test('failed updates roll back and stale versions cannot overwrite state', async () => {
  const client = createClient({ url: ':memory:' });
  try {
    await setupTurso(client);
    const start = await readTursoState(client);
    await assert.rejects(updateTursoState(client, state => {
      state.lossKeywords = ['bad'];
      throw new Error('abort');
    }), /abort/);
    assert.deepEqual(await readTursoState(client), start);
    await updateTursoState(client, state => { state.lossKeywords = ['valid']; }, start.version);
    await assert.rejects(updateTursoState(client, state => { state.lossKeywords = ['bad']; }, start.version), /outra sessão/);
    assert.deepEqual((await readTursoState(client)).lossKeywords, ['valid']);
  } finally { client.close(); }
});

test('conflicting document bytes prevent publication of migrated state', async () => {
  const client = createClient({ url: ':memory:' });
  try {
    const snapshot = fixture();
    await setupTurso(client);
    await client.execute({ sql: 'INSERT INTO hf_documents(id, bytes) VALUES (?, ?)', args: [snapshot.documents[0].id, Buffer.from('wrong')] });
    await assert.rejects(migrateSnapshot(client, snapshot), /difere/);
    assert.equal((await client.execute('SELECT id FROM hf_state')).rows.length, 0);
  } finally { client.close(); }
});

test('changed source prevents publication and an interrupted transfer can resume', async () => {
  const client = createClient({ url: ':memory:' });
  try {
    const snapshot = fixture();
    await assert.rejects(migrateSnapshot(client, snapshot, async () => { throw new Error('source changed'); }), /source changed/);
    assert.equal((await client.execute('SELECT id FROM hf_state')).rows.length, 0);
    await migrateSnapshot(client, snapshot);
    await verifySnapshot(client, snapshot);
  } finally { client.close(); }
});

test('preflight rejects corrupt or missing local documents', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hf-turso-test-'));
  try {
    const snapshot = fixture();
    await mkdir(path.join(directory, 'documents'));
    await writeFile(path.join(directory, 'state.json'), snapshot.raw);
    await assert.rejects(loadSnapshot(directory), /ENOENT/);
    await writeFile(path.join(directory, 'documents', snapshot.documents[0].id), Buffer.from('wrong'));
    await assert.rejects(loadSnapshot(directory), /Integridade/);
    await writeFile(path.join(directory, 'documents', snapshot.documents[0].id), snapshot.documents[0].bytes);
    assert.equal((await loadSnapshot(directory)).state.version, 42);
  } finally {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('hf-turso-test-')) {
      throw new Error('Unexpected temporary directory.');
    }
    await rm(resolved, { recursive: true, force: true });
  }
});
