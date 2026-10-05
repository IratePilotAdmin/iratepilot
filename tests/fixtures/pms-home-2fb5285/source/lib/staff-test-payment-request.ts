import {hotelClient} from '@/lib/pilot';
import {boundedProviderResponse} from './bounded-provider-response';
export async function staffTestPaymentRequest(action:'staff_prepare'|'staff_cancel'|'staff_record'|'staff_refund',scope:{actor:string;tenant:string;property:string;reservation:string;reason?:string},timeoutMs=30000,signal?:AbortSignal){
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 let stop:()=>void=()=>{};
 const stopped=new Promise<never>((_,reject)=>{stop=()=>{controller.abort();reject(Error('Request interrupted. Reopen the reservation and check the saved result.'))};signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop()});
 try{return await Promise.race([stopped,
  (async()=>{
   if(action==='staff_refund'&&(typeof scope.reason!=='string'||scope.reason.trim().length<8||scope.reason.trim().length>500))throw Error('Enter a refund reason between 8 and 500 characters.');
   if(controller.signal.aborted)throw Error('Request interrupted.');
   const {data}=await hotelClient().auth.getSession();
   if(controller.signal.aborted)throw Error('Request timed out.');
   if(!data.session)throw Error('Sign in again.');
   if(!scope.actor||data.session.user?.id!==scope.actor)throw Error('Your account changed. Reopen the reservation before continuing.');
   const response=await fetch('/api/guest-payment',{method:'POST',signal:controller.signal,cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({action,...scope})});
   const result=JSON.parse(await boundedProviderResponse(response,65536,controller.signal)) as {error?:string;amount:number;paid:boolean;cancelled?:boolean;pending?:boolean;refunded?:boolean;recorded?:boolean;replayed?:boolean;test?:boolean};
   if(!response.ok)throw Error(result?.error||'Payment test unavailable.');
   if(!result||typeof result!=='object'||Array.isArray(result)||result.test!==true)throw Error('Payment result could not be verified. Retry to check its status.');
   if(action==='staff_prepare'){
    if(typeof result.paid!=='boolean'||!Number.isSafeInteger(result.amount)||result.amount<50||result.amount>99999999)throw Error('Payment preparation could not be verified. Retry to check its status.');
   }else if(action==='staff_cancel'){
    if(['paid','cancelled','pending'].some(key=>{const value=result[key as 'paid'|'cancelled'|'pending'];return value!==undefined&&typeof value!=='boolean'})||[result.paid,result.cancelled,result.pending].filter(value=>value===true).length!==1)throw Error('Cancellation could not be verified. Retry cancellation.');
   }else if(action==='staff_refund'){
    if(typeof result.refunded!=='boolean'||typeof result.pending!=='boolean'||!Number.isSafeInteger(result.amount)||result.amount<50||result.amount>99999999)throw Error('Test refund could not be verified. Retry the saved refund to check its status.');
   }else if(result.recorded!==true||typeof result.replayed!=='boolean'||!Number.isSafeInteger(result.amount)||result.amount<50||result.amount>99999999){
    throw Error('Folio reconciliation could not be verified. Refresh the folio before retrying.');
   }
   return result;
  })(),
  new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(Error(action==='staff_cancel'?'Cancellation is not confirmed. Retry cancellation to check and finish it.':'Payment preparation is not confirmed. Retry to check the saved request.'));controller.abort()},timeoutMs)})
 ])}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort()}
}
