'use client';
import { CATEGORIES, type Movement, type State } from '@/lib/model';
import { fmt, lb } from '@/lib/domain';
import { salesBySize, type SalesScope } from '@/lib/sales';
import { filtered, defaultFilters, type Filters } from '@/lib/reports';
import { Empty } from './shared';
import { salesCoverage } from '@/lib/sales-cover';

export default function SalesReport({state,filters,scope,onOrigin}:{state:State;filters:Filters;scope:SalesScope;onOrigin:(m:Movement)=>void}) {
  const selection=filtered(state.movements,{...defaultFilters,year:filters.year,month:filters.month,category:filters.category});
  const report=salesBySize(selection,scope);
  const coverage=salesCoverage(state,filters.year,filters.month);
  return <>
    <div className="info-box">{scope==='florida'?'A · Todas as vendas com destino à Flórida, agrupadas por tamanho.':'B · Todas as vendas com destino aos Estados Unidos, incluindo a Flórida, agrupadas por tamanho. Awiry e Tobacco Free excluídos.'} Tipos e variedades são somados dentro de cada tamanho; rapés e mapachos permanecem separados.</div>
    <p className="muted">Inclui vendas confirmadas dos sites e arquivos manuais, sem entradas, perdas ou totais históricos. O período do WooCommerce usa a data do pedido.</p>
    <div className="sales-metrics"><div><span>Unidades contabilizadas</span><strong>{report.rows.reduce((n,r)=>n+r.units,0).toLocaleString('pt-BR')}</strong></div><div><span>Peso total</span><strong>{fmt(report.rows.reduce((n,r)=>n+r.kg,0))} KG</strong></div><div><span>Itens pendentes</span><strong>{report.pending+report.unknownDestination}</strong></div>{scope==='usa'&&<div><span>Itens Awiry / Tobacco Free excluídos</span><strong>{report.excluded}</strong></div>}</div>
    {!!(report.pending+report.unknownDestination)&&<p className="error-box">{report.pending} item(ns) sem confirmação, classificação ou tamanho e {report.unknownDestination} com destino não identificado. Esses itens não entram nos totais; confira em Revisar dados.</p>}
    <details className="sales-coverage"><summary>{coverage.every(c=>c.complete)?'Cobertura das lojas no período':'Cobertura automática incompleta — conferir lojas'}</summary>{coverage.map(c=><p key={c.label}><strong>{c.label}:</strong> {c.complete?'Período coberto por capturas.':'Período sem captura completa.'} {c.latest?'Última atualização: '+new Date(c.latest.at).toLocaleString('pt-BR')+' · '+c.latest.statuses.map(s=>s==='completed'?'concluídos':'processando').join(', '):'Importe a loja ou confira os arquivos enviados manualmente.'}</p>)}</details>
    {CATEGORIES.filter(c=>!filters.category||filters.category===c).map(category=>{
      const rows=report.rows.filter(r=>r.category===category);
      return <section className="panel" key={category}><div className="section-heading"><h2>{category==='DRY_SNUFF'?'Rapés (Dry Snuff)':'Mapachos'} · {scope==='florida'?'Flórida':'EUA'}</h2><span className="muted">Unidades por tamanho</span></div>{rows.length?<div className="table-scroll"><table><thead><tr><th>Tamanho</th><th className="numeric">Unidades</th><th className="numeric">KG</th><th className="numeric">LB</th><th>Origem</th></tr></thead><tbody>{rows.map(r=><tr key={r.grams}><td><strong>{r.grams} g</strong></td><td className="numeric">{r.units.toLocaleString('pt-BR')}</td><td className="numeric">{fmt(r.kg)}</td><td className="numeric">{fmt(lb(r.kg))}</td><td><details><summary>{r.records.length} itens de venda</summary>{r.records.map(m=><button key={m.id} className="text-link block" onClick={()=>onOrigin(m)}>{m.site||'Arquivo manual'} · {m.order||m.invoice} · {m.quantity} un. · {m.product}</button>)}</details></td></tr>)}</tbody></table></div>:<Empty title="Nenhuma venda contabilizada neste período" description="Importe os sites ou arquivos e confira as pendências. Um total vazio não confirma ausência de vendas."/>}</section>;
    })}
  </>;
}
