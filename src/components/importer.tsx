'use client';
import { useState, useRef } from 'react';
import { Trash2, Upload, Check, FileSpreadsheet, Download, LoaderCircle, ShieldCheck, Plus, Plug, Files, MapPin } from 'lucide-react';
import WooImport from './woo-import';
import { SOURCES, MANUAL_SOURCES, SITE_SOURCES, CATEGORY_LABEL, CATEGORIES, type State, type Source, type Category } from '@/lib/model';
import { fmt } from '@/lib/domain';
import { extractPDF } from '@/lib/pdf-client';
import { Modal, type Act } from './shared';

export default function Importer({state,act,reload,onReview,notify,onReport,onSources}:{state:State;act:Act;reload:()=>Promise<void>;onReview:()=>void;notify:(s:string)=>void;onReport:(scope:'florida'|'usa')=>void;onSources:()=>void}) {
  const [tab,setTab]=useState<'sites'|'files'>('sites');
  const [source,setSource]=useState<Source>('history'),[busy,setBusy]=useState(''),[confirm,setConfirm]=useState(false),[checked,setChecked]=useState(false),[opening,setOpening]=useState<Category|null>(null),[localError,setLocalError]=useState('');
  const [clearIds,setClearIds]=useState<string[]|null>(null),[clearing,setClearing]=useState(false),[clearError,setClearError]=useState('');
  const [wooBusy,setWooBusy]=useState(false);
  const locked=!!busy||clearing||wooBusy;
  const input=useRef<HTMLInputElement>(null);
  const required=MANUAL_SOURCES.filter(s=>s.required);
  const ready=required.filter(s=>state.documents.some(d=>d.source===s.key)||state.unavailable[s.key]).length;
  const manualDocuments=state.documents.filter(d=>!SITE_SOURCES.includes(d.source));
  const siteDocuments=state.documents.filter(d=>SITE_SOURCES.includes(d.source));
  const documents=tab==='sites'?siteDocuments:manualDocuments;
  function askClear(ids:string[]) {setClearError('');setClearIds(ids);}
  async function upload(files:FileList|null) {
    if(!files?.length||locked)return;setLocalError('');
    try {for(const file of Array.from(files)) {
      if(file.size>3*1024*1024)throw new Error(file.name+': o limite é de 3 MB por arquivo.');
      setBusy('Analisando '+file.name+'…');
      const form=new FormData();form.set('file',file);form.set('source',source);
      if(/\.pdf$/i.test(file.name))form.set('pages',JSON.stringify(await extractPDF(file,setBusy)));
      const r=await fetch('/api/import',{method:'POST',body:form}),data=await r.json();
      if(!r.ok)throw new Error(data.error);
      notify(data.duplicate?file.name+' já foi recebido. Nenhum registro duplicado.':file.name+': '+data.count+' registros recebidos.');
    }}catch(e){setLocalError((e as Error).message);}finally{setBusy('');await reload();if(input.current)input.current.value='';}
  }
  function template(products=false) {
    const text=products?'SKU;Nome do produto;Categoria;Peso unitário g\n':'Data;Invoice;Pedido;Cliente;Destinatário;Estado;SKU;Nome do produto;Categoria;Quantidade;Peso unitário g;KG;Transporte;Cargo/Courier;Origem\n';
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));a.download=products?'modelo-produtos.csv':'modelo-movimentacoes.csv';a.click();URL.revokeObjectURL(a.href);
  }
  return <>
    <div className="collection-tabs" role="tablist" aria-label="Origem da importação" onKeyDown={e=>{if(!locked&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=tab==='sites'?'files':'sites';setTab(next);document.getElementById(next+'-tab')?.focus();}}}>
      <button id="sites-tab" role="tab" tabIndex={tab==='sites'?0:-1} aria-selected={tab==='sites'} aria-controls="sites-panel" disabled={locked} onClick={()=>setTab('sites')}><Plug size={21}/><span>Vendas dos sites<small>Captura automática do WooCommerce</small></span></button>
      <button id="files-tab" role="tab" tabIndex={tab==='files'?0:-1} aria-selected={tab==='files'} aria-controls="files-panel" disabled={locked} onClick={()=>setTab('files')}><Files size={21}/><span>Outros documentos<small>Invoices, histórico e arquivos complementares</small></span></button>
    </div>
    {tab==='sites'?<div role="tabpanel" id="sites-panel" aria-labelledby="sites-tab">
      <WooImport state={state} reload={reload} notify={notify} onBusy={setWooBusy} disabled={clearing} onSources={onSources}/>
      <div className="report-shortcuts">
        <button className="report-shortcut" onClick={()=>onReport('florida')}><span className="report-letter">A</span><span><strong>Flórida por tamanho</strong><small>Todas as vendas destinadas à Flórida.<br/>Rapés e mapachos separados.</small></span><MapPin size={22}/></button>
        <button className="report-shortcut" onClick={()=>onReport('usa')}><span className="report-letter">B</span><span><strong>EUA por tamanho</strong><small>Todos os estados, incluindo Flórida.<br/>Exclui Awiry e Tobacco Free.</small></span><MapPin size={22}/></button>
      </div>
      <div className="collection-note"><ShieldCheck size={18}/><p>Não é necessário enviar arquivos das lojas. Após a captura, vendas sem pendências entram nos relatórios; itens que precisam de conferência ficam em <button className="text-link" onClick={onReview}>Revisar dados</button>.</p></div>
    </div>:<div role="tabpanel" id="files-panel" aria-labelledby="files-tab">
      <div className="import-layout">
        <section className="panel upload-panel">
          <div className="panel-heading"><div><span className="eyebrow">ENVIO MANUAL</span><h2>Documentos complementares</h2><p>Adicione os arquivos de atacado, entradas, perdas ou histórico.</p></div><span className="large-icon"><Files size={26}/></span></div>
          <label className="field-label" htmlFor="source">Tipo de documento</label>
          <select id="source" value={source} onChange={e=>setSource(e.target.value as Source)} disabled={locked}>{MANUAL_SOURCES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <div className={'drop-zone '+(busy?'processing':'')} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!locked)void upload(e.dataTransfer.files);}}>
            <span className="upload-icon">{busy?<LoaderCircle className="spin" size={27}/>:<Upload size={27}/>}</span><h3>{busy||'Arraste seus documentos aqui'}</h3><p>XLSX, CSV ou PDF · até 3 MB por arquivo</p>
            <button className="primary" disabled={locked} onClick={()=>input.current?.click()}><Plus size={17}/> Selecionar arquivos</button>
            <input ref={input} type="file" multiple accept=".xlsx,.csv,.pdf" hidden onChange={e=>void upload(e.target.files)}/>
          </div>
          {localError&&<div role="alert" className="error-box">{localError}</div>}
          <div className="subtle-note"><ShieldCheck size={19}/><span>Os documentos originais são preservados e arquivos repetidos são identificados.</span></div>
          <div className="template-links"><button className="text-link" onClick={()=>template()}><Download size={15}/> Modelo de movimentações</button><button className="text-link" onClick={()=>template(true)}><Download size={15}/> Modelo de produtos</button></div>
        </section>
        <section className="panel checklist">
          <div className="section-heading"><h2>Checklist de documentos</h2><span className="counter">{ready}/{required.length}</span></div>
          <div className="progress"><span style={{width:ready/required.length*100+'%'}}/></div><p className="muted">Confira os documentos deste envio. As lojas são gerenciadas na área Vendas dos sites.</p>
          {MANUAL_SOURCES.map(s=>{const docs=manualDocuments.filter(d=>d.source===s.key),missing=state.unavailable[s.key];return <div className="checklist-row" key={s.key}>
            <span className={'check-circle '+(docs.length?'done':missing?'skipped':'')}>{docs.length?<Check size={14}/>:missing?'−':null}</span>
            <div><strong>{s.label}{!s.required&&<small>Opcional</small>}</strong>{docs.length?<small className="success">{docs.length} arquivo(s) recebido(s)</small>:<label className="check-label"><input type="checkbox" checked={!!missing} disabled={locked} onChange={e=>void act({action:'checklist',unavailable:{...state.unavailable,[s.key]:e.target.checked}})}/> Não disponível neste envio</label>}</div>
            {docs.length>0&&<button className="icon-button clear-files" disabled={locked} onClick={()=>askClear(docs.map(d=>d.id))} aria-label={'Limpar arquivos de '+s.label}><Trash2 size={15}/></button>}
            <button disabled={locked} className="icon-button" aria-label={'Enviar '+s.label} onClick={()=>{setSource(s.key);input.current?.click();}}><Upload size={16}/></button>
          </div>;})}
          <div className="manual-process"><p>{state.movements.filter(m=>m.status==='staged').length} registros aguardando processamento</p><button className="primary full" disabled={locked||ready<required.length} onClick={()=>{setChecked(false);setConfirm(true);}}>Conferir e processar documentos</button></div>
        </section>
      </div>
      <details className="panel stock-disclosure"><summary><strong>Estoque inicial</strong><span>Necessário para balanço e estoque; não impede os relatórios de vendas A/B.</span></summary>
        <div className="opening-cards">{CATEGORIES.map(cat=>{const m=state.movements.find(m=>m.category===cat&&m.kind==='OPENING_STOCK'&&m.status!=='ignored');return <div className="opening-card" key={cat}><span className={'product-dot '+cat}/><div><strong>{CATEGORY_LABEL[cat]}</strong><p>{m?fmt(m.kg)+' KG · '+m.date.split('-').reverse().join('/'):'Ainda não informado'}</p></div>{m?.historical?<span className="badge neutral">Histórico aceito</span>:<button className="text-link" onClick={()=>m?onReview():setOpening(cat)}>{m?'Revisar':'Informar'}</button>}</div>;})}</div>
      </details>
    </div>}
    {!!documents.length&&<details className="panel import-history">
      <summary><span><strong>{tab==='sites'?'Histórico das lojas':'Documentos recebidos'}</strong><small>{documents.length} registro(s) preservado(s)</small></span></summary>
      <div className="table-scroll"><table><thead><tr><th>{tab==='sites'?'Captura / arquivo anterior':'Arquivo'}</th><th>Fonte</th><th>Recebido em</th><th>Original</th><th>Gerenciar</th></tr></thead><tbody>{documents.map(d=><tr key={d.id}><td><span className="file-name"><FileSpreadsheet size={17}/>{d.name}</span></td><td>{SOURCES.find(s=>s.key===d.source)?.label}</td><td>{new Date(d.importedAt).toLocaleDateString('pt-BR')}</td><td><a className="text-link" href={'/api/documents/'+d.id}>Baixar</a></td><td><button className="icon-button clear-files" disabled={locked} onClick={()=>askClear([d.id])} aria-label={'Remover '+d.name}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>
      {tab==='files'&&<div className="history-actions"><button className="text-link clear-files" disabled={locked} onClick={()=>askClear(manualDocuments.map(d=>d.id))}><Trash2 size={15}/> Limpar documentos manuais</button></div>}
    </details>}
    {clearIds&&<Modal title="Remover importações selecionadas" onClose={()=>{if(!clearing)setClearIds(null);}}>
      <p>Você vai retirar <strong>{clearIds.length} importação(ões)</strong> e as movimentações e referências geradas por elas. Os relatórios serão atualizados.</p><p>Registros conciliados voltarão para revisão. Cadastros de produtos e estoque informado manualmente serão mantidos.</p>
      <ul className="clear-file-list">{state.documents.filter(d=>clearIds.includes(d.id)).map(d=><li key={d.id}>{d.name}</li>)}</ul><p>A remoção fica registrada na auditoria.</p>{clearError&&<p role="alert" className="error-box">{clearError}</p>}
      <div className="clear-actions"><button className="secondary" disabled={clearing} onClick={()=>setClearIds(null)}>Cancelar</button><button className="primary" disabled={clearing} onClick={async()=>{setClearing(true);setClearError('');try{await act({action:'clear_documents',documentIds:clearIds,confirmed:true});setClearIds(null);notify('Importações removidas. Os relatórios foram atualizados.');}catch(e){setClearError((e as Error).message);}finally{setClearing(false);}}}>{clearing?'Removendo…':'Confirmar remoção'}</button></div>
    </Modal>}
    {confirm&&<Modal title="Conferir documentos antes de processar" onClose={()=>setConfirm(false)}>
      <p>Somente registros sem pendências serão contabilizados. As capturas WooCommerce são processadas separadamente.</p>
      <div className="confirmation-list">{MANUAL_SOURCES.map(s=><div key={s.key}><span>{s.label}</span><strong>{manualDocuments.filter(d=>d.source===s.key).length||'Não disponível'}</strong></div>)}</div>
      <label className="check-label important"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/> Conferi os documentos e entendo que fontes ausentes geram relatórios incompletos.</label>
      <button className="primary full" disabled={!checked||locked} onClick={async()=>{setBusy('Processando documentos…');try{await act({action:'commit',confirmed:true});setConfirm(false);onReview();}catch(e){setLocalError((e as Error).message);setConfirm(false);}finally{setBusy('');}}}>Processar documentos</button>
    </Modal>}
    {opening&&<Modal title={'Estoque inicial · '+CATEGORY_LABEL[opening]} onClose={()=>setOpening(null)}><form onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await act({action:'opening',category:opening,date:data.get('date'),kg:Number(data.get('kg')),reason:data.get('reason')});setOpening(null);}}><label className="field-label">Data de referência<input name="date" type="date" required/></label><label className="field-label">Estoque em KG<input name="kg" type="number" min="0" step="any" required/></label><label className="field-label">Origem da contagem<textarea name="reason" required/></label><p className="muted">Se a contagem foi feita ao final do dia, selecione o dia seguinte.</p><button className="primary full">Salvar estoque inicial</button></form></Modal>}
  </>;
}
