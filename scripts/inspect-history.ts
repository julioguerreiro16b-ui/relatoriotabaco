import { readFile } from 'node:fs/promises';
import { parseSpreadsheet } from '../src/lib/parsers';
import { emptyState, type DocumentInfo } from '../src/lib/model';
import ExcelJS from 'exceljs';
const filename=process.argv[2];if(!filename)throw new Error('Informe a planilha a analisar');
const doc:DocumentInfo={id:'inspection-only',name:'history.xlsx',source:'history',hash:'',size:0,mime:'',importedAt:new Date().toISOString(),sheets:[],batch:''};
async function main(){
 const result=await parseSpreadsheet(await readFile(filename),doc,emptyState());
 console.log(JSON.stringify({sheets:doc.sheets,movements:result.movements.length,references:result.references.length,opening:result.movements.filter(m=>m.kind==='OPENING_STOCK').length,drySnuff:result.movements.filter(m=>m.category==='DRY_SNUFF').length,mapacho:result.movements.filter(m=>m.category==='MAPACHO').length,unknown:result.movements.filter(m=>!m.category).length},null,2));
}
void main();
