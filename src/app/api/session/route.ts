import { cookies } from 'next/headers';
import { checkOrigin, failure, safeEqual, token, localMode } from '@/server/auth';
const attempts=new Map<string,{count:number;until:number}>();
export async function POST(request:Request) { try {
  checkOrigin(request);
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]||'local';const current=attempts.get(ip);
  if(current&&current.until>Date.now()&&current.count>=5)throw new Error('Muitas tentativas. Aguarde 15 minutos.');
  const {password}=await request.json();
  if(!localMode() && (typeof password!=='string'||!safeEqual(password,process.env.APP_PASSWORD||''))) {
    attempts.set(ip,{count:current&&current.until>Date.now()?current.count+1:1,until:Date.now()+900000});throw new Error('Senha incorreta');
  }
  (await cookies()).set('hf_session',token(),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:43200});attempts.delete(ip);return Response.json({ok:true});
}catch(e){return failure(e);} }
export async function DELETE(request:Request) {try{checkOrigin(request);(await cookies()).delete('hf_session');return Response.json({ok:true});}catch(e){return failure(e);} }
