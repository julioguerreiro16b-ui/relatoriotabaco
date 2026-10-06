import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
const localSecret = randomBytes(32).toString('hex');
function secret() {
  const key = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!key || key.length < 32 || !process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 12 || !process.env.APP_ORIGIN)) throw new Error('Configure APP_PASSWORD (12+ caracteres), SESSION_SECRET (32+) e APP_ORIGIN antes de publicar.');
  return key || localSecret;
}
export function localMode() { return process.env.NODE_ENV !== 'production' && !process.env.APP_PASSWORD; }
export function safeEqual(a:string,b:string) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
export function token() { const payload=String(Date.now()+12*60*60*1000); return payload+'.'+createHmac('sha256',secret()).update(payload).digest('hex'); }
export async function authorized() {
  if (localMode()) return true;
  const key = secret();
  const raw = (await cookies()).get('hf_session')?.value || '';
  const [expiry,signature] = raw.split('.');
  return Number(expiry)>Date.now() && !!signature && safeEqual(signature,createHmac('sha256',key).update(expiry).digest('hex'));
}
export async function guard(request: Request, mutate = false) {
  if (!(await authorized())) throw new Error('AUTH_REQUIRED');
  if (mutate) checkOrigin(request);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if(process.env.NODE_ENV!=='production' && !process.env.APP_ORIGIN && origin){
    const candidate=new URL(origin), target=new URL(request.url);
    if(['localhost','127.0.0.1'].includes(candidate.hostname)&&candidate.port===target.port&&candidate.protocol==='http:')return;
  }
  if (origin !== expected) throw new Error('Origem da requisição inválida');
}
export function failure(error:unknown) {
  const message = error instanceof Error ? error.message : 'Falha ao processar solicitação';
  return Response.json({error:message}, {status:message==='AUTH_REQUIRED'?401:400,headers:{'Cache-Control':'no-store'}});
}
