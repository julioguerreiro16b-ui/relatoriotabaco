import { normalizeState } from '@/lib/shipping';
import { kgFromUnits } from '@/lib/weights';
import { trustedReference } from '@/lib/historical-policy';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { baseIssues, matching, norm, reconcile } from '@/lib/domain';
import { fresh } from '@/lib/parsers';
import { SOURCES, type Movement, type State, type Category, type Audit } from '@/lib/model';
function audit(s:State, action:string,target:string,reason:string,before?:unknown,after?:unknown) { s.audit.push({id:randomUUID(),at:new Date().toISOString(),action,target,reason,before:structuredClone(before),after:structuredClone(after)}); }
const text = z.string().max(2000);
const editSchema = z.object({date:text,invoice:text,order:text,customer:text,recipient:text,state:text,shippingCountry:text.optional(),address:text,category:z.enum(['DRY_SNUFF','MAPACHO','']),kind:z.enum(['OPENING_STOCK','ENTRY','WHOLESALE_SALE','SITE_SALE','LOSS','MANUAL_ADJUSTMENT']),kg:z.number().finite().nullable(),sku:text,product:text,quantity:z.number().nonnegative().nullable(),unitGrams:z.number().positive().nullable(),site:text,transport:text,cargo:text,country:text,amount:z.number().nullable(),note:z.string().max(15000)});
export function action(state: State, payload: Record<string,unknown>) {
  const reason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0,2000) : '';
  const type = z.string().parse(payload.action);
  const target=state.movements.find(m=>m.id===payload.id);
  if(target?.historical&&['edit','ignore','distinct','merge'].includes(type))throw new Error('Histórico aceito como original; alterações desativadas.');
  if (type === 'checklist') {
    const unavailable = z.record(z.string(),z.boolean()).parse(payload.unavailable);
    const before = state.unavailable; state.unavailable = unavailable;
    audit(state,'Checklist','fontes','Disponibilidade informada pelo usuário',before,unavailable);
  } else if (type === 'commit') {
    if (!payload.confirmed) throw new Error('Confirme o checklist antes de processar.');
    for(const source of SOURCES.filter(s=>s.required)) if(!state.documents.some(d=>d.source===source.key) && !state.unavailable[source.key]) throw new Error(`Envie ${source.label} ou marque Arquivo não disponível.`);
    let count=0;
    for (const m of state.movements.filter(m=>m.status==='staged')) { m.status=m.issues.length?'pending':'accepted'; count++; }
    state.initialized=true; audit(state,'Processamento','lote',`${count} registros analisados; pendências excluídas dos cálculos`);
  } else if (type === 'edit') {
    if(!reason) throw new Error('Informe o motivo da correção.');
    const m=state.movements.find(m=>m.id===payload.id); if(!m) throw new Error('Registro não encontrado');
    const before=structuredClone(m); const fields=editSchema.parse(payload.fields);
    Object.assign(m,fields); m.state=normalizeState(m.state,m.shippingCountry);m.kg=kgFromUnits(m.quantity,m.unitGrams)??m.kg; m.issues=baseIssues(m);
    // Explicit acknowledgment preserves original numbers in audit, while all LB derive from KG.
    if(payload.confirmKg) m.issues=m.issues.filter(i=>!i.startsWith('Peso KG/LB'));
    if(payload.acceptMissingPair) m.issues=m.issues.filter(i=>!i.includes('sem Entry Summary')&&!i.includes('sem Invoice'));
    const match=state.movements.find(x=>matching(x,m));
    if(match) { m.relatedId=match.id; m.issues.push('Possível duplicidade: conciliar antes de contabilizar'); }
    else delete m.relatedId;
    if(m.kind==='OPENING_STOCK' && state.movements.some(x=>x.id!==m.id&&x.kind==='OPENING_STOCK'&&x.category===m.category&&x.status==='accepted')) m.issues.push('Já existe estoque inicial confirmado para este produto');
    m.status=m.issues.length?'pending':state.initialized?'accepted':'staged';
    if(payload.saveMapping && (m.sku||m.product) && m.category && m.unitGrams) {
      const existing=state.products.find(p=>m.sku?norm(p.sku)===norm(m.sku):norm(p.name)===norm(m.product));
      if(existing) { existing.category=m.category; existing.unitGrams=m.unitGrams; }
      else state.products.push({id:randomUUID(),sku:m.sku,name:m.product,category:m.category,unitGrams:m.unitGrams});
    }
    audit(state,'Correção manual',m.id,reason,before,m);
  } else if(type==='ignore') {
    if(!reason) throw new Error('Informe o motivo.');
    const m=state.movements.find(m=>m.id===payload.id);if(!m)throw new Error('Registro não encontrado');
    const before=structuredClone(m);m.status='ignored';audit(state,'Ignorar registro',m.id,reason,before,m);
  } else if(type==='distinct') {
    if(!reason)throw new Error('Informe por que são movimentações distintas.');
    const m=state.movements.find(m=>m.id===payload.id); if(!m?.relatedId)throw new Error('Conciliação não encontrada');
    const before=structuredClone(m);m.distinctFrom=[...(m.distinctFrom||[]),m.relatedId];delete m.relatedId;m.issues=baseIssues(m);m.status='pending';
    audit(state,'Movimentações distintas',m.id,reason,before,m);
  } else if(type==='merge') {
    if(!reason)throw new Error('Informe o motivo da conciliação.');
    const m=state.movements.find(m=>m.id===payload.id), other=state.movements.find(m=>m.id===payload.target);
    if(!m||!other||m.id===other.id||['ignored','duplicate'].includes(other.status))throw new Error('Escolha um registro ativo para conciliar.');
    if(m.category!==other.category || (m.kind==='ENTRY')!==(other.kind==='ENTRY'))throw new Error('Produtos ou tipos de movimentação incompatíveis.');
    const before={source:structuredClone(m),target:structuredClone(other)};
    if(payload.useIncoming && !other.historical) {
      if(m.kg===null)throw new Error('O documento não tem peso identificado.');
      other.kg=m.kg; other.quantity=m.quantity;other.unitGrams=m.unitGrams;
    }
    // Delivery date is only copied with an explicit user choice.
    if(payload.useDate && !other.historical && m.date)other.date=m.date;
    other.origins=[...other.origins,...m.origins.filter(o=>!other.origins.some(x=>JSON.stringify(x)===JSON.stringify(o)))];
    if(m.kind==='SITE_SALE'&&!other.historical) {other.kind='SITE_SALE';other.site=m.site;other.order=m.order||other.order;}
    m.status='duplicate';m.duplicateOf=other.id;delete m.relatedId;
    other.issues=baseIssues(other);other.status=other.historical?'accepted':'pending';
    audit(state,'Conciliação',other.id,reason,before,{source:m,target:other});
  } else if(type==='opening') {
    if(!reason)throw new Error('Informe a origem do estoque inicial.');
    const cat=z.enum(['DRY_SNUFF','MAPACHO']).parse(payload.category), when=z.string().parse(payload.date),kg=z.number().nonnegative().parse(payload.kg);
    if(state.movements.some(m=>m.category===cat&&m.kind==='OPENING_STOCK'&&!['ignored','duplicate'].includes(m.status)))throw new Error('Já existe uma contagem para este produto. Revise o registro existente.');
    const m=fresh({id:'manual',name:'Estoque inicial informado',source:'history',hash:'',size:0,mime:'',importedAt:new Date().toISOString(),sheets:[],batch:''},{category:cat,date:when,kg,kind:'OPENING_STOCK',note:reason,origins:[],historical:false});
    m.issues=baseIssues(m);m.status=m.issues.length?'pending':state.initialized?'accepted':'staged';state.movements.push(m);audit(state,'Estoque inicial',m.id,reason,undefined,m);
  } else if(type==='product') {
    const p=z.object({sku:z.string().min(1).max(150),name:text,category:z.enum(['DRY_SNUFF','MAPACHO','IGNORE']),unitGrams:z.number().positive()}).parse(payload.product);
    const existing=state.products.find(x=>norm(x.sku)===norm(p.sku));const before=existing?structuredClone(existing):undefined;
    if(existing)Object.assign(existing,p);else state.products.push({...p,id:randomUUID()});
    audit(state,'Mapeamento de produto',p.sku,reason||'Cadastro de produto',before,p);
  } else if(type==='settings') {
    const keywords=z.array(z.string().min(1).max(100)).max(30).parse(payload.keywords);
    const before=state.lossKeywords;state.lossKeywords=keywords;audit(state,'Regra de perdas','configurações',reason||'Regra aplicada somente às próximas importações',before,keywords);
  } else if(type==='reference') {
    if(!reason)throw new Error('Informe o motivo da decisão sobre o valor histórico.');
    const ref=state.references?.find(r=>r.id===payload.id);if(!ref)throw new Error('Referência histórica não encontrada');
    if(trustedReference(state,ref))throw new Error('Histórico aceito como original.');
    const before=structuredClone(ref);
    if(payload.category)ref.category=z.enum(['DRY_SNUFF','MAPACHO']).parse(payload.category);
    ref.ignored=payload.ignore===true;ref.reason=reason;
    audit(state,'Conferência histórica',ref.id,reason,before,ref);
  } else if(type==='restore') {
    if(!reason)throw new Error('Informe o motivo da restauração.');
    const previous=state.audit.find(a=>a.id===payload.id);
    if(!previous?.before||!['Correção manual','Ignorar registro','Movimentações distintas'].includes(previous.action))throw new Error('Esta alteração não permite restauração direta.');
    const m=state.movements.find(m=>m.id===previous.target);if(!m)throw new Error('Registro não encontrado');
    if(m.historical)throw new Error('Histórico preservado.');
    const before=structuredClone(m);Object.assign(m,structuredClone(previous.before));m.status='pending';m.issues=[...baseIssues(m),'Conferir registro restaurado antes de contabilizar'];
    audit(state,'Restauração',m.id,reason,before,m);
  } else throw new Error('Ação desconhecida');
}
