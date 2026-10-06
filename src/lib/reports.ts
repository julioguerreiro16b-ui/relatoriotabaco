import { CATEGORIES, CATEGORY_LABEL, KIND_LABEL, MONTHS, type State, type Movement, type Category } from './model';
import { completeness, isFlorida, lb, monthly, monthlyLb, movementLb, type MonthlyMetric } from './domain';
import { normalizeState } from './shipping';
import { historyComparisons, REFERENCE_LABEL } from './history';
export interface Filters {year:number;month:string;category:string;search:string;state:string;site:string;kind:string;source:string;status:string}
export const defaultFilters:Filters={year:2026,month:'',category:'',search:'',state:'',site:'',kind:'',source:'',status:''};
export function filtered(movements:Movement[],f:Filters) {return movements.filter(m=>(!f.year||m.date.startsWith(String(f.year)))&&(!f.month||m.date.slice(5,7)===f.month)&&(!f.category||m.category===f.category)&&(!f.search||[m.customer,m.recipient,m.invoice,m.order,m.sku].join(' ').toLowerCase().includes(f.search.toLowerCase()))&&(!f.state||m.state.toLowerCase()===f.state.toLowerCase())&&(!f.site||m.site===f.site)&&(!f.kind||m.kind===f.kind)&&(!f.source||m.origins.some(o=>o.source===f.source))&&(!f.status||m.status===f.status));}
export interface Report {title:string;columns:string[];rows:(string|number|null)[][]}
export function floridaRows(movements:Movement[],category:Category) {
  const grouped=new Map<string, {date:string;units:Record<string,number>;kg:number;missing:number;records:Movement[]}>();
  for(const m of movements.filter(m=>!m.historical&&m.category===category&&isFlorida(m.state)&&['WHOLESALE_SALE','SITE_SALE'].includes(m.kind))) {
    const row=grouped.get(m.date)||{date:m.date,units:{},kg:0,missing:0,records:[]};
    row.records.push(m);
    if(m.quantity!==null&&m.unitGrams!==null) {const key=`${m.unitGrams}g${m.site==='Haux Haux'&&[10,20].includes(m.unitGrams)?' - Haux':''}`;row.units[key]=(row.units[key]||0)+m.quantity;row.kg+=m.quantity*m.unitGrams/1000;}
    else row.missing++;
    grouped.set(m.date,row);
  }
  return [...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function buildReports(state:State,f:Filters):Record<string,Report> {
  const moves=filtered(state.movements.filter(m=>m.status==='accepted'),f);
  const cats=CATEGORIES.filter(c=>!f.category||f.category===c);
  const movement=(title:string,items:Movement[],entry=false):Report=>({title,columns:['Produto','Mês/Ano','Data', 'Invoice','Pedido','Cliente','Destinatário','Estado de entrega','Canal','Site',...(entry?['Transporte','Cargo/Courier','Origem']:[]),'KG','LB','Registro'],rows:items.map(m=>[m.category?CATEGORY_LABEL[m.category]:'Não classificado',m.date.slice(0,7),m.date,m.invoice,m.order,m.customer,m.recipient,normalizeState(m.state,m.shippingCountry),KIND_LABEL[m.kind],m.site,...(entry?[m.transport,m.cargo,m.country]:[]),m.kg,movementLb(m),m.id])});
  const reports:Record<string,Report>={outgoing:movement(`Saídas ${f.year}`,moves.filter(m=>['WHOLESALE_SALE','SITE_SALE','LOSS'].includes(m.kind))),incoming:movement(`Entradas ${f.year}`,moves.filter(m=>m.kind==='ENTRY'),true)};
  reports.balance={title:'Balanço Entrada x Saída',columns:['Produto','Mês','Entrada KG','Entrada LB','Saída KG','Saída LB','Balanço KG','Balanço LB'],rows:[]};
  reports.summary={title:'Resumo Mensal',columns:['Produto','Mês','Estoque Inicial KG','Estoque Inicial LB','Entradas KG','Entradas LB','Saídas Atacado KG','Saídas Atacado LB','Saídas Sites KG','Saídas Sites LB','Saídas Perda KG','Saídas Perda LB','Ajustes KG','Ajustes LB','Estoque Final KG','Estoque Final LB','Observação'],rows:[]};
  for(const cat of cats) for(const row of monthly(state,cat,f.year).filter(r=>!f.month||r.month.slice(5)===f.month)) {
    const out=row.wholesale+row.sites+row.losses;
    const b=row.balanceOriginal;reports.balance.rows.push(b?[CATEGORY_LABEL[cat],row.month,b.entries,b.entriesLb,b.outgoing,b.outgoingLb,b.balance,b.balanceLb]:[CATEGORY_LABEL[cat],row.month,row.entries,lb(row.entries),out,lb(out),row.entries-out,lb(row.entries-out)]);
    reports.summary.rows.push([CATEGORY_LABEL[cat],row.month,...(['opening','entries','wholesale','sites','losses','adjustments','closing'] as MonthlyMetric[]).flatMap(key=>[row[key],monthlyLb(row,key)]),row.historical?'Histórico original aceito':row.partial?'Período parcial: contagem dentro do mês':row.closing===null?'Estoque inicial não confirmado':row.closing<0?'ESTOQUE NEGATIVO':'']);
  }
  const sizes=['500g','250g','100g','5g','10g','20g','50g','10g - Haux','20g - Haux'];
  for(const cat of cats)for(const r of floridaRows(moves,cat))for(const size of Object.keys(r.units))if(!sizes.includes(size))sizes.push(size);
  reports.florida={title:'Vendas Flórida',columns:['Produto','Data',...sizes,'KG por gramatura','LB por gramatura','Registros sem gramatura'],rows:cats.flatMap(cat=>floridaRows(moves,cat).map(r=>[CATEGORY_LABEL[cat],r.date,...sizes.map(s=>r.units[s]||0),r.kg,lb(r.kg),r.missing]))};
  reports.review={title:'Revisar Dados',columns:['Produto','Data','Invoice/Pedido','Cliente','KG','Status','Problemas','Arquivo','Registro'],rows:state.movements.filter(m=>m.status!=='accepted').filter(m=>!f.status||f.status===m.status).map(m=>[m.category?CATEGORY_LABEL[m.category]:'Não classificado',m.date,m.invoice||m.order,m.customer,m.kg,({pending:'Pendente',staged:'Aguardando processamento',ignored:'Ignorado',duplicate:'Conciliado'} as Record<string,string>)[m.status],m.issues.join('; '),m.origins.map(o=>o.file).join('; '),m.id])};
  const negative=cats.flatMap(cat=>monthly(state,cat,f.year).filter(r=>!r.historical&&r.closing!==null&&r.closing<0).map(r=>`${CATEGORY_LABEL[cat]} ${r.month}: estoque negativo`));
  reports.audit={title:'Auditoria',columns:['Data','Ação','Registro','Motivo','Antes','Depois'],rows:state.audit.map(a=>[a.at,a.action,a.target,a.reason,JSON.stringify(a.before)||'',JSON.stringify(a.after)||''])};
  const history=historyComparisons(state);
  reports.history={title:'Conciliação histórica',columns:['Produto','Mês','Métrica','Histórico KG','Calculado KG','Diferença KG','Conversão KG/LB','Status','Aba','Linha','Motivo'],rows:history.map(c=>[c.ref.category?CATEGORY_LABEL[c.ref.category]:'Revisar classificação',c.ref.month,REFERENCE_LABEL[c.ref.metric],c.ref.kg,c.calculated,c.difference,c.status==='Histórico aceito'?'Não verificado':c.conversionMismatch?'Inconsistente':'OK',c.status,c.ref.sheet,c.ref.row,c.ref.reason||''])};
  reports.cover={title:'Leia-me',columns:['Informação','Valor'],rows:[['Situação',completeness(state).length||negative.length||history.some(c=>c.status==='Pendente')?'DADOS INCOMPLETOS':'Sem pendências detectadas'],['Ano',f.year],['Gerado em',new Date().toISOString()],['Conversão','1 KG = 2.20462262185 LB'],['Regras','Somente registros confirmados. Produtos separados. Resumo e balanço mantêm o estoque completo; filtros de cliente/canal se aplicam às movimentações.'],...completeness(state).map(x=>['Pendência',x]),...negative.map(x=>['Alerta',x]),['Divergências históricas',history.filter(c=>c.status==='Pendente').length]]};
  return reports;
}
