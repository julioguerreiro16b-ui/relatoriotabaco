import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DocumentInfo, Movement, State, WooSource, WooSync } from '@/lib/model';
import { norm, reconcile, validDate } from '@/lib/domain';
import { excludedNational, salesCategory, WOO_STORES } from '@/lib/sales';
import { gramsInProduct, kgFromUnits } from '@/lib/weights';
import { normalizeState } from '@/lib/shipping';

const meta = z.object({ key: z.string(), value: z.unknown(), display_key: z.string().optional(), display_value: z.unknown().optional() });
const itemSchema = z.object({ id: z.number().int().positive(), product_id: z.number().int().nonnegative(), variation_id: z.number().int().nonnegative().default(0), name: z.string(), sku: z.string().default(''), quantity: z.number().finite(), meta_data: z.array(meta).default([]) });
const orderSchema = z.object({
  id: z.number().int().positive(), number: z.string(), status: z.string(), date_created: z.string(),
  shipping: z.object({ state: z.string().default(''), country: z.string().default('') }),
  line_items: z.array(itemSchema), refunds: z.array(z.object({ id: z.number().int().positive() })).default([]),
});
type WooOrder = z.infer<typeof orderSchema>;
const productSchema = z.object({ id: z.number().int(), name: z.string(), categories: z.array(z.object({ name: z.string() })).default([]) });
type WooProduct = z.infer<typeof productSchema>;
const refundSchema = z.object({ line_items: z.array(z.object({ id: z.number(), quantity: z.number().finite(), meta_data: z.array(meta).default([]) })).default([]) });
export const syncSchema = z.object({
  source: z.enum(['sacred','haux','natural']),
  start: z.string().refine(validDate, 'Data inicial inválida'),
  end: z.string().refine(validDate, 'Data final inválida'),
  statuses: z.array(z.enum(['completed','processing'])).min(1).max(2).default(['completed','processing']),
}).refine(v => v.start <= v.end && Date.parse(v.end)-Date.parse(v.start) <= 365*86400000, 'Selecione um período de até 366 dias.');
export type SyncInput = z.infer<typeof syncSchema>;

function configuration(source: WooSource) {
  const store = WOO_STORES.find(s => s.source === source)!;
  const raw = process.env[store.env+'_URL'], key = process.env[store.env+'_KEY'], secret = process.env[store.env+'_SECRET'];
  if (!raw || !key || !secret) throw new Error(store.label + ': configure URL e chaves de leitura no servidor.');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(store.label + ': URL inválida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(store.label + ': use uma URL HTTPS sem credenciais ou parâmetros.');
  return { store, base: url.href.replace(/\/$/, '') + '/wp-json/wc/v3/', authorization: 'Basic '+Buffer.from(key+':'+secret).toString('base64') };
}
export function wooConnections() {
  return WOO_STORES.map(store => {
    try { configuration(store.source); return { ...store, configured: true }; }
    catch { return { ...store, configured: false }; }
  });
}
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function itemSize(item: z.infer<typeof itemSchema>) {
  const values = item.meta_data.filter(m => /size|tamanho|gram|weight|peso/i.test(m.key+' '+(m.display_key||'')))
    .map(m => String(m.display_value ?? m.value));
  const sizes = [...new Set([gramsInProduct(item.name), ...values.map(gramsInProduct)].filter((n): n is number => n !== null))];
  return sizes.length === 1 ? sizes[0] : null;
}
export interface Collected { movements: Movement[]; orders: number; document: DocumentInfo; input: SyncInput }
export function normalizeOrders(orders: WooOrder[], products: WooProduct[], refunds: Map<number,z.infer<typeof refundSchema>[]>, state: State, input: SyncInput, document: DocumentInfo): Movement[] {
  const store = WOO_STORES.find(s => s.source === input.source)!;
  const result: Movement[] = [];
  for (const order of orders) {
    if (!input.statuses.includes(order.status as 'completed'|'processing')) continue;
    const when = order.date_created.slice(0,10);
    if (!validDate(when)) throw new Error('Pedido '+order.number+': data inválida na loja.');
    if (when < input.start || when > input.end) continue;
    const deductions = new Map<number,number>();
    let ambiguousRefund = false;
    for (const refund of refunds.get(order.id)||[]) {
      if (!refund.line_items.length) ambiguousRefund = true;
      for (const line of refund.line_items) {
        const id = Number(line.meta_data.find(m => m.key === '_refunded_item_id')?.value);
        if (!id || !order.line_items.some(item => item.id === id) || line.quantity >= 0) { ambiguousRefund = true; continue; }
        deductions.set(id,(deductions.get(id)||0)+Math.abs(line.quantity));
      }
    }
    for (const item of order.line_items) {
      const product = products.find(p => p.id === item.product_id);
      const description = [item.name, product?.name, ...(product?.categories.map(c => c.name)||[])].join(' ');
      const mapping = state.products.find(p => item.sku ? norm(p.sku) === norm(item.sku) : norm(p.name) === norm(item.name));
      if (mapping?.category === 'IGNORE') continue;
      const category = mapping?.category || salesCategory(description);
      const grams = mapping?.unitGrams || itemSize(item);
      const quantity = item.quantity - (deductions.get(item.id)||0);
      if (quantity === 0) continue;
      const issues: string[] = [];
      if (ambiguousRefund) issues.push('Conferir reembolso sem quantidade de itens identificável');
      if (quantity < 0) issues.push('Conferir quantidade reembolsada maior que a venda');
      const country = order.shipping.country.trim().toUpperCase();
      const region = normalizeState(order.shipping.state,country);
      if (!country || (country === 'US' && region === 'Não identificado')) issues.push('Conferir país/estado de entrega ausente');
      const data = { store: input.source, orderId: order.id, itemId: item.id, nationalExcluded: excludedNational(description+' '+item.sku) };
      const m: Movement = {
        id: randomUUID(), date: when, invoice: '', order: order.number, customer: '', recipient: '', address: '',
        state: region, shippingCountry: country, category, kind: 'SITE_SALE', kg: kgFromUnits(quantity,grams),
        sku: item.sku, product: item.name, quantity, unitGrams: grams, site: store.label, transport: '', cargo: '', country: '', amount: null,
        origins: [{ documentId: document.id, file: document.name, source: input.source, row: result.length+1 }],
        importedAt: document.importedAt, status: 'staged', historical: false, issues,
        note: 'WooCommerce · data de criação do pedido na loja · unidades líquidas de reembolsos identificados.',
        woo: { ...data, fingerprint: fingerprint({data,when,region,country,category,grams,quantity,issues,name:item.name,sku:item.sku}) },
      };
      result.push(m);
    }
  }
  return result;
}

export async function collectWoo(input: SyncInput, state: State, transport: typeof fetch = fetch): Promise<Collected> {
  const config = configuration(input.source);
  const signal = AbortSignal.timeout(45000);
  async function request(resource: string, params: Record<string,string> = {}, missingAllowed = false) {
    const url = new URL(resource,config.base);
    Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,value));
    let response: Response;
    try { response = await transport(url,{ method:'GET', headers:{Authorization:config.authorization,Accept:'application/json'},cache:'no-store',redirect:'error',signal }); }
    catch { throw new Error(config.store.label+': conexão interrompida ou tempo excedido. Tente um período menor. Nenhum dado parcial foi salvo.'); }
    if (missingAllowed && response.status === 404) return { data:null, pages:1 };
    if (!response.ok) throw new Error(config.store.label+': WooCommerce retornou HTTP '+response.status+'. Verifique o acesso de leitura.');
    let data: unknown;
    try { data = await response.json(); } catch { throw new Error(config.store.label+': resposta inválida da API.'); }
    const header = response.headers.get('x-wp-totalpages');
    const pages = header === null ? null : Number(header);
    if (pages !== null && (!Number.isInteger(pages) || pages < 0 || pages > 200)) throw new Error('Divida o período: limite de paginação excedido.');
    return {data,pages};
  }
  async function list(resource: string, params: Record<string,string> = {}) {
    const collected: unknown[] = [];
    for (let page=1;page<=200;page++) {
      const response = await request(resource,{...params,per_page:'100',page:String(page)});
      if (!Array.isArray(response.data)) throw new Error(config.store.label+': lista inválida.');
      collected.push(...response.data);
      if (response.pages !== null ? page >= response.pages : response.data.length < 100) return collected;
    }
    throw new Error('Divida o período: a consulta não pôde ser concluída.');
  }
  // Date filters refer to order creation in the store timezone, not completion or payment.
  // Fetch every status so a repeated sync can remove cancelled/refunded items from the same period.
  const orders = z.array(orderSchema).parse(await list('orders',{
    after: input.start+'T00:00:00', before: input.end+'T23:59:59', status:'any', orderby:'id',order:'asc',
  }));
  const active = orders.filter(o => input.statuses.includes(o.status as 'completed'|'processing'));
  const ids = [...new Set(active.flatMap(o => o.line_items.map(i => i.product_id)).filter(Boolean))];
  const products: WooProduct[] = [];
  for (let offset=0;offset<ids.length;offset+=100) {
    products.push(...z.array(productSchema).parse(await list('products',{include:ids.slice(offset,offset+100).join(',')})));
  }
  const refunds = new Map<number,z.infer<typeof refundSchema>[]>();
  for (const order of active) if (order.refunds.length) refunds.set(order.id,z.array(refundSchema).parse(await list('orders/'+order.id+'/refunds')));
  const document: DocumentInfo = { id:randomUUID(), name:'WooCommerce-'+input.source+'-'+input.start+'-'+input.end+'.json',hash:'',size:0,mime:'application/json',source:input.source,importedAt:new Date().toISOString(),sheets:[],batch:randomUUID(),extraction:'Captura de saídas WooCommerce: itens, quantidades e destino. Sem dados financeiros ou pessoais.' };
  return { movements:normalizeOrders(orders,products,refunds,state,input,document),orders:orders.length,document,input };
}
export function applyWoo(state: State, collected: Collected): WooSync {
  const { input, document, movements } = collected;
  const before: Movement[] = [];
  const keys = new Set(movements.map(m => m.woo!.orderId+':'+m.woo!.itemId));
  const existing = state.movements.filter(m => m.woo?.store === input.source);
  for (const old of existing) {
    if (old.date < input.start || old.date > input.end || keys.has(old.woo!.orderId+':'+old.woo!.itemId)) continue;
    if (old.woo?.inactive) continue;
    before.push(structuredClone(old));
    if(old.duplicateOf){const linked=state.movements.find(m=>m.id===old.duplicateOf);if(linked){before.push(structuredClone(linked));linked.status='pending';linked.issues=[...new Set([...linked.issues,'Conferir venda conciliada: item removido da captura WooCommerce'])];}}
    const reviewed=!!old.duplicateOf || old.origins.length>1 || state.audit.some(a=>a.target===old.id && ['Correção manual','Conciliação','Ignorar registro'].includes(a.action));
    old.status=reviewed?'pending':'ignored'; old.issues=reviewed?['Conferir remoção no WooCommerce após decisão manual']:[]; old.woo!.inactive=true;
    old.note='Fora da captura atual: cancelado, reembolsado, removido ou fora dos status selecionados.';
  }
  for (const incoming of movements) {
    const old = existing.find(m => m.woo!.orderId === incoming.woo!.orderId && m.woo!.itemId === incoming.woo!.itemId);
    if (old?.woo?.fingerprint === incoming.woo!.fingerprint && !old.woo.inactive) continue;
    if (old) {
      before.push(structuredClone(old));
      if(old.duplicateOf){const linked=state.movements.find(m=>m.id===old.duplicateOf);if(linked){before.push(structuredClone(linked));linked.status='pending';linked.issues=[...new Set([...linked.issues,'Conferir venda conciliada: item alterado no WooCommerce'])];}}
      // Preserve reconciliations and manual decisions; changed source data needs a human decision.
      if (old.duplicateOf || old.origins.length > 1 || state.audit.some(a => a.target === old.id && ['Correção manual','Conciliação','Ignorar registro'].includes(a.action))) {
        old.status='pending'; old.woo={...incoming.woo!}; old.origins.push(...incoming.origins); old.issues=[...new Set([...old.issues,'Conferir alteração no WooCommerce após decisão manual; consulte a nova captura.'])]; continue;
      }
      incoming.id=old.id;
      state.movements=state.movements.filter(m => m.id !== old.id);
    }
    reconcile(state,[incoming]);
    incoming.status=incoming.status==='ignored'?'ignored':incoming.issues.length?'pending':'accepted';
  }
  state.documents.push(document);
  state.unavailable[input.source]=false;
  delete state.lastValidation;
  const run: WooSync = { source:input.source,start:input.start,end:input.end,at:document.importedAt,documentId:document.id,orders:collected.orders,items:movements.length,pending:state.movements.filter(m => m.woo?.store === input.source && m.date >= input.start && m.date <= input.end && m.status === 'pending').length,statuses:input.statuses };
  state.wooSyncs=[...(state.wooSyncs||[]),run];
  state.audit.push({id:randomUUID(),at:run.at,action:'Importação WooCommerce',target:document.id,reason:input.source+': '+run.items+' itens; '+run.pending+' pendências. '+input.start+' a '+input.end+'.',before,after:run});
  return run;
}
