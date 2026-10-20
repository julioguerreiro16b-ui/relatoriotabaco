import { loadEnvFile } from 'node:process';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTursoClient } from '../src/server/turso';
import { backupSnapshot, loadSnapshot, migrateSnapshot, sha256, verifySnapshot } from './turso-migration';

async function main() {
  for (const file of ['.env.local', '.env']) {
    try { loadEnvFile(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const args = process.argv.slice(2);
  const allowed = new Set(['--dry-run', '--verify', '--output']);
  let output: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Argumento desconhecido: ${args[i]}`);
    if (args[i] === '--output') {
      output = args[++i];
      if (!output || output.startsWith('--')) throw new Error('Informe o caminho SQLite após --output.');
    }
  }
  if (args.includes('--dry-run') && (output || args.includes('--verify'))) throw new Error('Use --dry-run sozinho.');
  const directory = path.resolve(process.env.HF_LOCAL_DATA_DIR || '.data');
  const snapshot = await loadSnapshot(directory);
  console.log(JSON.stringify({
    source: directory, version: snapshot.state.version, movements: snapshot.state.movements.length,
    documents: snapshot.documents.length, stateSha256: sha256(snapshot.raw),
    documentBytes: snapshot.documents.reduce((sum, doc) => sum + doc.bytes.length, 0),
  }, null, 2));
  if (args.includes('--dry-run')) {
    console.log('Pré-verificação concluída. Nenhum dado enviado.');
    return;
  }
  if (output) {
    output = path.resolve(output);
    await mkdir(path.dirname(output), { recursive: true });
  }
  const client = output ? createTursoClient(pathToFileURL(output).href) : createTursoClient();
  try {
    if (args.includes('--verify')) {
      await verifySnapshot(client, snapshot);
      console.log('Estado e SHA-256 de todos os documentos conferidos.');
      return;
    }
    const backup = path.join(directory, 'backups', `turso-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await backupSnapshot(snapshot, backup);
    console.log(`Backup criado: ${backup}`);
    await migrateSnapshot(client, snapshot, async () => {
      const latest = await readFile(path.join(directory, 'state.json'));
      if (!latest.equals(snapshot.raw)) throw new Error('Os dados locais mudaram. Pare as gravações e execute novamente em um destino vazio.');
    });
    if (output) {
      await client.execute('PRAGMA journal_mode = WAL');
      await client.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    }
    console.log(output
      ? `Cópia SQLite conferida: ${output}. Nenhum dado enviado à nuvem.`
      : 'Migração para Turso concluída. Estado e SHA-256 de todos os documentos conferidos.');
  } finally {
    client.close();
  }
}

main().catch(error => {
  // Do not print request URLs, tokens, or query parameters from SDK errors.
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Falha de acesso ao banco ou arquivo. Verifique conexão, credenciais e caminhos.');
  process.exitCode = 1;
});
