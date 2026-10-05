'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import type {PeriodReview} from '@/lib/accounting-period';
import {clearRetiredPeriodClose,periodCloseParams as accountingRequestParams,readPeriodClose as readAccountingRequest,retainPeriodClose as retainAccountingRequest,clearPeriodClose as clearAccountingRequest,readPeriodCloseStatus as readAccountingStatus,type PeriodCloseRequest as AccountingPostingRequest} from '@/lib/accounting-period-request';
export function AccountingPeriodCloseAction({membership,preview}:{membership:Membership;preview:PeriodReview|null}){
 return <AccountingPeriodCloseActionForScope key={membership.tenant_id+'/'+membership.property_id} membership={membership} preview={preview}/>;
}
function AccountingPeriodCloseActionForScope({membership,preview}:{membership:Membership;preview:PeriodReview|null}){
 const {tenant_id,property_id,role}=membership;
 const [actor,setActor]=useState(''),[pending,setPending]=useState<AccountingPostingRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmedReview,setConfirmedReview]=useState<string|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false);
 const generation=useRef(0);
 const latest=useRef({role,preview});
 const mutex=useRef(false);
 useEffect(()=>{latest.current={role,preview};},[role,preview]);
 useEffect(()=>{const effectGeneration=generation;effectGeneration.current++;let current=true;mutex.current=false;
  hotelClient().auth.getUser().then(({data,error})=>{if(error||!data.user)throw Error('Verify sign-in before closing.');const saved=readAccountingRequest(sessionStorage,data.user.id,tenant_id,property_id);if(current){setActor(data.user.id);setPending(saved);setReady(true);}}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to read period close recovery.');});
  return()=>{effectGeneration.current++;current=false;};
 },[tenant_id,property_id]);
 async function verifyActor(){const {data,error}=await hotelClient().auth.getUser();if(error||data.user?.id!==actor)throw Error('Sign-in changed. Return to the workspace before continuing.');}
 async function run(mode:'post'|'check'|'retire'){
  if(mutex.current||!ready||complete)return;mutex.current=true;setBusy(true);setError('');setMessage('');const originalGeneration=generation.current;
  const current=()=>generation.current===originalGeneration;
  try{
   await verifyActor();if(!current())return;
   let request=readAccountingRequest(sessionStorage,actor,tenant_id,property_id);
   if(pending&&(!request||JSON.stringify(request)!==JSON.stringify(pending)))throw Error('Retained request changed. Reopen recovery before continuing.');
   if(!pending&&request){setPending(request);throw Error('A retained request was found. Review its details before checking or retrying it.');}
   if(mode==='retire'){
    if(latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to cancel a close request.');
    if(!request)throw Error('No retained period close request was found.');
    const result=await hotelRpc<unknown>('retire_gl_period_close',accountingRequestParams(request));
    if(!current())return;await verifyActor();if(!current())return;
    clearRetiredPeriodClose(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Retained close request cancelled. Return to Accounting Setup and open a fresh period review.');
   }else if(mode==='post'){
    if(latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to close a period.');
    if(!request){if(latest.current.preview!==preview)throw Error('Period review changed. Review it again before confirming.');if(confirmedReview!==preview?.review_token||!preview||preview.closed||preview.pending_service_count||preview.pending_correction_count||preview.pending_payment_count||preview.debit_minor!==preview.credit_minor||preview.tenant_id!==tenant_id||preview.property_id!==property_id)throw Error('Review this period before confirming.');request={version:1,actor,tenant:tenant_id,property:property_id,request:crypto.randomUUID(),period:preview.period_id,reviewToken:preview.review_token};}
    retainAccountingRequest(sessionStorage,request);setPending(request);
    const result=await hotelRpc<unknown>('close_gl_period',accountingRequestParams(request));
    if(!current())return;await verifyActor();if(!current())return;
    clearAccountingRequest(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Period closed. Refresh the period review.');
   }else{
    if(!request)throw Error('No retained period close request was found.');setPending(request);
    const result=readAccountingStatus(await hotelRpc<unknown>('gl_period_close_status',{p_tenant:tenant_id,p_property:property_id,p_request:request.request}),request);
    if(!current())return;await verifyActor();if(!current())return;
    if(result.found){clearAccountingRequest(sessionStorage,request,result.receipt);setPending(null);setComplete(true);setMessage('Saved period close confirmed. Refresh the period review.');}
    else if(result.retired){clearRetiredPeriodClose(sessionStorage,request,result.receipt);setPending(null);setComplete(true);setMessage('Cancelled close request confirmed. Return to Accounting Setup for a fresh review.');}
    else setMessage('No saved result found yet. The original request is retained for another check or exact retry.');
   }
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Period close result is uncertain. Check the retained request before continuing.');}
  finally{if(current()){mutex.current=false;setBusy(false);}}
 }
 return <section aria-label="Period closing confirmation" aria-busy={busy}>{error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<output className="accounting-close-status">{message}</output>}{!ready&&!error&&<output className="accounting-close-status">Checking saved period close requests…</output>}{ready&&!pending&&!preview&&!complete&&<p>No retained period close request for this signed-in property.</p>}{pending?<><p>Retained request {pending.request} · Period {pending.period}</p><button className="secondary" disabled={busy||!ready} onClick={()=>void run('check')}>Check period close result</button>{(role==='owner'||role==='manager')&&<><button className="secondary" disabled={busy||!ready} onClick={()=>void run('post')}>Retry original period close</button><button className="secondary" disabled={busy||!ready} onClick={()=>void run('retire')}>Cancel retained close request</button><p>Cancellation prevents this request from closing the period. A saved close cannot be cancelled.</p></>}</>:!complete&&preview&&!(preview.closed||preview.pending_service_count>0||preview.pending_correction_count>0||preview.pending_payment_count>0||preview.debit_minor!==preview.credit_minor)&&<><label><input type="checkbox" checked={confirmedReview===preview.review_token} disabled={busy||!ready} onChange={e=>setConfirmedReview(e.target.checked?preview.review_token:null)}/>I reviewed the balances and completed operational records. I understand this period cannot be reopened.</label><button className="primary" disabled={busy||!ready||confirmedReview!==preview.review_token||!(role==='owner'||role==='manager')} onClick={()=>void run('post')}>Close reviewed period</button></>}</section>;
}

