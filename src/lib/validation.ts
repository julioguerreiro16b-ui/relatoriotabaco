import { baseIssues, isFlorida, matching, monthly, norm, validDate } from './domain';
import { historyComparisons, REFERENCE_LABEL } from './history';
import { trustedReference } from './historical-policy';
import { CATEGORIES, CATEGORY_LABEL, SOURCES, type Movement, type State, type ValidationFinding, type ValidationRun } from './model';

// Checking never approves, discards, merges or edits a financial record.
export function validateAll(state:State, id:string, at:string):ValidationRun {
  const checks:ValidationRun['checks']=[
    {key:'sources',label:'Arquivos e checklist',checked:SOURCES.filter(s=>s.required).length,findings:0},
    {key:'records',label:'Datas, classificação, pesos e campos obrigatórios',checked:0,findings:0},
    {key:'duplicates',label:'Duplicidades e conflitos entre fontes',checked:0,findings:0},
    {key:'entries',label:'Pares de Invoice + Entry Summary',checked:0,findings:0},
    {key:'florida',label:'Vendas na Flórida e gramaturas',checked:0,findings:0},
    {key:'inventory',label:'Estoque, continuidade e separação dos produtos',checked:0,findings:0},
    {key:'history',label:'Conciliação com a planilha histórica',checked:0,findings:0},
    {key:'documents',label:'Origem e integridade dos documentos',checked:state.documents.length,findings:0},
  ];
  const findings:ValidationFinding[]=[];
  const add=(finding:ValidationFinding)=>{findings.push(finding);};
  const allActive=state.movements.filter(m=>!['ignored','duplicate'].includes(m.status));
  const active=allActive.filter(m=>!m.historical);
  checks[7].checked=state.documents.filter(d=>d.source!=='history').length;
  const documents=new Set(state.documents.map(d=>d.id));
  for(const source of SOURCES.filter(s=>s.required))if(!state.documents.some(d=>d.source===source.key))add({check:'sources',severity:'warning',message:`${source.label}: ${state.unavailable[source.key]?'marcado como não disponível':'arquivo não recebido'}.`});
  if(!state.initialized)add({check:'sources',severity:'warning',message:'O checklist inicial ainda não foi confirmado. A verificação não inicia o processamento dos dados.'});
  if(!active.length)add({check:'records',severity:'warning',message:'Nenhuma movimentação ativa para verificar.'});
  for(const m of active){
    checks[1].checked++;
    const issues=new Set([...baseIssues(m),...m.issues]);
    for(const message of issues){
      const paired=message.includes('sem Entry Summary')||message.includes('sem Invoice');
      const acknowledged=m.status==='accepted'&&!m.issues.includes(message)&&(paired||message.startsWith('Peso KG/LB'));
      add({check:paired?'entries':'records',severity:acknowledged?'warning':'error',message:acknowledged?`${message}. Exceção já confirmada manualmente; decisão preservada.`:message,movementIds:[m.id]});
    }
    if(m.kind==='ENTRY')checks[3].checked++;
    if(m.status==='pending'&&!issues.size)add({check:'records',severity:'warning',message:'Campos sem inconsistências automáticas; registro ainda aguarda confirmação manual.',movementIds:[m.id]});
    if(m.status==='staged'&&!issues.size)add({check:'records',severity:'warning',message:'Registro verificado, aguardando o processamento do checklist.',movementIds:[m.id]});
    if(m.kind==='SITE_SALE'&&!['Sacred','Haux Haux','Natural Medicine'].includes(m.site))add({check:'records',severity:'error',message:'Canal de venda do site não identificado.',movementIds:[m.id]});
    const mapping=state.products.find(p=>m.sku?norm(p.sku)===norm(m.sku):m.product&&norm(p.name)===norm(m.product));
    if(mapping&&(mapping.category!==m.category||(m.unitGrams!==null&&mapping.unitGrams!==m.unitGrams)))add({check:'records',severity:'error',message:'Classificação ou gramatura difere do cadastro do produto. Confira antes de alterar o histórico.',movementIds:[m.id]});
    if(isFlorida(m.state)&&['WHOLESALE_SALE','SITE_SALE'].includes(m.kind)){
      checks[4].checked++;
      if(m.quantity===null||m.unitGrams===null)add({check:'florida',severity:'error',message:'Venda na Flórida sem quantidade ou gramatura para compor o relatório por embalagem.',movementIds:[m.id]});
    }
    for(const origin of m.origins)if(!documents.has(origin.documentId))add({check:'documents',severity:'error',message:'Documento de origem não encontrado no cadastro.',movementIds:[m.id],documentId:origin.documentId});
    if(!m.origins.length&&!['OPENING_STOCK','MANUAL_ADJUSTMENT'].includes(m.kind))add({check:'documents',severity:'error',message:'Movimentação sem documento de origem.',movementIds:[m.id]});
  }
  // Index candidates so unrelated invoices are not compared quadratically.
  const buckets=new Map<string,Movement[]>();
  for(const m of allActive){
    const keys:string[]=[];
    if(m.invoice)keys.push(`invoice:${m.category}:${norm(m.invoice)}`);
    if(m.order)keys.push(`order:${m.category}:${norm(m.order)}`);
    if(m.customer&&m.date&&m.kg!==null)keys.push(`sale:${m.category}:${m.date}:${norm(m.customer)}:${m.kg}`);
    if(m.kind==='OPENING_STOCK')keys.push(`opening:${m.category}`);
    for(const key of keys){const bucket=buckets.get(key)||[];bucket.push(m);buckets.set(key,bucket);}
  }
  const pairs=new Set<string>();
  for(const bucket of buckets.values())for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++){
    const a=bucket[i],b=bucket[j],key=[a.id,b.id].sort().join(':');if(a.historical&&b.historical||pairs.has(key))continue;pairs.add(key);checks[2].checked++;
    if(matching(a,b))add({check:'duplicates',severity:'error',message:a.kg!==b.kg?`CONFLITO DE DADOS: ${a.kg??'não identificado'} KG e ${b.kg??'não identificado'} KG.`:'Possível duplicidade entre registros. Vincule as fontes ou confirme que são movimentos distintos.',movementIds:[a.id,b.id]});
  }
  for(const m of state.movements.filter(m=>!m.historical&&m.status==='duplicate')){
    const target=state.movements.find(t=>t.id===m.duplicateOf);
    if(!target||['ignored','duplicate'].includes(target.status)||target.category!==m.category)add({check:'duplicates',severity:'error',message:'Registro conciliado sem uma movimentação de destino ativa do mesmo produto.',movementIds:[m.id,...(target?[target.id]:[])]});
  }
  const hashes=new Map<string,string>();
  for(const doc of state.documents.filter(d=>d.source!=='history')){if(doc.hash&&hashes.has(doc.hash))add({check:'documents',severity:'error',message:'O mesmo documento está cadastrado mais de uma vez.',documentId:doc.id});else if(doc.hash)hashes.set(doc.hash,doc.id);}
  const years=[...new Set(active.filter(m=>validDate(m.date)).map(m=>Number(m.date.slice(0,4))))].sort((a,b)=>a-b);
  for(const category of CATEGORIES){
    const openings=allActive.filter(m=>m.category===category&&m.kind==='OPENING_STOCK'&&m.status==='accepted');
    const hasTrustedClosing=state.references?.some(r=>r.category===category&&r.metric==='closing'&&trustedReference(state,r));
    if(!hasTrustedClosing&&openings.length!==1)add({check:'inventory',severity:'error',message:`${CATEGORY_LABEL[category]}: ${openings.length?'mais de um estoque inicial confirmado':'estoque inicial não confirmado'}.`,movementIds:openings.filter(m=>!m.historical).map(m=>m.id)});
    let previous:{month:string;closing:number|null}|undefined;
    for(const year of years)for(const row of monthly(state,category,year)){
      if(row.historical){previous=row;continue;}
      checks[5].checked++;
      if(row.closing!==null&&row.closing<0)add({check:'inventory',severity:'error',message:`${CATEGORY_LABEL[category]} · ${row.month}: estoque final negativo (${row.closing.toFixed(3)} KG).`});
      const expected=row.opening===null?null:row.opening+row.entries-row.wholesale-row.sites-row.losses+row.adjustments;
      if(expected!==null&&row.closing!==null&&Math.abs(expected-row.closing)>0.000001)add({check:'inventory',severity:'error',message:`${CATEGORY_LABEL[category]} · ${row.month}: equação de estoque inconsistente.`});
      if(previous&&row.opening!==null&&previous.closing!==null&&!row.partial&&Math.abs(previous.closing-row.opening)>0.000001)add({check:'inventory',severity:'error',message:`${CATEGORY_LABEL[category]} · ${row.month}: estoque inicial difere do fechamento anterior.`});
      previous=row;
    }
  }
  for(const c of historyComparisons(state)){
    if(trustedReference(state,c.ref))continue;
    checks[6].checked++;
    if(c.status==='Pendente')add({check:'history',severity:'error',message:`${c.ref.category?CATEGORY_LABEL[c.ref.category]:'Produto não classificado'} · ${c.ref.month} · ${REFERENCE_LABEL[c.ref.metric]}: ${c.calculated===null?'saldo não determinado':`histórico ${c.ref.kg} KG; calculado ${c.calculated} KG`}${c.conversionMismatch?'; conversão KG/LB inconsistente':''}.`,referenceId:c.ref.id,documentId:c.ref.documentId});
  }
  for(const check of checks)check.findings=findings.filter(f=>f.check===check.key).length;
  const affected=new Set(findings.flatMap(f=>f.movementIds||[]));
  for(const finding of findings)if(finding.movementIds)finding.movementIds=finding.movementIds.filter(id=>!state.movements.find(m=>m.id===id)?.historical);
  return {id,at,version:state.version+1,documents:state.documents.filter(d=>d.source!=='history').length,movements:active.length,skipped:state.movements.filter(m=>!m.historical&&['ignored','duplicate'].includes(m.status)).length,historicalSkipped:state.movements.filter(m=>m.historical).length,cleanMovements:active.filter(m=>!affected.has(m.id)).length,checks,findings};
}
