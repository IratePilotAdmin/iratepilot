'use client';
import {useEffect,useRef,useState} from 'react';
import {paymentRecoveryRequest,recoveryMessages,type RecoveryPage,type RecoveryRow,type RecoveryHistory} from '@/lib/payment-recovery-request';
import {usd} from '@/lib/pilot';

export function PaymentRecoveryPanel({actor,tenant,property,reservation,disabled}:{actor:string;tenant:string;property:string;reservation:string;disabled:boolean}){
 const [page,setPage]=useState<RecoveryPage|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [reviewed,setReviewed]=useState<{key:string;text:string}|null>(null);
 const [history,setHistory]=useState<RecoveryHistory|null>(null);
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 async function run(row?:RecoveryRow,after:string|null=null,showHistory=false){
  if(disabled||pending.current)return;
  const controller=new AbortController();pending.current=controller;setBusy(true);setMessage('');setReviewed(null);
  try{
   const result=await paymentRecoveryRequest({actor,tenant,property},row?{operationId:row.operationId,paymentId:row.paymentId}:{reservation,after,...(showHistory?{history:true as const}:{})},controller.signal);
   if(controller.signal.aborted)return;
   if('history' in result){setHistory(result);setMessage(result.records.length?'Saved review history loaded. These are past observations.':'No saved reviews found.');}
   else if('records' in result){setPage(result);setMessage(result.records.length?'Select a request to compare with Stripe test mode.':'No unresolved payment requests were found for this reservation.');}
   else if(row){setReviewed({key:`${row.operationId}:${row.paymentId}`,text:`${recoveryMessages[result.review]} Review recorded at ${new Date(result.reviewedAt).toLocaleString()}. No charge, refund or bill adjustment was made.`});setMessage('Comparison recorded. Read the result below the selected request.');}
  }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Payment review unavailable.');}
  finally{if(pending.current===controller)pending.current=null;if(!controller.signal.aborted)setBusy(false);}
 }
 return <section className="precheck-staff" aria-label="Test payment recovery" aria-busy={busy}>
  <h4>Interrupted test payments</h4>
  <p>Release preview · Stripe test mode. Compare saved observations before deciding what to do next. Reviews do not resolve interrupted requests.</p>
  <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void run()}>{busy?'Working…':'Find requests to review'}</button>
  {page&&<ul>{page.records.map(row=><li key={`${row.operationId}:${row.paymentId}`}>
   <span>{new Date(row.startedAt).toLocaleString()} · {usd(row.amountMinor)} · {row.paidAt!==null?'PMS records payment':row.cancelledAt!==null?'PMS records cancellation':'PMS result unconfirmed'} </span>
   <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void run(row)}>Compare with Stripe test</button>
   {reviewed?.key===`${row.operationId}:${row.paymentId}`&&<p role="status">{reviewed.text}</p>}
  </li>)}</ul>}
  {page?.next&&<button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void run(undefined,page.next)}>Next requests</button>}
  <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void run(undefined,null,true)}>View saved reviews</button>
  {history&&<div><h4>Saved reviews</h4><ul>{history.records.map(r=><li key={r.reviewId}><p>{new Date(r.reviewedAt).toLocaleString()} · {recoveryMessages[r.review]}</p><small>Reviewer: {r.actor} · Review: {r.reviewId}</small></li>)}</ul>{history.next&&<button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void run(undefined,history.next,true)}>Next saved reviews</button>}</div>}
  <p role="status" aria-live="polite">{message}</p>
 </section>;
}
