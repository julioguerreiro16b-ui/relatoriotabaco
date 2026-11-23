import { createHash } from 'node:crypto';
import { guard, failure } from '@/server/auth';
import { readState, updateState, putDocument } from '@/server/store';
import { applyWoo, collectWoo, syncSchema, wooConnections } from '@/server/woocommerce';

export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request: Request) {
  try { await guard(request); return Response.json({stores:wooConnections()},{headers:{'Cache-Control':'no-store'}}); }
  catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    await guard(request,true);
    const input=syncSchema.parse(await request.json());
    const current=await readState();
    const collected=await collectWoo(input,current);
    const bytes=Buffer.from(JSON.stringify({period:input,orders:collected.orders,items:collected.movements},null,2));
    collected.document.hash=createHash('sha256').update(bytes).digest('hex');
    collected.document.size=bytes.length;
    await putDocument(collected.document.id,bytes);
    // Network reads finish before the short transaction. Concurrent edits require a fresh sync.
    const run=await updateState(state=>applyWoo(state,collected),current.version);
    return Response.json({run},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return failure(error); }
}
