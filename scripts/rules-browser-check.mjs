import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
const base='http://127.0.0.1:3000';
const before=await (await fetch(base+'/api/state')).json();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#history');await page.getByRole('heading',{name:'Histórico original',exact:true}).first().waitFor();
 const select=page.getByRole('combobox',{name:'Aba da planilha'});assert.equal(await select.locator('option').count(),8);
 await select.selectOption({label:'Resumo Mensal'});assert.ok(await page.locator('tbody tr').count()>0);
 await page.getByRole('button',{name:'Resumo mensal',exact:true}).click();await page.getByRole('button',{name:'LB',exact:true}).click();
 await page.getByRole('button',{name:'Vendas Flórida',exact:true}).click();assert.equal(await select.locator('option').count(),2);
 await page.getByRole('button',{name:/^Revisar dados/}).first().click();
 await page.getByRole('button',{name:'Revisar',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 await dialog.getByLabel('Quantidade de unidades', {exact:true}).fill('5');await dialog.getByLabel('Peso unitário · gramas',{exact:true}).fill('250');
 await dialog.getByText('1,250 KG · 2,756 LB',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const response=await fetch(base+'/api/export?report=all&year=2026');assert.equal(response.status,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.equal(workbook.worksheets.filter(s=>s.name.startsWith('Original ')).length,8);
 const after=await (await fetch(base+'/api/state')).json();assert.equal(after.version,before.version);assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: 8 historical tabs, Florida originals, KG/LB report, 5×250g live preview, mobile layout, Excel with 8 original sheets; no data changed.');
}finally{await browser.close();}
