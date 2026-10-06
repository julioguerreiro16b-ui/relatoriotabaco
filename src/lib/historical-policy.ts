import type { Category, HistoricalReference, State } from './model';
export function trustedReference(state:State,ref:HistoricalReference){return ref.trusted===true||state.documents.some(d=>d.id===ref.documentId&&d.source==='history');}
export function historicalCutoff(state:State,category:Category){
  return (state.references||[]).filter(r=>r.category===category&&r.metric==='closing'&&trustedReference(state,r)).map(r=>r.month).sort().at(-1)||'';
}
