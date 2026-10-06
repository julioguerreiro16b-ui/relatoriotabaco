import { createHash, randomUUID } from 'node:crypto';
import type { State } from '@/lib/model';
import { validateAll } from '@/lib/validation';
import { getDocument } from './store';

export async function runValidation(state:State, readDocument=getDocument){
  const run=validateAll(state,randomUUID(),new Date().toISOString());
  for(const doc of state.documents.filter(d=>d.source!=='history')){
    try{
      const bytes=await readDocument(doc.id);
      if(bytes.length!==doc.size||createHash('sha256').update(bytes).digest('hex')!==doc.hash)run.findings.push({check:'documents',severity:'error',message:`${doc.name}: tamanho ou assinatura do arquivo diverge do original registrado.`,documentId:doc.id});
    }catch{run.findings.push({check:'documents',severity:'error',message:`${doc.name}: não foi possível ler o documento armazenado.`,documentId:doc.id});}
  }
  for(const check of run.checks)check.findings=run.findings.filter(f=>f.check===check.key).length;
  const badDocuments=new Set(run.findings.filter(f=>f.check==='documents').map(f=>f.documentId));
  const badMovements=new Set(run.findings.flatMap(f=>f.movementIds||[]));
  run.cleanMovements=state.movements.filter(m=>!m.historical&&!['ignored','duplicate'].includes(m.status)&&!badMovements.has(m.id)&&!m.origins.some(o=>badDocuments.has(o.documentId))).length;
  state.lastValidation=run;
  state.audit.push({id:randomUUID(),at:run.at,action:'Validação completa',target:run.id,reason:`${run.movements} registros e ${run.documents} documentos verificados; ${run.findings.length} ocorrências. Nenhum lançamento foi alterado.`,after:{checks:run.checks,cleanMovements:run.cleanMovements,findings:run.findings.length}});
}
