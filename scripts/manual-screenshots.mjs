import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Intercept every API call: screenshots never read or write company data.
const state = {
  version: 0, initialized: true, documents: [], movements: [], products: [],
  audit: [], unavailable: {}, lossKeywords: ['Crypto'], references: [], storage: 'turso',
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.route('**/api/**', route => route.request().url().endsWith('/api/state') && route.request().method() === 'GET'
    ? route.fulfill({ json: state })
    : route.fulfill({ status: 403, json: { error: 'Documentation preview is read-only.' } }));
  await mkdir('public/manual', { recursive: true });
  await mkdir('artifacts', { recursive: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [view, name] of [['import', 'importar'], ['review', 'revisar'], ['summary', 'relatorios']]) {
    await page.goto(`http://127.0.0.1:3000/#${view}`);
    await page.reload();
    await page.locator('.sidebar').waitFor();
    await page.locator(`.nav-item.active`).filter({ hasText: view === 'import' ? 'Importar arquivos' : view === 'review' ? 'Revisar dados' : 'Resumo mensal' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `public/manual/${name}.png`, animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Manual de uso', exact: true }).click();
  await page.getByRole('heading', { name: 'Manual de uso', exact: true }).waitFor();
  await page.locator('.manual-image img').evaluateAll(async images => {
    await Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); }));
  });
  await page.locator('.manual-image').first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.screenshot({ path: 'artifacts/manual-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Produtos e gramaturas', exact: true }).click();
  await page.getByRole('heading', { name: 'Produtos e gramaturas', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Manual de uso', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile horizontal overflow');
  await page.screenshot({ path: 'artifacts/manual-mobile.png', fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: 'artifacts/manual-mobile-top.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Manual de uso', exact: true }).click();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: 3 demonstration screenshots, manual navigation, image zoom, references and mobile layout.');
} finally {
  await browser.close();
}
