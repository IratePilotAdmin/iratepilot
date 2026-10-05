import {boundedProviderResponse} from '@/lib/bounded-provider-response';

// Deadline covers both response headers and body, with no automatic payment retry.
export async function paymentProviderJson<T>(url:string,init:RequestInit,limit=65536,timeoutMs=20000):Promise<T>{
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([
   (async()=>{
    const response=await fetch(url,{...init,signal:controller.signal,redirect:'manual'});
    if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error('Payment provider request failed')}
    return JSON.parse(await boundedProviderResponse(response,limit)) as T;
   })(),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Payment provider timed out'))},timeoutMs)})
  ]);
 }finally{clearTimeout(timer);controller.abort()}
}
