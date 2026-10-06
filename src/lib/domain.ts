import { CATEGORIES, type Category, type Movement, type State, type Status } from './model';
import { normalizeState } from './shipping';
import { kgFromUnits } from './weights';
import { trustedReference } from './historical-policy';
export const LB_PER_KG = 2.20462262185;
export const lb = (kg: number) => kg * LB_PER_KG;
export const fmt = (n: number | null) => n === null ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n);
export const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const isFlorida = (state: string) => normalizeState(state)==='FL';
export const movementLb=(m:Movement)=>m.historical?m.originalLb??null:m.kg===null?null:lb(m.kg);
export const signed = (m: Movement) => (['WHOLESALE_SALE', 'SITE_SALE', 'LOSS'].includes(m.kind) ? -1 : 1) * (m.kg ?? 0);
export const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export function baseIssues(m: Movement): string[] {
  if(m.historical)return [];
  const issues: string[] = [];
  if (!m.category) issues.push('REVISAR CLASSIFICAÇÃO');
  if (!validDate(m.date)) issues.push('Data não identificada ou inconsistente');
  if (m.kg === null || !Number.isFinite(m.kg) || (m.kg < 0 && m.kind !== 'MANUAL_ADJUSTMENT')) issues.push('Peso não identificado ou inválido');
  if (!['OPENING_STOCK', 'MANUAL_ADJUSTMENT'].includes(m.kind)) {
    if (!m.invoice && !m.order) issues.push('Invoice ou pedido não identificado');
    if (!m.recipient) issues.push('Destinatário não identificado');
  }
  if (m.originalLb !== undefined && m.kg !== null && Math.abs(m.originalLb - lb(m.kg)) > 0.005) issues.push('Peso KG/LB inconsistente; confirmar KG como referência');
  if (m.quantity !== null && m.unitGrams !== null && m.kg !== null && Math.abs(m.kg - m.quantity * m.unitGrams / 1000) > 0.000001) issues.push('Peso difere de quantidade × gramatura');
  if (m.kind === 'SITE_SALE' && (!m.quantity || !m.unitGrams)) issues.push('Quantidade ou gramatura não identificada');
  if (m.kind === 'ENTRY') {
    if (!m.origins.some(o => o.source === 'entry')) issues.push('Invoice sem Entry Summary');
    if (!m.origins.some(o => ['incoming', 'history'].includes(o.source))) issues.push('Entry Summary sem Invoice');
  }
  return issues;
}
const sale = (m: Movement) => ['WHOLESALE_SALE', 'SITE_SALE', 'LOSS'].includes(m.kind);
export function matching(a: Movement, b: Movement): 'exact' | 'possible' | null {
  if(a.historical&&b.historical)return null;
  if (a.id === b.id || a.category !== b.category || a.status === 'ignored' || a.status === 'duplicate' || a.distinctFrom?.includes(b.id) || b.distinctFrom?.includes(a.id)) return null;
  if ((a.kind === 'ENTRY') !== (b.kind === 'ENTRY') || (sale(a) !== sale(b))) return null;
  if (a.kind === 'OPENING_STOCK' || b.kind === 'OPENING_STOCK') return a.kind === b.kind ? 'possible' : null;
  // A product line and an invoice total are only candidates for manual reconciliation.
  const sameId = (a.invoice && b.invoice && norm(a.invoice) === norm(b.invoice)) || (a.order && b.order && norm(a.order) === norm(b.order));
  if (sameId) {
    if (a.sku && b.sku && norm(a.sku) !== norm(b.sku)) return null;
    return a.sku === b.sku && a.kg === b.kg && a.date === b.date && a.kind === b.kind && a.quantity === b.quantity && a.state === b.state ? 'exact' : 'possible';
  }
  if (a.date && a.date === b.date && a.customer && norm(a.customer) === norm(b.customer) && a.kg === b.kg && (a.kg ?? 0) > 0) return 'possible';
  return null;
}
export function reconcile(state: State, incoming: Movement[]) {
  for (const m of incoming) {
    if(m.historical){m.status='accepted';m.issues=[];delete m.relatedId;state.movements.push(m);continue;}
    m.state=normalizeState(m.state,m.shippingCountry);
    const map = state.products.find(p => (m.sku && norm(p.sku) === norm(m.sku)) || (!m.sku && m.product && norm(p.name) === norm(m.product)));
    if (map) {
      if (map.category === 'IGNORE') { m.status = 'ignored'; state.movements.push(m); continue; }
      m.category = map.category; m.unitGrams = map.unitGrams;
      if (m.quantity !== null) m.kg = kgFromUnits(m.quantity,map.unitGrams);
    }
    const special = m.issues.filter(i => i.startsWith('Conferir') || i.startsWith('PDF') || i.startsWith('Formato'));
    m.issues = [...new Set([...baseIssues(m), ...special])];
    const other = state.movements.find(x => matching(x, m));
    if (other) {
      m.relatedId = other.id;
      m.issues.push(other.kg !== m.kg ? `CONFLITO DE DADOS: atual ${other.kg ?? 'não identificado'} KG; encontrado ${m.kg ?? 'não identificado'} KG` : 'Possível duplicidade: conciliar antes de contabilizar');
    }
    state.movements.push(m);
  }
}
export function completeness(state: State): string[] {
  const issues: string[] = [];
  for (const s of ['history', 'outgoing', 'incoming', 'entry', 'sacred', 'haux', 'natural', 'loss']) {
    if (!state.documents.some(d => d.source === s)) issues.push(`Fonte ausente: ${s}`);
  }
  for (const cat of CATEGORIES) if (!state.movements.some(m => m.category === cat && m.kind === 'OPENING_STOCK' && m.status === 'accepted') && !state.references?.some(r=>r.category===cat&&r.metric==='closing'&&trustedReference(state,r))) issues.push(`Estoque inicial não confirmado: ${cat}`);
  if (state.movements.some(m => ['pending', 'staged'].includes(m.status))) issues.push('Existem registros aguardando revisão');
  if (state.movements.some(m => !m.historical && m.status === 'accepted' && m.kind === 'ENTRY' && (!m.origins.some(o=>o.source==='entry') || !m.origins.some(o=>['incoming','history'].includes(o.source))))) issues.push('Entradas confirmadas sem o par completo de documentos');
  if (state.movements.some(m => !m.historical && m.status === 'accepted' && isFlorida(m.state) && ['WHOLESALE_SALE','SITE_SALE'].includes(m.kind) && (m.quantity === null || m.unitGrams === null))) issues.push('Vendas na Flórida sem quantidade ou gramatura');
  return issues;
}
export type MonthlyMetric='opening'|'entries'|'wholesale'|'sites'|'losses'|'adjustments'|'closing';
export interface Monthly { month: string; opening: number | null; entries: number; wholesale: number; sites: number; losses: number; adjustments: number; closing: number | null; partial: boolean;historical?:boolean;originalLb?:Partial<Record<MonthlyMetric,number|null>>;referenceIds?:string[];balanceOriginal?:{entries:number;entriesLb:number|null;outgoing:number;outgoingLb:number|null;balance:number;balanceLb:number|null} }
export const monthlyLb=(r:Monthly,key:MonthlyMetric)=>r.originalLb&&key in r.originalLb?r.originalLb[key]??null:r[key]===null?null:lb(r[key] as number);
export function monthly(state: State, category: Category, year: number): Monthly[] {
  const all = state.movements.filter(m => m.status === 'accepted' && m.category === category && validDate(m.date));
  const anchor = all.filter(m => m.kind === 'OPENING_STOCK').sort((a,b) => a.date.localeCompare(b.date))[0];
  const trusted=(state.references||[]).filter(r=>r.category===category&&trustedReference(state,r));
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i+1).padStart(2,'0')}`, start = month + '-01';
    const next = i === 11 ? `${year+1}-01-01` : `${year}-${String(i+2).padStart(2,'0')}-01`;
    const applicable = all.filter(m => m.kind !== 'OPENING_STOCK' && (!anchor || m.date >= anchor.date));
    // Flows before the stock anchor remain reportable, although their balances are unknown.
    const current = all.filter(m => m.kind !== 'OPENING_STOCK' && m.date >= start && m.date < next && (!anchor || anchor.date >= next || m.date >= anchor.date));
    const sum = (kind: string) => current.filter(m => m.kind === kind).reduce((n,m) => n + (m.kg ?? 0), 0);
    const partial = !!anchor && anchor.date > start && anchor.date < next;
    const known = !!anchor && anchor.date < next;
    let opening = known ? (anchor.kg ?? 0) + applicable.filter(m => m.date < start).reduce((n,m) => n + signed(m), 0) : null;
    const prior=trusted.filter(r=>r.metric==='closing'&&r.month<month).sort((a,b)=>b.month.localeCompare(a.month))[0];
    if(prior)opening=prior.kg+all.filter(m=>m.kind!=='OPENING_STOCK'&&m.date.slice(0,7)>prior.month&&m.date<start).reduce((n,m)=>n+signed(m),0);
    const result:Monthly={month,opening,entries:sum('ENTRY'),wholesale:sum('WHOLESALE_SALE'),sites:sum('SITE_SALE'),losses:sum('LOSS'),adjustments:sum('MANUAL_ADJUSTMENT'),closing:opening===null?null:opening+current.reduce((n,m)=>n+signed(m),0),partial};
    const refs=trusted.filter(r=>r.month===month);
    if(refs.length){
      result.historical=true;result.partial=false;result.originalLb={};result.referenceIds=refs.map(r=>r.id);
      for(const metric of ['opening','entries','wholesale','sites','losses','closing'] as MonthlyMetric[]){
        const ref=refs.find(r=>r.metric===metric&&norm(r.sheet).includes('resumo'))||refs.find(r=>r.metric===metric);
        if(ref){result[metric]=ref.kg;result.originalLb[metric]=ref.originalLb;}
      }
      const balanceRefs=refs.filter(r=>norm(r.sheet).includes('balanco'));
      const entries=balanceRefs.find(r=>r.metric==='entries'),out=balanceRefs.find(r=>r.metric==='outgoing'),balance=balanceRefs.find(r=>r.metric==='balance');
      if(entries&&out&&balance)result.balanceOriginal={entries:entries.kg,entriesLb:entries.originalLb,outgoing:out.kg,outgoingLb:out.originalLb,balance:balance.kg,balanceLb:balance.originalLb};
    }
    return result;
  });
}
export function contributions(state: State, category: Category, month: string, metric: keyof Monthly): Movement[] {
  const all = state.movements.filter(m => m.status === 'accepted' && m.category === category);
  const anchor = all.find(m => m.kind === 'OPENING_STOCK');
  const usable = all.filter(m => !anchor || m.date >= anchor.date);
  if (metric === 'opening') return usable.filter(m => m.date < month + '-01' || (m.kind === 'OPENING_STOCK' && m.date.startsWith(month)));
  if (metric === 'closing') return usable.filter(m => m.date.slice(0,7) <= month);
  const type = { entries: 'ENTRY', wholesale: 'WHOLESALE_SALE', sites: 'SITE_SALE', losses: 'LOSS', adjustments: 'MANUAL_ADJUSTMENT' }[metric as string];
  return usable.filter(m => m.date.startsWith(month) && m.kind === type);
}
export function setStatus(m: Movement, status: Status) { m.status = status; }
