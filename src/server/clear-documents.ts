import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { baseIssues } from '@/lib/domain';
import type { State } from '@/lib/model';

export function clearDocuments(state: State, payload: Record<string, unknown>) {
  if (payload.confirmed !== true) throw new Error('Confirme a limpeza dos arquivos.');
  const ids = new Set(z.array(z.string().min(1)).min(1).parse(payload.documentIds));
  if ([...ids].some(id => !state.documents.some(d => d.id === id))) throw new Error('A lista de arquivos mudou. Atualize a página.');
  const documents = state.documents.filter(d => ids.has(d.id));
  const before = structuredClone({ documents, movements: state.movements, references: state.references, unavailable: state.unavailable });
  const removed = new Set(state.movements.filter(m => m.origins.length > 0 && m.origins.every(o => ids.has(o.documentId))).map(m => m.id));
  state.movements = state.movements.filter(m => !removed.has(m.id));
  for (const m of state.movements) {
    const touched = m.origins.some(o => ids.has(o.documentId));
    const broken = !!((m.relatedId && removed.has(m.relatedId)) || (m.duplicateOf && removed.has(m.duplicateOf)));
    if (touched) m.origins = m.origins.filter(o => !ids.has(o.documentId));
    if (m.relatedId && removed.has(m.relatedId)) delete m.relatedId;
    if (m.duplicateOf && removed.has(m.duplicateOf)) delete m.duplicateOf;
    if (m.distinctFrom) m.distinctFrom = m.distinctFrom.filter(id => !removed.has(id));
    if (touched || broken) {
      // A merged value may have come from the removed file: never retain it as confirmed.
      m.historical = false;
      m.status = 'pending';
      m.issues = [...baseIssues(m), 'Conferir valores e conciliação: um arquivo vinculado foi removido'];
    }
  }
  state.documents = state.documents.filter(d => !ids.has(d.id));
  state.wooSyncs = state.wooSyncs?.filter(run => !ids.has(run.documentId));
  state.references = (state.references || []).filter(r => !ids.has(r.documentId));
  for (const d of documents) if (!state.documents.some(other => other.source === d.source)) state.unavailable[d.source] = false;
  delete state.lastValidation;
  if (!state.documents.length) state.initialized = false;
  state.audit.push({ id: randomUUID(), at: new Date().toISOString(), action: 'Limpeza de arquivos', target: [...ids].join(','), reason: 'Correção de envio: ' + documents.length + ' arquivo(s) retirado(s) da análise. Cadastros e registros manuais preservados.', before, after: { documentIds: [...ids], removedMovements: [...removed] } });
  // Original bytes stay in private storage for audit; downloads require an active document.
}
