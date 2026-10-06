'use client';
import { useState } from 'react';
import type { State } from '@/lib/model';
export default function HistoricalWorkbook({state,sheetFilter=''}:{state:State;sheetFilter?:string}){
  const sheets=state.documents.filter(d=>d.source==='history').flatMap(d=>(d.historicalSheets||[]).filter(s=>!sheetFilter||s.name.includes(sheetFilter)).map(s=>({...s,doc:d})));
  const [selected,setSelected]=useState('');const current=sheets.find(s=>s.doc.id+s.name===selected)||sheets[0];
  if(!current)return <p className="info-box">Envie a planilha histórica para repetir os dados anteriores.</p>;
  return <section className="panel"><div className="section-heading"><div><h2>Histórico original</h2><p>Dados aceitos como corretos. Sem correção, recálculo ou verificação.</p></div><a className="text-link" href={`/api/documents/${current.doc.id}`}>Baixar planilha original</a></div><label className="field-label">Aba da planilha<select value={current.doc.id+current.name} onChange={e=>setSelected(e.target.value)}>{sheets.map(s=><option key={s.doc.id+s.name} value={s.doc.id+s.name}>{s.name}</option>)}</select></label><div className="table-scroll" style={{maxHeight:550}}><table><tbody>{current.rows.map((row,i)=><tr key={i}><th>{i+1}</th>{row.map((value,j)=><td key={j} style={{whiteSpace:'nowrap'}}>{value===null?'':String(value)}</td>)}</tr>)}</tbody></table></div></section>;
}
