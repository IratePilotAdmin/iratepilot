'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import {accountingUsd} from '@/lib/accounting';

import {paymentRequestParams,readPaymentRequest,retainPaymentRequest,clearPaymentRequest,paymentRequestStatus,paymentRetirementStatus,matchesPaymentReceipt,type PaymentRequest,type PaymentReview} from '@/lib/payment-accounting';
export function PaymentAccountingAction({membership,preview}:{membership:Membership;preview:PaymentReview|null}){
 const {tenant_id,property_id,role}=membership;
 const [actor,setActor]=useState(''),[pending,setPending]=useState<PaymentRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false);
 const generation=useRef(0);
 const latest=useRef({role,preview});latest.current={role,preview};
 const mounted=useRef(false),mutex=useRef(false),scope=useRef('');scope.current=tenant_id+'/'+property_id;
 useEffect(()=>{generation.current++;let current=true;mounted.current=true;mutex.current=false;setBusy(false);setMessage('');setConfirmed(false);setReady(false);setPending(null);setActor('');setComplete(false);setError('');
  hotelClient().auth.getUser().then(({data,error})=>{if(error||!data.user)throw Error('Verify sign-in before payment accounting.');const saved=readPaymentRequest(sessionStorage,{actor:data.user.id,tenant:tenant_id,property:property_id});if(current){setActor(data.user.id);setPending(saved);setReady(true);}}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to read payment accounting recovery.');});
  return()=>{generation.current++;current=false;mounted.current=false;};
 },[tenant_id,property_id]);
 useEffect(()=>{setConfirmed(false);},[preview]);
 async function verifyActor(){const {data,error}=await hotelClient().auth.getUser();if(error||data.user?.id!==actor)throw Error('Sign-in changed. Return to the workspace before continuing.');}
 async function run(mode:'post'|'check'|'retire'|'retirement-status'){
  if(mutex.current||!ready||complete)return;mutex.current=true;setBusy(true);setError('');setMessage('');const originalScope=scope.current,originalGeneration=generation.current;
  const current=()=>mounted.current&&scope.current===originalScope&&generation.current===originalGeneration;
  try{
   await verifyActor();if(!current())return;
   let request=readPaymentRequest(sessionStorage,{actor,tenant:tenant_id,property:property_id});
   if(pending&&(!request||JSON.stringify(request)!==JSON.stringify(pending)))throw Error('Retained request changed. Reopen recovery before continuing.');
   if(!pending&&request){setPending(request);throw Error('A retained request was found. Review its details before checking or retrying it.');}
   if(mode==='retire'||mode==='retirement-status'){
    if(!request)throw Error('No retained payment accounting request was found.');
    if(mode==='retire'&&latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to cancel a payment accounting request.');
    const result=await hotelRpc<unknown>(mode==='retire'?'retire_payment_journal':'payment_journal_retirement_status',mode==='retire'?paymentRequestParams(request):{p_tenant:tenant_id,p_property:property_id,p_request:request.request});
    if(!current())return;await verifyActor();if(!current())return;
    if(paymentRetirementStatus(result,request)==='retired'){clearPaymentRequest(sessionStorage,request);setPending(null);setComplete(true);setMessage('Payment accounting request cancelled. Return to payment accounting and review the details again.');}
    else setMessage('No cancellation is saved. The original payment accounting request remains available for recovery.');
   }else if(mode==='post'){
    if(latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to post.');
    if(!request){if(latest.current.preview!==preview)throw Error('Payment accounting review changed. Review it again before confirming.');if(!confirmed||!preview)throw Error('Review this payment accounting before confirming.');const requestId=crypto.randomUUID();request={version:1,actor,tenant:tenant_id,property:property_id,request:requestId,review:preview};}
    retainPaymentRequest(sessionStorage,request);setPending(request);
    const result=await hotelRpc<unknown>('post_payment_journal',paymentRequestParams(request));
    if(!current())return;await verifyActor();if(!current())return;
    if(!matchesPaymentReceipt(result,request))throw Error('Payment receipt does not match the retained request.');clearPaymentRequest(sessionStorage,request);setPending(null);setComplete(true);setMessage('Payment journal saved. Refresh the ledger to see it.');
   }else{
    if(!request)throw Error('No retained payment accounting request was found.');setPending(request);
    const result=paymentRequestStatus(await hotelRpc<unknown>('payment_journal_status',{p_tenant:tenant_id,p_property:property_id,p_request:request.request}),request);
    if(!current())return;await verifyActor();if(!current())return;
    if(result==='posted'){clearPaymentRequest(sessionStorage,request);setPending(null);setComplete(true);setMessage('Saved payment journal confirmed. Refresh the ledger to see it.');}
    else setMessage('No saved result found yet. The original request is retained for another check or exact retry.');
   }
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Payment accounting result is uncertain. Check the retained request before continuing.');}
  finally{if(current()){mutex.current=false;setBusy(false);}}
 }
 return <section aria-label="Payment accounting confirmation" aria-busy={busy}>{error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<p role="status">{message}</p>}{!ready&&!error&&<p role="status">Checking saved payment accounting requests…</p>}{ready&&!pending&&!preview&&!complete&&<p>No retained accounting request for this signed-in property.</p>}{pending?<><p>Retained request {pending.request} · Payment accounting date {pending.review.command.posting_date}</p><p>{pending.review.command.description}</p><p>{pending.review.source_kind}  /  Payment record {pending.review.entry_id}</p><ul>{pending.review.command.lines.map((line,index)=><li key={index}>{line.account_id} · {line.side} · {accountingUsd(line.amount_minor)}</li>)}</ul><button className="secondary" disabled={busy||!ready} onClick={()=>void run('check')}>Check payment accounting result</button><button className="secondary" disabled={busy||!ready} onClick={()=>void run('retirement-status')}>Check payment accounting cancellation</button>{(role==='owner'||role==='manager')&&<><button className="secondary" disabled={busy||!ready} onClick={()=>void run('post')}>Retry original payment accounting request</button><button className="secondary" disabled={busy||!ready} onClick={()=>void run('retire')}>Cancel retained payment accounting request</button><p>Cancellation prevents this request from posting. A saved payment journal cannot be cancelled here.</p></>}</>:!complete&&preview&&<><label><input type="checkbox" checked={confirmed} disabled={busy||!ready} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the payment accounting date, accounts, and amounts.</label><button className="primary" disabled={busy||!ready||!confirmed||!(role==='owner'||role==='manager')} onClick={()=>void run('post')}>Confirm payment accounting</button></>}</section>;
}
