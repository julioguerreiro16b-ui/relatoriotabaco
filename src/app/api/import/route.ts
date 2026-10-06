import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { guard, failure } from '@/server/auth';
import { readState, putDocument, updateState } from '@/server/store';
import { parseSpreadsheet, parsePDF } from '@/lib/parsers';
import { reconcile } from '@/lib/domain';
import { SOURCES, type DocumentInfo, type Source } from '@/lib/model';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request) { try {
  await guard(request,true);
  if(Number(request.headers.get('content-length'))>4*1024*1024)throw new Error('Envie arquivos de até 3 MB por vez.');
  const form=await request.formData(); const file=form.get('file');const source=String(form.get('source')) as Source;
  if(!(file instanceof File)||file.size>3*1024*1024)throw new Error('Arquivo ausente ou maior que 3 MB. Divida o documento.');
  if(!SOURCES.some(s=>s.key===source))throw new Error('Fonte inválida');
  if(!/\.(xlsx|csv|pdf)$/i.test(file.name))throw new Error('Use arquivos XLSX, CSV ou PDF.');
  const bytes=Buffer.from(await file.arrayBuffer());const hash=createHash('sha256').update(bytes).digest('hex');
  const current=await readState();const existing=current.documents.find(d=>d.hash===hash);
  if(existing)return Response.json({duplicate:true,name:existing.name,state:current});
  const doc:DocumentInfo={id:randomUUID(),name:file.name.replace(/[\\/]/g,'_'),hash,size:file.size,mime:/\.pdf$/i.test(file.name)?'application/pdf':/\.csv$/i.test(file.name)?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',source,importedAt:new Date().toISOString(),sheets:[],batch:randomUUID()};
  const parsed=/\.pdf$/i.test(file.name)?parsePDF(z.array(z.object({text:z.string().max(100000),ocr:z.boolean()})).min(1).max(40).parse(JSON.parse(String(form.get('pages')||'[]'))),doc):await parseSpreadsheet(bytes,doc,current);
  await putDocument(doc.id,bytes);
  const result=await updateState(s=>{
    if(s.documents.some(d=>d.hash===hash))return {duplicate:true};
    s.documents.push(doc);s.unavailable[source]=false;
    s.references??=[];s.references.push(...parsed.references);
    for(const product of parsed.products) if(!s.products.some(p=>p.sku===product.sku))s.products.push(product);
    reconcile(s,parsed.movements);
    s.audit.push({id:randomUUID(),at:doc.importedAt,action:'Importação para análise',target:doc.id,reason:`${doc.name}: ${parsed.movements.length} registros, ${parsed.products.length} produtos. Original preservado.`});
    return {duplicate:false,count:parsed.movements.length};
  });
  return Response.json({...result,name:doc.name,state:await readState()});
}catch(e){return failure(e);} }
