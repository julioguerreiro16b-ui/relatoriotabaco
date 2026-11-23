import type { State } from './model';
import { defaultFilters, filtered, type Filters, type Report } from './reports';
import { salesBySize, WOO_STORES, type SalesScope } from './sales';

export function salesCoverage(state: State, year: number, month: string) {
  const start=year+'-'+(month||'01')+'-01';
  const end=month?year+'-'+month+'-'+new Date(Date.UTC(year,Number(month),0)).getUTCDate():year+'-12-31';
  return WOO_STORES.map(store=>{
    const runs=(state.wooSyncs||[]).filter(r=>r.source===store.source&&r.end>=start&&r.start<=end);
    let cursor=Date.parse(start);
    for(const run of [...runs].sort((a,b)=>a.start.localeCompare(b.start))) {
      if(Date.parse(run.start)>cursor)break;
      cursor=Math.max(cursor,Date.parse(run.end)+86400000);
    }
    return {label:store.label,complete:cursor>Date.parse(end),latest:runs.at(-1)};
  });
}
export function salesCover(state: State, f: Filters, scope: SalesScope): Report {
  const moves=filtered(state.movements,{...defaultFilters,year:f.year,month:f.month,category:f.category});
  const data=salesBySize(moves,scope),coverage=salesCoverage(state,f.year,f.month);
  return {title:'Leia-me',columns:['Informação','Valor'],rows:[
    ['Relatório',scope==='florida'?'A: todas as vendas destinadas à Flórida':'B: todas as vendas destinadas aos EUA, incluindo Flórida; exclui Awiry e Tobacco Free'],
    ['Agrupamento','Rapés e mapachos separados; variedades e lojas somadas por tamanho em gramas.'],
    ['Período',f.year+(f.month?'-'+f.month:' (ano inteiro)')],
    ['Datas WooCommerce','Data de criação do pedido no fuso da loja. Os status escolhidos constam em cada captura.'],
    ['Quantidade','Unidades vendidas menos reembolsos com quantidades identificadas. Não equivale à confirmação física de expedição.'],
    ['Escopo','Vendas confirmadas de sites e arquivos manuais. Exclui entradas, perdas e totais históricos.'],
    ['Pendências fora do total',data.pending],
    ['Destino não identificado',data.unknownDestination],
    ['Itens Awiry / Tobacco Free excluídos',data.excluded],
    ['Cobertura',coverage.every(c=>c.complete)?'Há capturas cobrindo o período para as três lojas; confira a data de atualização.':'Cobertura automática incompleta; confira as lojas e arquivos manuais.'],
    ...coverage.map(c=>[c.label,c.complete?'Período coberto por capturas':'Período sem cobertura automática completa']),
    ...coverage.filter(c=>c.latest).map(c=>[c.label+' — última captura',c.latest!.at+'; status: '+c.latest!.statuses.join(', ')]),
    ['Gerado em',new Date().toISOString()],
  ]};
}
