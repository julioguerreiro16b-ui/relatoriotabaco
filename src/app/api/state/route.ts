import { guard, failure } from '@/server/auth';
import { readState, updateState } from '@/server/store';
import { action } from '@/server/actions';
import { runValidation } from '@/server/validation';
import { applyImportRules } from '@/server/import-rules';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request) { try { await guard(request);return Response.json(await readState(),{headers:{'Cache-Control':'no-store'}}); } catch(e){return failure(e);} }
export async function POST(request:Request) { try { await guard(request,true);const body=await request.json();await updateState(s=>body.action==='apply_import_rules'?applyImportRules(s):body.action==='validate_all'?runValidation(s):action(s,body),body.version);return Response.json(await readState(),{headers:{'Cache-Control':'no-store'}}); }catch(e){return failure(e);} }
