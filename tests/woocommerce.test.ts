import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, type DocumentInfo } from '../src/lib/model';
import { normalizeOrders, applyWoo, collectWoo, syncSchema, type SyncInput } from '../src/server/woocommerce';
import { salesBySize, excludedNational } from '../src/lib/sales';
import { salesCoverage } from '../src/lib/sales-cover';
import { buildReports, defaultFilters, filtered } from '../src/lib/reports';
import { clearDocuments } from '../src/server/clear-documents';

const input:SyncInput={source:'sacred' as const,start:'2026-11-01',end:'2026-11-30',statuses:['completed' as const]};
function doc():DocumentInfo {return {id:crypto.randomUUID(),name:'capture.json',source:'sacred',size:0,hash:'',mime:'application/json',importedAt:'2026-11-23T12:00:00Z',sheets:[],batch:'test'};}
function order(id=1,state='FL',country='US',name='Rapé Amazon 10g',quantity=3) {return {id,number:String(id),status:'completed',date_created:'2026-11-05T10:30:00',shipping:{state,country},line_items:[{id:id*10,product_id:10,variation_id:0,name,sku:'SKU-'+id,quantity,meta_data:[]}],refunds:[]};}
function capture(orders:ReturnType<typeof order>[],state=emptyState()) {const document=doc();return {input,document,orders:orders.length,movements:normalizeOrders(orders,[],new Map(),state,input,document)};}

test('A includes Awiry and Tobacco Free in FL; B excludes them and includes FL plus other states by size',()=>{
 const state=emptyState();
 applyWoo(state,capture([order(),order(2,'CA','US','Rapé Other 10g',2),order(3,'FL','US','Awiry 10g',4),order(4,'FL','US','Rapé Tobacco-Free 10g',6),order(5,'FL','BR'),order(6,'TX','US','Mapacho 250g',2)],state));
 const a=salesBySize(state.movements,'florida'),b=salesBySize(state.movements,'usa');
 assert.equal(a.rows[0].units,13);assert.equal(b.rows.find(r=>r.category==='DRY_SNUFF')?.units,5);
 assert.equal(b.rows.find(r=>r.category==='MAPACHO')?.kg,0.5);assert.equal(b.excluded,2);
 assert.equal(excludedNational('RAPÉ TOBACCO_FREE'),true);
});
test('same period and overlapping periods are idempotent; updates, cancellations and restoration count once',()=>{
 const state=emptyState();const orders=[order()];
 applyWoo(state,capture(orders,state));const firstId=state.movements[0].id;
 applyWoo(state,capture(orders,state));assert.equal(state.movements.length,1);assert.equal(state.movements[0].id,firstId);
 orders[0].line_items[0].quantity=8;applyWoo(state,capture(orders,state));assert.equal(salesBySize(state.movements,'usa').rows[0].units,8);
 orders[0].status='cancelled';applyWoo(state,capture(orders,state));assert.equal(salesBySize(state.movements,'usa').rows.length,0);
 orders[0].status='completed';applyWoo(state,capture(orders,state));assert.equal(salesBySize(state.movements,'usa').rows[0].units,8);
});
test('identical order IDs from distinct stores and separate same-SKU lines are not duplicates',()=>{
 const state=emptyState();const one=order();one.line_items.push({...one.line_items[0],id:11});
 applyWoo(state,capture([one],state));
 const second=capture([order()],state);second.input={...input,source:'haux'};
 second.movements[0].woo!.store='haux';second.movements[0].site='Haux Haux';
 applyWoo(state,second);
 assert.equal(state.movements.filter(m=>m.status==='accepted').length,3);
});
test('partial refunds subtract quantities by original line id; financial-only refunds require review',()=>{
 const state=emptyState(),o=order();
 const refunds=new Map([[1,[{line_items:[{id:99,quantity:-1,meta_data:[{key:'_refunded_item_id',value:'10'}]}]}]]]);
 const document=doc();const movements=normalizeOrders([o],[],refunds,state,input,document);
 applyWoo(state,{input,document,movements,orders:1});assert.equal(state.movements[0].quantity,2);
 const other=emptyState(),d=doc();
 applyWoo(other,{input,document:d,orders:1,movements:normalizeOrders([o],[],new Map([[1,[{line_items:[]}]]]),other,input,d)});
 assert.equal(other.movements[0].status,'pending');
});
test('missing sizes, unknown products, missing destinations and foreign delivery never silently enter totals',()=>{
 const state=emptyState();
 applyWoo(state,capture([order(1,'FL','US','Rapé sem tamanho'),order(2,'FL','US','Bottle 10g'),order(3,'FL',''),order(4,'CA','CA')],state));
 assert.equal(state.movements.filter(m=>m.status==='pending').length,3);
 assert.equal(salesBySize(state.movements,'usa').rows.length,0);
});
test('manual duplicate is held for review; changed source after manual edit preserves the decision for review',()=>{
 const state=emptyState();applyWoo(state,capture([order()],state));
 state.audit.push({id:'manual',at:'',action:'Correção manual',target:state.movements[0].id,reason:'test'});
 const changed=order();changed.line_items[0].quantity=9;
 applyWoo(state,capture([changed],state));assert.equal(state.movements[0].quantity,3);assert.equal(state.movements[0].status,'pending');
 const manualState=emptyState(),manual=capture([order()]).movements[0];delete manual.woo;manual.status='accepted';manualState.movements.push(manual);
 applyWoo(manualState,capture([order()],manualState));assert.equal(manualState.movements[1].status,'pending');
});
test('exports use the same totals and ignore unrelated ledger filters',()=>{
 const state=emptyState();applyWoo(state,capture([order()],state));
 const reports=buildReports(state,{...defaultFilters,year:2026,month:'11',state:'NY',site:'Other'});
 assert.equal(reports.florida.rows[0][2],3);assert.equal(reports.usa.rows[0][2],3);
});
test('coverage requires full period; successful zero-order sync counts and cleanup removes coverage',()=>{
 const state=emptyState();const collection=capture([],state);applyWoo(state,collection);
 assert.equal(salesCoverage(state,2026,'11')[0].complete,true);
 assert.equal(salesCoverage(state,2026,'')[0].complete,false);
 clearDocuments(state,{confirmed:true,documentIds:[collection.document.id]});
 assert.equal(salesCoverage(state,2026,'11')[0].complete,false);
});
test('invalid periods are rejected',()=>{
 assert.throws(()=>syncSchema.parse({...input,start:'2026-11-31'}));
 assert.throws(()=>syncSchema.parse({...input,end:'2026-10-01'}));
 assert.throws(()=>syncSchema.parse({...input,start:'2020-01-01'}));
});
test('collector paginates read-only, keeps secrets in headers, and fails without partial results',async()=>{
 process.env.WC_SACRED_URL='https://example.com';
 process.env.WC_SACRED_KEY='test-key';process.env.WC_SACRED_SECRET='test-secret';
 const calls:URL[]=[];
 const transport:typeof fetch=async(url,options)=>{
   const u=new URL(String(url));calls.push(u);assert.equal(options?.method,'GET');assert.equal(u.searchParams.has('consumer_secret'),false);
   assert.ok((options?.headers as Record<string,string>).Authorization.startsWith('Basic '));
   if(u.pathname.endsWith('/products'))return Response.json([{id:10,name:'Rapé',categories:[]}],{headers:{'x-wp-totalpages':'1'}});
   return Response.json([order(Number(u.searchParams.get('page')))],{headers:{'x-wp-totalpages':'2'}});
 };
 const result=await collectWoo(input,emptyState(),transport);assert.equal(result.orders,2);assert.equal(result.movements.length,2);assert.equal(calls.length,3);
 await assert.rejects(()=>collectWoo(input,emptyState(),async()=>new Response('denied',{status:401})),/HTTP 401/);
 delete process.env.WC_SACRED_URL;delete process.env.WC_SACRED_KEY;delete process.env.WC_SACRED_SECRET;
});


test('changed or removed WooCommerce line invalidates its merged manual target',()=>{
 for(const removal of [false,true]){
  const state=emptyState();applyWoo(state,capture([order()],state));
  const source=state.movements[0],target={...structuredClone(source),id:'manual-target',woo:undefined,status:'accepted' as const};
  state.movements.push(target);source.status='duplicate';source.duplicateOf=target.id;
  const changed=order();changed.line_items[0].quantity=9;
  if(removal)changed.status='cancelled';
  applyWoo(state,capture([changed],state));
  assert.equal(target.status,'pending');assert.equal(salesBySize(state.movements,'usa').rows.length,0);
 }
});
test('a reviewed source change is not reopened on an identical subsequent sync',()=>{
 const state=emptyState();applyWoo(state,capture([order()],state));
 const source=state.movements[0];
 state.audit.push({id:'edit',at:'',action:'Correção manual',target:source.id,reason:'test'});
 const changed=order();changed.line_items[0].quantity=9;
 applyWoo(state,capture([changed],state));assert.equal(source.status,'pending');
 source.quantity=9;source.kg=0.09;source.status='accepted';source.issues=[];
 applyWoo(state,capture([changed],state));assert.equal(source.status,'accepted');assert.equal(salesBySize(state.movements,'usa').rows[0].units,9);
});
test('collector rejects a later-page failure and preserves store-timezone date boundaries',async()=>{
 process.env.WC_SACRED_URL='https://example.com';
 process.env.WC_SACRED_KEY='test-key';process.env.WC_SACRED_SECRET='test-secret';
 try{
  await assert.rejects(()=>collectWoo(input,emptyState(),async url=>{
   const u=new URL(String(url));
   assert.equal(u.searchParams.get('after'),'2026-11-01T00:00:00');
   assert.equal(u.searchParams.get('before'),'2026-11-30T23:59:59');
   if(u.searchParams.get('page')==='2')return new Response('fail',{status:503});
   return Response.json([order()],{headers:{'x-wp-totalpages':'2'}});
  }),/HTTP 503/);
 }finally{delete process.env.WC_SACRED_URL;delete process.env.WC_SACRED_KEY;delete process.env.WC_SACRED_SECRET;}
});
test('completed-only policy omits processing orders; explicit inclusion adds them',()=>{
 const state=emptyState(),o=order();o.status='processing';
 assert.equal(capture([o],state).movements.length,0);
 assert.equal(normalizeOrders([o],[],new Map(),state,{...input,statuses:['completed','processing']},doc()).length,1);
});


test('default import counts processing and completed orders and excludes unpaid or cancelled statuses',()=>{
 const defaults=syncSchema.parse({source:input.source,start:input.start,end:input.end});
 const orders=['completed','processing','pending','on-hold','failed','cancelled','refunded'].map((status,index)=>({...order(index+1),status}));
 const movements=normalizeOrders(orders,[],new Map(),emptyState(),defaults,doc());
 assert.deepEqual(movements.map(m=>m.order),['1','2']);
 assert.equal(movements.reduce((sum,m)=>sum+(m.quantity||0),0),6);
});

test('outgoing combines month and normalized delivery state, including country precedence',()=>{
 const state=emptyState();applyWoo(state,capture([order(),order(2,'CA'),order(3,'FL','BR')],state));
 const original=state.movements[0];
 state.movements.push({...original,id:'old-month',date:'2026-10-05'}, {...original,id:'full-state',state:'Florida'});
 const filters={...defaultFilters,month:'11',state:'FL'};
 assert.deepEqual(filtered(state.movements,filters).map(m=>m.id),[original.id,'full-state']);
 assert.equal(filtered(state.movements,{...filters,month:'10'}).length,1);
 assert.equal(filtered(state.movements,{...filters,state:'CA'}).length,1);
 assert.equal(filtered(state.movements,{...filters,state:'Exterior'}).length,1);
 const report=buildReports(state,filters).outgoing;
 assert.equal(report.rows.length,2);
});
