import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { normalizeState, shippingFromText } from '../src/lib/shipping';
import { invoiceItem } from '../src/lib/weights';
import { parsePDF, parseSpreadsheet, fresh } from '../src/lib/parsers';
import { emptyState, type DocumentInfo } from '../src/lib/model';
import { lb, monthly, monthlyLb, reconcile, movementLb } from '../src/lib/domain';
import { runValidation } from '../src/server/validation';
import { applyImportRules } from '../src/server/import-rules';
import { action } from '../src/server/actions';
const doc:DocumentInfo={id:'test-document',name:'invoice.pdf',source:'outgoing',hash:'',size:0,mime:'application/pdf',importedAt:'2026-10-06',sheets:[],batch:'test'};
const header='SKU   ACTIVITY   QTY   RATE   AMOUNT';
const text=`BILL TO\nBilling Name\nMiami, FL 33101 USA\nSHIP TO\nShipping Name\n123 Main Street\nNevada City, CA 95959 USA\nINVOICE # 1234\nDATE 09/01/2026\n${header}\nRASC0502 Dry Snuff Parica 250g 5 125.00 625.00\nRASC0401 Dry Snuff Mint 500g 7 250.00 1750.00`;
test('shipping states normalize and foreign shipping countries override US-looking provinces',()=>{
 for(const [value,expected]of [['California','CA'],['Florida - FL','FL'],['CO','CO'],['','Não identificado'],['???','Não identificado']])assert.equal(normalizeState(value),expected);
 assert.equal(normalizeState('CA','Canada'),'Exterior');assert.equal(normalizeState('','Finland'),'Exterior');assert.equal(normalizeState('','USA'),'Não identificado');
 assert.equal(shippingFromText(text).state,'CA');assert.equal(shippingFromText('BILL TO\nMiami FL 33101 USA').state,'Não identificado');
});
test('invoice unit weights use QTY rather than rate and continue headers across pages',()=>{
 const result=parsePDF([{text,ocr:false},{text:'RASC0902 Dry Snuff Extra 250g 2 125.00 250.00',ocr:false},{text:'Payment instructions',ocr:false}],structuredClone(doc));
 assert.equal(result.movements.length,3);const m=result.movements[0];assert.equal(m.quantity,5);assert.equal(m.unitGrams,250);assert.equal(m.kg,1.25);assert.equal(lb(m.kg),2.7557782773125);assert.equal(m.state,'CA');assert.equal(m.date,'2026-09-01');assert.equal(m.sku,'RASC0502');assert.equal(result.movements[2].kg,.5);
 assert.equal(invoiceItem('Dry Snuff 250g 125.00 625.00','Description Rate Amount').kg,null);
 for(const line of ['Dry Snuff 250g 5 unds','Dry Snuff 5 x 250g','Dry Snuff 250g x 5'])assert.equal(invoiceItem(line,'').kg,1.25);
});
test('history preserves original pounds and inconsistent totals without checking them',async()=>{
 const s=emptyState(),historicalDoc={...doc,source:'history' as const,name:'history.xlsx'};s.documents=[historicalDoc];
 const m=fresh(historicalDoc,{kg:10,originalLb:99,date:'2026-01-01',category:'DRY_SNUFF',issues:['Old issue']});reconcile(s,[m]);assert.equal(m.status,'accepted');assert.deepEqual(m.issues,[]);assert.equal(movementLb(m),99);
 s.references=[{id:'closing',documentId:doc.id,sheet:'Resumo Mensal',row:1,month:'2026-01',category:'DRY_SNUFF',metric:'closing',kg:-20,originalLb:777,trusted:true}];
 assert.equal(monthly(s,'DRY_SNUFF',2026)[0].closing,-20);assert.equal(monthlyLb(monthly(s,'DRY_SNUFF',2026)[0],'closing'),777);assert.equal(monthly(s,'DRY_SNUFF',2026)[1].opening,-20);
 await runValidation(s,async()=>{throw new Error('Historical document must not be checked');});assert.equal(s.lastValidation?.documents,0);assert.equal(s.lastValidation?.movements,0);assert.equal(s.lastValidation?.historicalSkipped,1);assert.equal(s.lastValidation?.findings.filter(f=>f.check==='history'||f.check==='documents').length,0);
 assert.throws(()=>action(s,{action:'edit',id:m.id,fields:m,reason:'test'}),/Histórico/);
});
test('new CSV rows calculate units while historical CSV values remain untouched',async()=>{
 const csv=Buffer.from('Data;Invoice;Produto;Quantidade;KG;LB;Estado\n2026-09-01;1;Dry Snuff 250g;5;999;888;California');
 const result=await parseSpreadsheet(csv,{...doc,name:'new.csv'},emptyState());assert.equal(result.movements[0].kg,1.25);assert.equal(result.movements[0].state,'CA');
 const history=await parseSpreadsheet(csv,{...doc,name:'old.csv',source:'history'},emptyState());assert.equal(history.movements[0].kg,999);assert.equal(history.movements[0].originalLb,888);assert.equal(history.movements[0].state,'California');
});
test('migration accepts history, retains original data, expands pending invoices and runs only once',async()=>{
 const wb=new ExcelJS.Workbook();wb.addWorksheet('Saidas2026').addRows([['Data','Invoice','KG'],['2026-01-01','OLD',10]]);const bytes=Buffer.from(await wb.xlsx.writeBuffer());
 const s=emptyState();s.initialized=true;const hd={...doc,id:'history-document',name:'history.xlsx',source:'history' as const};s.documents=[hd,structuredClone(doc)];
 const old=fresh(hd,{kg:10,originalLb:123,category:'DRY_SNUFF',status:'pending',issues:['Old issue']});const pending=fresh(doc,{note:text,status:'pending',origins:[{documentId:doc.id,file:doc.name,source:'outgoing',page:1}]});s.movements=[old,pending];
 await applyImportRules(s,async()=>bytes);assert.equal(old.kg,10);assert.equal(old.originalLb,123);assert.equal(old.status,'accepted');assert.equal(pending.status,'ignored');assert.equal(s.movements.length,4);assert.equal(s.documents[0].historicalSheets?.length,1);assert.equal(s.movements[2].kg,1.25);const length=s.movements.length;await applyImportRules(s,async()=>bytes);assert.equal(s.movements.length,length);
});
