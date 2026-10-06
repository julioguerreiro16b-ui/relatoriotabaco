import { guard, failure } from '@/server/auth';
import { getDocument, readState } from '@/server/store';
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {try{
  await guard(request);const {id}=await context.params;const state=await readState();const doc=state.documents.find(d=>d.id===id);if(!doc)return new Response('Não encontrado',{status:404});
  return new Response(new Uint8Array(await getDocument(id)),{headers:{'Content-Type':doc.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,'Cache-Control':'private, no-store'}});
}catch(e){return failure(e);} }
