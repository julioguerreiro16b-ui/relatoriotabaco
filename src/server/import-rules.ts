import { randomUUID } from 'node:crypto';
import type { State } from '@/lib/model';
import { parsePDF, parseSpreadsheet } from '@/lib/parsers';
import { reconcile } from '@/lib/domain';
import { normalizeState } from '@/lib/shipping';
import { kgFromUnits } from '@/lib/weights';
import { getDocument } from './store';

// Explicit, versioned migration. Original documents and superseded PDF records remain stored.
export async function applyImportRules(state:State,readDocument=getDocument){
  if((state.importRulesVersion||0)>=1)return;
  const before=structuredClone(state.movements);
  for(const doc of state.documents.filter(d=>d.source==='history')){
    const originalDoc={...doc,sheets:[]};
    const parsed=await parseSpreadsheet(await readDocument(doc.id),originalDoc,state);
    doc.sheets=originalDoc.sheets;doc.historicalSheets=originalDoc.historicalSheets;
    // Keep record identifiers and original numeric values; only change acceptance policy.
    for(const m of state.movements.filter(m=>m.historical&&m.origins.some(o=>o.documentId===doc.id))){
      m.status='accepted';m.issues=[];delete m.relatedId;
    }
    const existing=state.references||[];
    const refs=parsed.references.map(r=>({...r,id:existing.find(x=>x.documentId===r.documentId&&x.sheet===r.sheet&&x.row===r.row&&x.category===r.category&&x.metric===r.metric)?.id||r.id,trusted:true}));
    state.references=[...existing.filter(r=>r.documentId!==doc.id),...refs];
  }
  const touched=new Set(state.audit.filter(a=>['Correção manual','Conciliação','Restauração','Movimentações distintas'].includes(a.action)).map(a=>a.target));
  let expanded=0;
  for(const doc of state.documents.filter(d=>['outgoing','loss'].includes(d.source)&&/\.pdf$/i.test(d.name))){
    const old=state.movements.filter(m=>m.origins.some(o=>o.documentId===doc.id));
    // Never overwrite a user decision or a document that already contains extracted item weights.
    if(!old.length||old.some(m=>m.historical||m.kg!==null||m.quantity!==null||touched.has(m.id)||!['pending','staged'].includes(m.status)))continue;
    const pages=new Map<number,string>();for(const m of old){const page=m.origins.find(o=>o.documentId===doc.id)?.page;if(page&&m.note)pages.set(page,m.note);}
    if(!pages.size)continue;
    const parsed=parsePDF([...pages].sort((a,b)=>a[0]-b[0]).map(([,text])=>({text,ocr:!!doc.extraction?.includes('OCR')})),doc);
    if(!parsed.movements.some(m=>m.quantity!==null&&m.unitGrams!==null))continue;
    for(const m of old){m.status='ignored';m.issues=[];}
    reconcile(state,parsed.movements);
    for(const m of parsed.movements)if(m.status!=='ignored')m.status=state.initialized?(m.issues.length?'pending':'accepted'):'staged';
    expanded+=parsed.movements.length;
  }
  for(const m of state.movements.filter(m=>!m.historical)){
    m.state=normalizeState(m.state,m.shippingCountry);
    m.issues=m.issues.filter(i=>i!=='Estado de entrega não identificado');
    if(!touched.has(m.id))m.kg=kgFromUnits(m.quantity,m.unitGrams)??m.kg;
    if(m.status==='pending'&&!m.issues.length)m.status=state.initialized?'accepted':'staged';
  }
  delete state.lastValidation;state.importRulesVersion=1;
  const changed=state.movements.filter(m=>{const prior=before.find(b=>b.id===m.id);return !prior||JSON.stringify(prior)!==JSON.stringify(m);});
  state.audit.push({id:randomUUID(),at:new Date().toISOString(),action:'Regras de importação atualizadas',target:'import-rules-v1',reason:`Solicitação do usuário: histórico aceito sem conferência; estados normalizados; ${expanded} itens extraídos por unidades × gramas.`,before:before.filter(m=>changed.some(c=>c.id===m.id)),after:changed});
}
