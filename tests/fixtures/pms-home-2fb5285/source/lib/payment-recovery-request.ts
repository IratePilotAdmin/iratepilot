import {hotelClient} from './pilot';
export type RecoveryRow={operationId:string;paymentId:string;startedAt:number;amountMinor:number;paidAt:number|null;cancelledAt:number|null};
export type RecoveryPage={test:true;records:RecoveryRow[];next:string|null};
export const recoveryMessages={
 session_discovery_required:'The checkout session could not be identified. Further review is required.',
 provider_session_not_observed:'No matching session was found in the bounded Stripe search. This does not prove that no payment exists.',
 local_record_changed:'The payment changed during review. Refresh and review again.',
 observations_agree:'PMS and Stripe test observations agree. The interrupted operation still requires resolution.',
 reconciliation_required:'PMS and Stripe observations need reconciliation. Review the payment before taking further action.',
} as const;
export type RecoveryReview={reviewId:string;reviewedAt:number;review:keyof typeof recoveryMessages};
export type RecoveryHistory={history:true;test:true;records:(RecoveryReview&{actor:string;operationId:string;paymentId:string})[];next:string|null};
type Scope={actor:string;tenant:string;property:string};
type Selection={reservation:string;after:string|null;history?:true}|{operationId:string;paymentId:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
export async function paymentRecoveryRequest(scope:Scope,selection:Selection,signal:AbortSignal,timeoutMs=30000):Promise<RecoveryPage|RecoveryReview|RecoveryHistory>{
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 let stop=()=>{};
 const interrupted=new Promise<never>((_,reject)=>{stop=()=>{controller.abort();reject(Error('Review interrupted. Reopen the reservation to check again.'))};signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();timer=setTimeout(stop,timeoutMs)});
 try{return await Promise.race([interrupted,(async()=>{
  if(controller.signal.aborted)throw Error('Review interrupted.');
  const {data}=await hotelClient().auth.getSession();
  if(controller.signal.aborted)throw Error('Review interrupted.');
  if(!data.session||data.session.user.id!==scope.actor)throw Error('Your account changed. Reopen the reservation.');
  const response=await fetch('/api/payment-recovery',{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({tenant:scope.tenant,property:scope.property,...selection})});
  const raw:unknown=await response.json();
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Payment review response could not be verified.');
  const result=raw as Record<string,unknown>;
  if(!response.ok)throw Error(typeof result?.error==='string'?result.error:'Payment review unavailable.');
  if('reservation' in selection){
   if(selection.history){
    if(result.test!==true||!Array.isArray(result.records)||result.records.length>50||!(result.next===null||uuid(result.next))||result.records.some(r=>!r||!uuid(r.reviewId)||!uuid(r.paymentId)||typeof r.operationId!=='string'||typeof r.actor!=='string'||!Number.isSafeInteger(r.reviewedAt)||typeof r.review!=='string'||!Object.hasOwn(recoveryMessages,r.review)))throw Error('Payment review history could not be verified.');
    return {...result,history:true} as unknown as RecoveryHistory;
   }
   if(result?.test!==true||!Array.isArray(result.records)||result.records.length>50||!(result.next===null||(typeof result.next==='string'&&result.next.split(':').length===2&&result.next.split(':').every(uuid)))||result.records.some((r:RecoveryRow)=>!r||!uuid(r.operationId)||!uuid(r.paymentId)||!Number.isSafeInteger(r.startedAt)||!Number.isSafeInteger(r.amountMinor)||![r.paidAt,r.cancelledAt].every(v=>v===null||Number.isSafeInteger(v))))throw Error('Payment review list could not be verified.');
   return result as unknown as RecoveryPage;
  }
  if(!uuid(result?.reviewId)||!Number.isSafeInteger(result.reviewedAt)||typeof result.review!=='string'||!Object.hasOwn(recoveryMessages,result.review))throw Error('Payment review result could not be verified.');
  return {reviewId:result.reviewId,reviewedAt:result.reviewedAt,review:result.review} as RecoveryReview;
 })()])}finally{clearTimeout(timer);signal.removeEventListener('abort',stop);controller.abort()}
}
