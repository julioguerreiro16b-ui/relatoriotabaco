import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { randomUUID } from 'node:crypto';
import { norm, validDate } from './domain';
import type { DocumentInfo, Movement, Source, State, Product, Category, HistoricalReference } from './model';
import { parseMonth } from './history';
import { normalizeState, shippingFromText } from './shipping';
import { gramsInProduct, invoiceItem, kgFromUnits } from './weights';
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  else if (s.includes(',')) s = s.replace(',','.');
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
export function date(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0,10);
  if (typeof v === 'number' && v > 20000 && v < 100000) return new Date(Date.UTC(1899,11,30) + v * 86400000).toISOString().slice(0,10);
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return validDate(s.slice(0,10)) ? s.slice(0,10) : '';
  const m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) { const d = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; return validDate(d) ? d : ''; }
  return '';
}
export function fresh(doc: DocumentInfo, patch: Partial<Movement> = {}): Movement {
  return { id: randomUUID(), date: '', invoice: '', order: '', customer: '', recipient: '', state: '', address: '', category: '', kind: doc.source === 'incoming' || doc.source === 'entry' ? 'ENTRY' : doc.source === 'loss' ? 'LOSS' : ['sacred','haux','natural'].includes(doc.source) ? 'SITE_SALE' : 'WHOLESALE_SALE', kg: null, sku: '', product: '', quantity: null, unitGrams: null, site: ({sacred:'Sacred',haux:'Haux Haux',natural:'Natural Medicine'} as Record<string,string>)[doc.source] || '', transport: '', cargo: '', country: '', amount: null, origins: [{ documentId: doc.id, file: doc.name, source: doc.source }], importedAt: doc.importedAt, status: 'staged', issues: [], historical: doc.source === 'history', note: '', ...patch };
}
function category(v: unknown): Category | '' { const n = norm(v); if (/mapacho/.test(n)) return 'MAPACHO'; if (/dry.?snuff|rape|rapé/.test(n)) return 'DRY_SNUFF'; return ''; }
type Cell = string | number | Date | null;
function cell(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'string' || typeof v === 'number') return v;
  if (typeof v === 'object') {
    if ('result' in v) return cell(v.result as ExcelJS.CellValue);
    if ('error' in v) return String(v.error);
    if ('richText' in v) return v.richText.map(t => t.text).join('');
    if ('text' in v) return v.text;
  }
  return String(v);
}
const ALIASES: Record<string,string[]> = {
  date: ['date','data','data de saida','data de entrega','created at','paid at','order date','shipping date'],
  invoice: ['invoice','invoice n°','invoice nº','invoice no','invoice number','numero da invoice'],
  order: ['order','order id','order number','numero do pedido','pedido','name'],
  customer: ['cliente','customer','customer name','billing name'], recipient: ['destinatario','shipping name','recipient','ship to'],
  state: ['estado','estado de entrega','shipping province','shipping province code','shipping state','estado do destinatario','state'],
  shippingCountry:['shipping country','shipping country code','destination country','pais de entrega','pais do destinatario'],
  address: ['shipping address','shipping address1','endereco de entrega'], sku: ['sku','lineitem sku','product sku'],
  product: ['produto','product','product name','lineitem name','nome do produto'],
  category: ['categoria','category','tipo de produto'], kg: ['kg','peso kg','weight kg','quantidade rape (kg)','dry snuff kg','mapacho kg','quantity of snuff (kg)'],
  pounds: ['lb','peso lb','quantidade rape (ib)','quantidade rape (lb)','weight lb'],
  quantity: ['quantity','quantidade','lineitem quantity','qty','qtd','unds','unidades','units'], grams: ['peso unitario','peso unitario g','unit grams','gramas','gramatura','tamanho g'],
  transport: ['transporte','transport'], cargo: ['cargo/courier','cargo ou courier','modal'], country: ['origem','country'], amount: ['total','valor','amount'],
};
export interface Parsed { movements: Movement[]; products: Product[]; references:HistoricalReference[] }
function table(rows: Cell[][], sheetName: string, doc: DocumentInfo, state: State): Parsed {
  const out: Parsed = { movements: [], products: [], references:[] };
  let columns: Record<string,number> = {}, section: Category | '' = '', headerFound = false;
  const summary = /resumo|balanco|qty sales|florida/.test(norm(sheetName));
  let summaryCategory:Category|''='DRY_SNUFF';
  const summaryMonths:Record<number,string>={};
  const reference=(row:number,month:string,cat:Category|'',metric:HistoricalReference['metric'],kg:Cell,originalLb:Cell)=>{
    const weight=num(kg);if(!month||weight===null)return;
    out.references.push({id:randomUUID(),documentId:doc.id,sheet:sheetName,row,month,category:cat,metric,kg:weight,originalLb:num(originalLb),trusted:doc.source==='history'});
  };
  doc.sheets.push({ name: sheetName, rows: rows.length, treatment: doc.source==='history'?'Histórico aceito como correto, reproduzido sem correção ou verificação.':summary?'Resumo recebido como referência.':'Registros individuais para análise' });
  for (let i=0; i<rows.length; i++) {
    const row = rows[i]; if (!row.some(v => v !== null && v !== '')) continue;
    const names = row.map(norm);
    if (summary) {
      const rowText=row.filter(v=>v!==null&&v!=='').join(' ');
      if(category(rowText)&&!parseMonth(row[0]))summaryCategory=category(rowText);
      else if(/chewing tobacco/.test(norm(rowText))&&!/resumo/.test(norm(sheetName)))summaryCategory=doc.source==='history'?'MAPACHO':'';
      if(/balanco/.test(norm(sheetName))) {
        const month=parseMonth(row[0]);if(month){reference(i+1,month,summaryCategory,'entries',row[1],row[2]);reference(i+1,month,summaryCategory,'outgoing',row[3],row[4]);reference(i+1,month,summaryCategory,'balance',row[5],row[6]);}
      }else if(/qty sales|florida/.test(norm(sheetName))) {
        const month=parseMonth(row[0]);if(month)reference(i+1,month,summaryCategory,'florida',row[summaryCategory==='DRY_SNUFF'?10:2],row[summaryCategory==='DRY_SNUFF'?11:3]);
      }else if(/resumo/.test(norm(sheetName))) {
        for(const col of [0,4]){
          const month=parseMonth(row[col]);if(month)summaryMonths[col]=month;
          const label=norm(row[col]);
          const metric:HistoricalReference['metric']|undefined=/estoque inicial/.test(label)?'opening':/estoque final/.test(label)?'closing':/^entradas?/.test(label)?'entries':/saida.*atacado/.test(label)?'wholesale':/saida.*sites?/.test(label)?'sites':/saida.*perda|^perdas?/.test(label)?'losses':undefined;
          if(metric)reference(i+1,summaryMonths[col],col===0?'DRY_SNUFF':'MAPACHO',metric,row[col+1],row[col+2]);
        }
      }
      // Historical stock counts are trusted; new counts require confirmation.
      for (const col of [0,4]) if (/contagem de estoque/.test(norm(row[col]))) {
        const when = String(row[col]).match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
        out.movements.push(fresh(doc, { date: date(when), category: col === 0 ? 'DRY_SNUFF' : 'MAPACHO', kind: 'OPENING_STOCK', kg: num(row[col+1]),originalLb:num(row[col+2])??undefined, issues: doc.source==='history'?[]:['Conferir contagem: saldo no início da data informada'], origins: [{ documentId: doc.id, file: doc.name, source: doc.source, sheet: sheetName, row: i+1 }] }));
      }
      continue;
    }
    const isHeader = names.some(n => ALIASES.invoice.includes(n) || ALIASES.sku.includes(n) || n === 'order id' || n === 'lineitem name') && names.some(n => ALIASES.date.includes(n) || ALIASES.grams.includes(n) || ALIASES.product.includes(n));
    if (isHeader) {
      columns = {}; for (const [key, values] of Object.entries(ALIASES)) { const col = names.findIndex(n => values.includes(n)); if (col >= 0) columns[key] = col; }
      headerFound = true;
      const headerCategory = category(row.join(' ')); if (headerCategory && (!section || headerCategory === 'MAPACHO')) section = headerCategory;
      continue;
    }
    const text = row.filter(v => v !== null && v !== '').join(' ');
    // Excel repeats the master value of merged cells. Count distinct values, not cells.
    if (new Set(row.filter(v => v !== null && v !== '').map(String)).size <= 2 && category(text)) { section = category(text); continue; }
    if (!headerFound) continue;
    const get = (key:string) => columns[key] === undefined ? null : row[columns[key]];
    const str = (key:string) => String(get(key) ?? '').trim();
    if (/^total|^subtotal/.test(norm(row[0]))) continue;
    if (doc.source === 'products') {
      const cat = category(get('category')); const grams = num(get('grams'));
      if (str('sku') && cat && grams !== null && grams > 0) out.products.push({ id: randomUUID(), sku: str('sku'), name: str('product'), category: cat, unitGrams: grams });
      else if (row.some(Boolean)) out.movements.push(fresh(doc,{sku:str('sku'),product:str('product'),issues:['Formato de cadastro incompleto: informe SKU, categoria e peso unitário em Produtos']}));
      continue;
    }
    if (!str('invoice') && !str('order') && !get('date') && (num(get('kg')) === null || num(get('kg')) === 0)) continue;
    const qty = num(get('quantity'));
    const explicitSize = gramsInProduct(str('product'));
    const grams = num(get('grams')) ?? explicitSize;
    const annotation = row.find(v => /^mapacho(?: rolls)?$/i.test(String(v ?? '').trim()));
    const ambiguousTobacco = row.some(v => /^chewing tobacco$/i.test(String(v ?? '').trim()));
    const cat = category(get('category')) || category(get('product')) || category(annotation) || (ambiguousTobacco ? doc.source==='history'?'MAPACHO':'' : section);
    const kind = /entradas/.test(norm(sheetName)) ? 'ENTRY' : undefined;
    const loss = state.lossKeywords.some(k => k.trim() && norm(text).includes(norm(k)));
    const m = fresh(doc, { date: date(get('date')), invoice: str('invoice'), order: str('order'), customer: str('customer'), recipient: str('recipient'), state: str('state'), address: str('address'), sku: str('sku'), product: str('product'), category: cat, quantity: qty, unitGrams: grams, kg: num(get('kg')) ?? (qty !== null && grams !== null ? qty * grams / 1000 : null), originalLb: num(get('pounds')) ?? undefined, transport: str('transport'), cargo: str('cargo'), country: str('country'), amount: num(get('amount')), origins: [{ documentId: doc.id, file: doc.name, source: doc.source, sheet: sheetName, row: i+1 }] });
    if (kind) m.kind = kind; if (loss) m.kind = 'LOSS';
    m.shippingCountry=str('shippingCountry');
    if(doc.source!=='history'){
      m.state=normalizeState(str('state'),m.shippingCountry);
      m.kg=kgFromUnits(qty,grams)??m.kg;
    }
    out.movements.push(m);
  }
  if (!headerFound && !summary) out.movements.push(fresh(doc,{ issues: ['Formato não reconhecido: use o modelo CSV ou preencha o registro manualmente'], origins: [{documentId:doc.id,file:doc.name,source:doc.source,sheet:sheetName}] }));
  return out;
}
export async function parseSpreadsheet(bytes: Buffer, doc: DocumentInfo, state: State): Promise<Parsed> {
  let sheets: {name:string; rows:Cell[][]}[];
  if (/\.csv$/i.test(doc.name)) {
    const result = Papa.parse<string[]>(bytes.toString('utf8').replace(/^\uFEFF/,''), {skipEmptyLines:true});
    if (result.errors.length) throw new Error('CSV inválido: ' + result.errors[0].message);
    sheets = [{ name: doc.name, rows: result.data }];
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    sheets = workbook.worksheets.map(sheet => {
      if (sheet.rowCount > 20000 || sheet.columnCount > 100) throw new Error('A planilha excede 20.000 linhas ou 100 colunas. Divida o arquivo.');
      const rows: Cell[][] = []; sheet.eachRow({includeEmpty:true}, row => { const r: Cell[] = []; for(let c=1;c<=Math.min(sheet.columnCount,100);c++) r.push(cell(row.getCell(c).value)); rows.push(r); });
      return { name: sheet.name, rows };
    });
  }
  const result: Parsed = {movements:[],products:[],references:[]};
  if(doc.source==='history')doc.historicalSheets=sheets.map(s=>({name:s.name,rows:s.rows.map(row=>row.map(v=>v instanceof Date?v.toLocaleDateString('pt-BR',{timeZone:'UTC'}):v))}));
  for (const sheet of sheets) { const p = table(sheet.rows,sheet.name,doc,state); result.movements.push(...p.movements); result.products.push(...p.products); result.references.push(...p.references); }
  return result;
}
export function parsePDF(pages: {text:string; ocr:boolean}[], doc: DocumentInfo): Parsed {
  const movements: Movement[] = [];
  doc.extraction = pages.some(p => p.ocr) ? 'Texto + OCR nas páginas sem texto' : 'Texto extraído diretamente';
  const fullText=pages.map(p=>p.text).join('\n');
  const documentInvoice=fullText.match(/invoice\s*(?:number|no\.?|n[º°]|#|:)\s*[:#]?\s*([a-z0-9-]+)/i)?.[1]||'';
  const shipping=shippingFromText(fullText);
  const tableHeader=fullText.split('\n').find(line=>/\b(?:QTY|QUANTITY|QTD)\b/i.test(line)&&/ACTIVITY|DESCRIPTION|DESCRI[CÇ][AÃ]O/i.test(line))||'';
  const quickbooksUS=/SKU\s+ACTIVITY\s+QTY\s+RATE\s+AMOUNT/i.test(tableHeader);
  const pdfDate=(raw:string|undefined)=>{
    if(quickbooksUS&&raw&&/^\d{2}\/\d{2}\/\d{4}$/.test(raw)){const [mm,dd,yyyy]=raw.split('/');const d=`${yyyy}-${mm}-${dd}`;return validDate(d)?d:'';}
    return date(raw);
  };
  const headerDate=fullText.match(/(?:^|\n)\s*(?:invoice date|data|date)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i)?.[1];
  pages.forEach((page,i) => {
    const t = page.text;
    const invoice = t.match(/invoice\s*(?:number|no\.?|n[º°]|#|:)\s*[:#]?\s*([a-z0-9-]+)/i)?.[1] || documentInvoice;
    const delivery = t.match(/(?:delivery date|data de entrega)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i)?.[1];
    const rawDate = delivery || t.match(/(?:invoice date|data|date)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i)?.[1];
    const recipient = shipping.recipient;
    const customer = fullText.match(/(?:customer|cliente)\s*:\s*([^\n]+)/i)?.[1]?.trim() || fullText.match(/(?:^|\n)\s*BILL TO\s*:?\s*\n([^\n]+)/i)?.[1]?.trim()||'';
    const lines = t.split('\n');
    const productLines = lines.filter(line => (category(line)||tableHeader&&/^[A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*\s+/i.test(line.trim())) && /\d\s*(?:g|grs?|grams?|gramas?|kg)\b/i.test(line));
    // A continuation page containing only totals or payment instructions creates no stock movement.
    const candidates = productLines.length ? productLines : i===0?['']:[];
    candidates.forEach(line => {
      const item=invoiceItem(line,tableHeader);
      const net=line.match(/(?:net weight|peso l[ií]quido)\s*:?\s*([\d.,]+)\s*kg\b/i);
      const kg=item.kg??(net?num(net[1]):null);
      movements.push(fresh(doc,{invoice,customer,recipient,state:shipping.state,shippingCountry:shipping.shippingCountry,address:shipping.address,date:pdfDate(rawDate||headerDate),category:category(line),kg,sku:item.sku,quantity:item.quantity,unitGrams:item.unitGrams,product:line.trim(),issues:[...(page.ocr?['PDF: conferir campos obtidos por OCR']:[]),...(!delivery&&doc.source==='entry'?['Conferir data de entrega: não identificada explicitamente']:[])],note:t.slice(0,12000),origins:[{documentId:doc.id,file:doc.name,source:doc.source,page:i+1}]}));
    });
  });
  return { movements, products: [], references:[] };
}
