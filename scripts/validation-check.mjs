import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3001';
const before=await (await fetch(base+'/api/state')).json();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByRole('button',{name:'Validar e verificar tudo',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:'Resultado da verificação completa'}).waitFor();
  assert.equal(await dialog.locator('.validation-checks>div').count(),8);
  const after=await (await fetch(base+'/api/state')).json();assert.deepEqual(after.movements,before.movements);assert.equal(after.initialized,before.initialized);assert.equal(after.lastValidation.version,after.version);assert.equal(after.lastValidation.movements,before.movements.filter(m=>!['ignored','duplicate'].includes(m.status)).length);
  await dialog.getByRole('button',{name:'Fechar',exact:true}).click();await page.reload();await page.getByRole('button',{name:'Última verificação',exact:true}).click();await dialog.waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  await dialog.getByRole('button',{name:'Abrir revisão de dados'}).click();await page.getByRole('heading',{name:'Revisar dados',exact:true}).waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: one-click full validation, eight checks, persistent report, unchanged movements, review navigation, mobile layout.');
}finally{await browser.close();}
