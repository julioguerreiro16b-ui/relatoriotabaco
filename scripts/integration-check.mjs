import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import ExcelJS from 'exceljs';
const base='http://127.0.0.1:3001';
async function read(){const r=await fetch(base+'/api/state');assert.equal(r.status,200);return r.json();}
async function action(payload){const state=await read();const r=await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({...payload,version:state.version})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
async function upload(name,text,source){const form=new FormData();form.set('file',new File([text],name,{type:'text/csv'}));form.set('source',source);const r=await fetch(base+'/api/import',{method:'POST',headers:{Origin:base},body:form});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
const initial=await read();assert.equal(initial.documents.length,0,'Run with a fresh QA data directory');
const csv='Data;Invoice;Cliente;Destinatário;Estado;Categoria;Quantidade;Peso unitário g;KG\n2026-01-10;QA-1;Cliente QA;Cliente QA;FL;Dry Snuff;3;250;0.75\n2026-01-10;QA-2;Cliente QA;Cliente QA;CA;Mapacho;2;100;0.2\n';
const uploaded=await upload('qa.csv',csv,'outgoing');assert.equal(uploaded.count,2);assert.equal(uploaded.state.movements.filter(m=>m.status==='accepted').length,0);
const twice=await upload('qa-repeated.csv',csv,'outgoing');assert.equal(twice.duplicate,true);
await action({action:'opening',category:'DRY_SNUFF',date:'2026-01-01',kg:100,reason:'Synthetic QA fixture'});
await action({action:'opening',category:'MAPACHO',date:'2026-01-01',kg:30,reason:'Synthetic QA fixture'});
await action({action:'checklist',unavailable:{history:true,incoming:true,entry:true,sacred:true,haux:true,natural:true,loss:true,products:true}});
const committed=await action({action:'commit',confirmed:true});assert.equal(committed.initialized,true);assert.equal(committed.movements.filter(m=>m.status==='accepted').length,4);
const cross=await fetch(base+'/api/state',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://invalid.example'},body:JSON.stringify({action:'settings',keywords:['bad']})});assert.equal(cross.status,400);
const conflict=csv.replace('0.75','0.90');const conflictUpload=await upload('qa-conflict.csv',conflict,'outgoing');assert.ok(conflictUpload.state.movements.some(m=>m.issues.some(i=>i.includes('CONFLITO'))));
const exportResponse=await fetch(base+'/api/export?report=all&year=2026');assert.equal(exportResponse.status,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));assert.equal(workbook.worksheets.length,9);const summary=workbook.getWorksheet('Resumo Mensal');assert.equal(summary.getCell('O2').value,99.25);assert.equal(summary.getCell('O14').value,29.8);
const id=committed.documents[0].id;const download=await fetch(base+'/api/documents/'+id);assert.equal(await download.text(),csv);
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/#summary');await page.getByRole('heading',{name:'Resumo mensal de estoque'}).waitFor();await page.getByRole('button',{name:'99,250',exact:true}).first().click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Fechar',exact:true}).click();
await page.getByRole('button',{name:'Vendas Flórida',exact:true}).click();await page.getByRole('heading',{name:'Dry Snuff · Flórida'}).waitFor();await page.screenshot({path:'artifacts/florida-qa.png',fullPage:true});
await page.getByRole('button',{name:'Revisar dados',exact:false}).first().click();await page.getByRole('button',{name:'Revisar',exact:true}).first().click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Fechar',exact:true}).click();
// Generate a text PDF, then an image-only PDF to exercise the real OCR fallback in the browser.
const pdfPage=await browser.newPage();await pdfPage.setContent('<h1>Invoice # QA-PDF-1</h1><p>Invoice date: 2026-01-15</p><p>Dry Snuff 2 kg</p><p>Ship to: QA Customer</p>');
const direct=await pdfPage.pdf({format:'A4'});
await page.getByRole('button',{name:'Importar arquivos',exact:true}).click();await page.locator('#source').selectOption('outgoing');await page.locator('input[type=file]').setInputFiles({name:'qa-text.pdf',mimeType:'application/pdf',buffer:direct});
await page.getByText('qa-text.pdf',{exact:true}).waitFor({timeout:60000});
const scannedData=await pdfPage.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,600);ctx.fillStyle='black';ctx.font='36px Arial';ctx.fillText('Invoice # QA-SCAN-1',50,100);ctx.fillText('Invoice date: 2026-01-16',50,180);ctx.fillText('Dry Snuff 3 kg',50,260);ctx.fillText('Ship to: QA Customer',50,340);return canvas.toDataURL('image/png');});
await pdfPage.setContent(`<img src="${scannedData}" style="width:600px"/>`);const scanned=await pdfPage.pdf({format:'A4'});
await page.locator('input[type=file]').setInputFiles({name:'qa-scan.pdf',mimeType:'application/pdf',buffer:scanned});
await page.getByText('qa-scan.pdf',{exact:true}).waitFor({timeout:120000});
const final=await read();assert.ok(final.documents.find(d=>d.name==='qa-scan.pdf').extraction.includes('OCR'));assert.ok(final.documents.find(d=>d.name==='qa-text.pdf').extraction.includes('diretamente'));assert.equal(errors.length,0,errors.join('\n'));
await browser.close();console.log('PASS: upload, duplicate hash, opening, checklist, commit, CSRF, conflict, XLSX calculations, source download, summary drilldown, review, PDF text and scanned OCR.');
