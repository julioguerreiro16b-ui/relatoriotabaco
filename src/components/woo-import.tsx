'use client';
import { useEffect, useState } from 'react';
import { Download, LoaderCircle, Plug, CheckCircle2, RefreshCw, CircleAlert } from 'lucide-react';
import type { State, WooSource } from '@/lib/model';
import { WOO_STORES } from '@/lib/sales';

type Connection = typeof WOO_STORES[number] & { configured: boolean };
export default function WooImport({state,reload,notify,onBusy,onResult,onSources,disabled=false}:{state:State;reload:()=>Promise<void>;notify:(message:string)=>void;onBusy?:(busy:boolean)=>void;onResult?:(source:WooSource,ok:boolean)=>void;disabled?:boolean;onSources:()=>void}) {
  const today=new Date(), year=today.getFullYear(),month=String(today.getMonth()+1).padStart(2,'0');
  const [start,setStart]=useState(year+'-'+month+'-01'),[end,setEnd]=useState(year+'-'+month+'-'+String(today.getDate()).padStart(2,'0'));
  const [stores,setStores]=useState<Connection[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [failed,setFailed]=useState<Partial<Record<WooSource,boolean>>>({});
  const [policy,setPolicy]=useState('paid'),[results,setResults]=useState<Partial<Record<WooSource,string>>>({});
  async function connections() {
    setLoading(true);setError('');
    try { const r=await fetch('/api/woocommerce');const data=await r.json();if(!r.ok)throw new Error(data.error);setStores(data.stores); }
    catch(e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(()=>{void connections();},[]);
  async function sync() {
    if(busy||disabled)return;
    const failures:string[]=[];setError('');setResults({});setFailed({});onBusy?.(true);
    try {
      for(const store of stores.filter(s=>s.configured)) {
        setBusy(store.label);
        try {
          const r=await fetch('/api/woocommerce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:store.source,start,end,statuses:policy==='paid'?['completed','processing']:['completed']})});
          const data=await r.json();if(!r.ok)throw new Error(data.error);
          onResult?.(store.source,true);
          setResults(previous=>({...previous,[store.source]:data.run.items+' itens · '+data.run.pending+' para revisar'}));
        } catch(e) {const message=(e as Error).message;setFailed(previous=>({...previous,[store.source]:true}));onResult?.(store.source,false);failures.push(store.label+': '+message);setResults(previous=>({...previous,[store.source]:'Falha nesta tentativa. Tente novamente.'}));}
        await reload();
      }
      if(failures.length)setError(failures.join(' '));else notify('Captura concluída. Consulte os relatórios A e B e confira os itens pendentes.');
    } finally {setBusy('');onBusy?.(false);}
  }
  const configured=stores.filter(s=>s.configured).length;
  return <section className="panel woo-panel">
    <div className="woo-heading"><div><span className="eyebrow">WOOCOMMERCE · CAPTURA AUTOMÁTICA</span><h2>Vendas das lojas</h2><p>Escolha o período e importe as saídas de rapés e mapachos.</p></div><span className="connection-count"><Plug size={17}/>{loading?'Verificando lojas…':configured+' de 3 lojas configuradas'}</span></div>
    <div className="woo-controls">
      <label className="field-label">De<input type="date" value={start} max={end} disabled={!!busy||disabled} onChange={e=>setStart(e.target.value)}/></label>
      <label className="field-label">Até<input type="date" value={end} min={start} disabled={!!busy||disabled} onChange={e=>setEnd(e.target.value)}/></label>
      <label className="field-label">Pedidos<select aria-label="Pedidos" value={policy} disabled={!!busy||disabled} onChange={e=>setPolicy(e.target.value)}><option value="paid">Processando e concluídos</option><option value="completed">Somente concluídos</option></select></label>
      <button className="primary" disabled={!!busy||disabled||loading||!configured||!start||!end||start>end} onClick={()=>void sync()}>{busy?<LoaderCircle size={18} className="spin"/>:<Download size={18}/>} {busy?'Importando '+busy+'…':'Importar dos sites'}</button>
    </div>
    <p className="muted">Período pela data de criação do pedido, no fuso de cada loja. Quantidades descontam reembolsos com itens identificados. Reimporte o período para atualizar cancelamentos e devoluções.</p>
    <div className="woo-stores">{WOO_STORES.map(store=>{
      const connection=stores.find(s=>s.source===store.source),last=state.wooSyncs?.filter(s=>s.source===store.source).at(-1);
      const matching=state.wooSyncs?.filter(s=>s.source===store.source&&s.start<=start&&s.end>=end&&s.statuses.includes('completed')&&(policy!=='paid'||s.statuses.includes('processing'))).at(-1);
      const syncing=busy===store.label,problem=failed[store.source];
      const label=syncing?'Importando…':problem?'Falha na captura':loading?'Verificando…':!connection?.configured?'Conexão pendente':matching?'Período capturado':'Pronta para importar';
      return <article className={'woo-store '+(problem?'has-error':matching?'is-synced':'')} key={store.source}><div className="woo-store-title"><span className="store-monogram">{store.label.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><strong>{store.label}</strong></div><span className={'badge '+(problem?'pending':matching?'accepted':'neutral')}>{syncing?<LoaderCircle size={14} className="spin"/>:problem?<CircleAlert size={14}/>:matching?<CheckCircle2 size={14}/>:null}{label}</span>
        {results[store.source]?<p role={problem?'alert':'status'}>{results[store.source]}</p>:last?<p>Última captura<br/><strong>{last.start.split('-').reverse().join('/')} a {last.end.split('-').reverse().join('/')}</strong><small>{last.items} itens · {new Date(last.at).toLocaleString('pt-BR')}</small></p>:<p>{connection?.configured?'Selecione o período acima para começar.':'Configure o acesso de leitura para capturar as vendas desta loja.'}</p>}
      </article>;
    })}</div>
    {!loading&&configured<3&&<div className="woo-connection-notice"><span><Plug size={18}/>{3-configured} loja(s) aguardando conexão. Não é necessário enviar arquivos.</span><button className="secondary" disabled={!!busy} onClick={onSources}>Configurar lojas</button></div>}
    {error&&<p className="error-box" role="alert">{error}</p>}
    <button className="text-link" disabled={!!busy||disabled||loading} onClick={()=>void connections()}><RefreshCw size={15}/> Atualizar conexões</button>
  </section>;
}
