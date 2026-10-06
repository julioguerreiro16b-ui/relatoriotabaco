'use client';
import { useState } from 'react';
import { ClipboardCheck, LoaderCircle, CheckCircle2, CircleAlert } from 'lucide-react';
import type { Movement, State } from '@/lib/model';
import { Modal, type Act } from './shared';

export default function FullValidation({state,act,onReview,onEdit}:{state:State;act:Act;onReview:()=>void;onEdit:(m:Movement)=>void}){
  const [busy,setBusy]=useState(false),[open,setOpen]=useState(false),[error,setError]=useState(''),[group,setGroup]=useState(''),[limit,setLimit]=useState(50);
  const run=state.lastValidation,stale=!!run&&run.version!==state.version;
  async function start(){
    if(busy)return;
    setBusy(true);setError('');
    try{await act({action:'validate_all'});setGroup('');setLimit(50);setOpen(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const findings=run?.findings.filter(f=>!group||f.check===group)||[];
  return <div className="validation-controls">
    <button className="primary" disabled={busy} onClick={()=>void start()} aria-busy={busy}>{busy?<LoaderCircle size={17} className="spin"/>:<ClipboardCheck size={17}/>} {busy?'Verificando todos os dados…':'Validar e verificar tudo'}</button>
    {run&&<button className="text-link" onClick={()=>setOpen(true)}>Última verificação{stale?' · dados alterados':''}</button>}
    {error&&<span className="validation-error" role="alert">{error}</span>}
    {open&&run&&<Modal title="Resultado da verificação completa" onClose={()=>setOpen(false)} wide>
      <p>Todos os novos dados, anos e produtos foram considerados, independentemente dos filtros da tela. O histórico original é aceito como correto e fica fora da verificação. Esta conferência não altera valores nem aprova registros automaticamente.</p>
      {stale&&<div className="warning-box">Os dados mudaram após esta verificação. Execute novamente para atualizar o resultado.</div>}
      <div className={run.findings.length?'warning-box':'info-box'} role="status"><strong>{run.findings.length?`${run.findings.length} ocorrências para conferir`:'Nenhuma inconsistência detectada nas verificações automáticas'}</strong><p>{run.movements} registros ativos · {run.documents} documentos · {run.cleanMovements} registros sem ocorrências · {run.skipped} ignorados ou já conciliados · {run.historicalSkipped||0} históricos aceitos sem conferência</p></div>
      <div className="validation-checks">{run.checks.map(check=><div key={check.key}>{check.findings?<CircleAlert size={18}/>:<CheckCircle2 size={18}/>}<div><strong>{check.label}</strong><small>{check.checked} verificações · {check.findings} ocorrências</small></div></div>)}</div>
      {!!run.findings.length&&<><label className="field-label">Filtrar resultados<select value={group} onChange={e=>{setGroup(e.target.value);setLimit(50);}}><option value="">Todas as verificações</option>{run.checks.filter(c=>c.findings).map(c=><option key={c.key} value={c.key}>{c.label} ({c.findings})</option>)}</select></label><div className="validation-findings">{findings.slice(0,limit).map((finding,i)=><div key={`${finding.check}-${i}`}><span className={'badge '+(finding.severity==='error'?'pending':'neutral')}>{finding.severity==='error'?'Revisar':'Aviso'}</span><p>{finding.message}</p><div className="row-actions">{finding.movementIds?.map(id=>{const m=state.movements.find(m=>m.id===id);return m&&m.status!=='duplicate'?<button className="text-link" key={id} onClick={()=>{setOpen(false);onEdit(m);}}>Revisar {m.invoice||m.order||m.date||'registro'}</button>:null;})}{finding.documentId&&state.documents.some(d=>d.id===finding.documentId)&&<a className="text-link" href={`/api/documents/${finding.documentId}`}>Ver documento</a>}{finding.referenceId&&<button className="text-link" onClick={()=>{setOpen(false);onReview();}}>Ver conciliação histórica</button>}</div></div>)}</div>{findings.length>limit&&<button className="secondary" onClick={()=>setLimit(limit+50)}>Mostrar mais resultados ({findings.length-limit})</button>}</>}
      <div className="validation-footer"><small>Verificado em {new Date(run.at).toLocaleString('pt-BR')} · Resultado registrado na auditoria</small><div className="row-actions"><button className="secondary" onClick={()=>{setOpen(false);onReview();}}>Abrir revisão de dados</button><button className="primary" disabled={busy} onClick={()=>void start()}>{busy?'Verificando…':'Verificar novamente'}</button></div></div>
    </Modal>}
  </div>;
}
