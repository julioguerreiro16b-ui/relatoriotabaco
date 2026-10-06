import { MONTHS, type HistoricalReference, type State } from './model';
import { monthly, lb, norm, isFlorida } from './domain';
import { trustedReference } from './historical-policy';
export const REFERENCE_LABEL:Record<HistoricalReference['metric'],string>={opening:'Estoque inicial',entries:'Entradas',wholesale:'Saídas atacado',sites:'Saídas sites',losses:'Perdas',closing:'Estoque final',outgoing:'Saídas totais',balance:'Balanço do mês',florida:'Vendas Flórida'};
export function parseMonth(v:unknown):string {
  if(v instanceof Date)return v.toISOString().slice(0,7);
  const s=norm(v),year=s.match(/\b(20\d{2})\b/)?.[1];if(!year)return '';
  const english=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const index=MONTHS.findIndex((m,i)=>s.includes(norm(m))||s.includes(english[i]));
  if(index>=0)return `${year}-${String(index+1).padStart(2,'0')}`;
  const iso=s.match(/^(20\d{2})-(\d{2})/);return iso?`${iso[1]}-${iso[2]}`:'';
}
export function historyComparisons(state:State) {
  return (state.references||[]).map(ref=>{
    if(trustedReference(state,ref))return {ref,calculated:null,difference:null,conversionMismatch:false,status:'Histórico aceito'};
    let calculated:number|null=null;
    if(ref.category) {
      const month=monthly(state,ref.category,Number(ref.month.slice(0,4)))[Number(ref.month.slice(5))-1];
      if(month) {
        if(ref.metric==='outgoing')calculated=month.wholesale+month.sites+month.losses;
        else if(ref.metric==='balance')calculated=month.entries-month.wholesale-month.sites-month.losses;
        else if(ref.metric==='florida')calculated=state.movements.filter(m=>m.status==='accepted'&&m.category===ref.category&&m.date.startsWith(ref.month)&&isFlorida(m.state)&&['WHOLESALE_SALE','SITE_SALE'].includes(m.kind)).reduce((n,m)=>n+(m.quantity!==null&&m.unitGrams!==null?m.quantity*m.unitGrams/1000:0),0);
        else calculated=month[ref.metric];
      }
    }
    const conversionMismatch=ref.originalLb!==null&&Math.abs(ref.originalLb-lb(ref.kg))>.005;
    const difference=calculated===null?null:calculated-ref.kg;
    const status=ref.ignored?'Ignorado':calculated===null||difference===null||Math.abs(difference)>.0005||conversionMismatch?'Pendente':'Conferido';
    return {ref,calculated,difference,conversionMismatch,status};
  });
}
