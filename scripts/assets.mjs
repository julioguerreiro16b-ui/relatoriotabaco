import { copyFile, mkdir, cp, access, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
await mkdir('public', { recursive: true });
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdf.worker.min.mjs');
await mkdir('public/ocr', { recursive: true });
await copyFile('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
await cp('node_modules/tesseract.js-core', 'public/ocr/core', { recursive: true });
await mkdir('public/ocr/lang', {recursive:true});
try { await access('public/ocr/lang/eng.traineddata.gz'); }
catch {
  const response=await fetch('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata');
  if(!response.ok)throw new Error('Falha ao baixar o modelo OCR em inglês. Execute npm run postinstall novamente.');
  await writeFile('public/ocr/lang/eng.traineddata.gz',gzipSync(Buffer.from(await response.arrayBuffer())));
}
