'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import type {PostingPreview} from '@/lib/accounting';
import {accountingRetirementParams,readAccountingRetirement,clearAccountingRetirement,accountingRequestParams,readAccountingRequest,retainAccountingRequest,clearAccountingRequest,readAccountingStatus,type AccountingPostingRequest} from '@/lib/accounting-request';
export function AccountingPostingAction({membership,preview}:{membership:Membership;preview:PostingPreview|null}){
 const {tenant_id,property_id,role}=membership;
 const [actor,setActor]=useState(''),[pending,setPending]=useState<AccountingPostingRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false);
 const generation=useRef(0);
 const latest=useRef({role,preview});latest.current={role,preview};
 const mounted=useRef(false),mutex=useRef(false),scope=useRef('');scope.current=tenant_id+'/'+property_id;
 useEffect(()=>{generation.current++;let current=true;mounted.current=true;mutex.current=false;setBusy(false);setMessage('');setConfirmed(false);setReady(false);setPending(null);setActor('');setComplete(false);setError('');
  hotelClient().auth.getUser().then(({data,error})=>{if(error||!data.user)throw Error('Verify sign-in before posting.');const saved=readAccountingRequest(sessionStorage,data.user.id,tenant_id,property_id);if(current){setActor(data.user.id);setPending(saved);setReady(true);}}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to read posting recovery.');});
  return()=>{generation.current++;current=false;mounted.current=false;};
 },[tenant_id,property_id]);
 useEffect(()=>{setConfirmed(false);},[preview]);
 async function verifyActor(){const {data,error}=await hotelClient().auth.getUser();if(error||data.user?.id!==actor)throw Error('Sign-in changed. Return to the workspace before continuing.');}
 async function run(mode:'post'|'check'|'retire'|'retirement-status'){
  if(mutex.current||!ready||complete)return;mutex.current=true;setBusy(true);setError('');setMessage('');const originalScope=scope.current,originalGeneration=generation.current;
  const current=()=>mounted.current&&scope.current===originalScope&&generation.current===originalGeneration;
  try{
   await verifyActor();if(!current())return;
   let request=readAccountingRequest(sessionStorage,actor,tenant_id,property_id);
   if(pending&&(!request||JSON.stringify(request)!==JSON.stringify(pending)))throw Error('Retained request changed. Reopen recovery before continuing.');
   if(!pending&&request){setPending(request);throw Error('A retained request was found. Review its details before checking or retrying it.');}
   if(mode==='retire'||mode==='retirement-status'){
    if(!request)throw Error('No retained posting request was found.');
    if(mode==='retire'&&latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to cancel a posting request.');
    const result=await hotelRpc<unknown>(mode==='retire'?'retire_gl_posting':'gl_posting_retirement_status',mode==='retire'?accountingRetirementParams(request):{p_tenant:tenant_id,p_property:property_id,p_request:request.request,p_kind:request.kind});
    if(!current())return;await verifyActor();if(!current())return;
    if(readAccountingRetirement(result,request)){clearAccountingRetirement(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Posting request cancelled. Return to reconciliation and review the source again.');}
    else setMessage('No cancellation is saved. The original posting request remains available for recovery.');
   }else if(mode==='post'){
    if(latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to post.');
    if(!request){if(latest.current.preview!==preview)throw Error('Posting review changed. Review it again before confirming.');if(!confirmed||!preview||preview.already_processed||preview.actor_id!==actor||preview.tenant_id!==tenant_id||preview.property_id!==property_id)throw Error('Review this source before confirming.');request={version:1,actor,tenant:tenant_id,property:property_id,request:crypto.randomUUID(),kind:preview.adjustment_id?'forward':'service',reservation:preview.reservation_id,serviceDate:preview.service_date,adjustment:preview.adjustment_id??null,mapping:preview.mapping_id,mappingVersion:preview.mapping_version,period:preview.period_id,postingDate:preview.posting_date,noLines:preview.lines.length===0};}
    retainAccountingRequest(sessionStorage,request);setPending(request);
    const result=await hotelRpc<unknown>(request.kind==='forward'?'post_forward_journal':'post_service_journal',accountingRequestParams(request));
    if(!current())return;await verifyActor();if(!current())return;
    clearAccountingRequest(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Posting saved. Return to reconciliation and refresh the report.');
   }else{
    if(!request)throw Error('No retained posting request was found.');setPending(request);
    const result=readAccountingStatus(await hotelRpc<unknown>(request.kind==='forward'?'forward_journal_status':'service_journal_status',{p_tenant:tenant_id,p_property:property_id,p_request:request.request}),request);
    if(!current())return;await verifyActor();if(!current())return;
    if(result.found){clearAccountingRequest(sessionStorage,request,result.receipt);setPending(null);setComplete(true);setMessage('Saved posting confirmed. Return to reconciliation and refresh the report.');}
    else setMessage('No saved result found yet. The original request is retained for another check or exact retry.');
   }
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Posting result is uncertain. Check the retained request before continuing.');}
  finally{if(current()){mutex.current=false;setBusy(false);}}
 }
 return <section aria-label="Posting confirmation" aria-busy={busy}>{error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<p role="status">{message}</p>}{!ready&&!error&&<p role="status">Checking saved posting requests…</p>}{ready&&!pending&&!preview&&!complete&&<p>No retained accounting request for this signed-in property.</p>}{pending?<><p>Retained request {pending.request} · Reservation {pending.reservation} · Posting date {pending.postingDate}</p><button className="secondary" disabled={busy||!ready} onClick={()=>void run('check')}>Check posting result</button><button className="secondary" disabled={busy||!ready} onClick={()=>void run('retirement-status')}>Check posting cancellation</button>{(role==='owner'||role==='manager')&&<><button className="secondary" disabled={busy||!ready} onClick={()=>void run('post')}>Retry original posting</button><button className="secondary" disabled={busy||!ready} onClick={()=>void run('retire')}>Cancel retained posting request</button><p>Cancellation prevents this request from posting. A saved posting cannot be cancelled here.</p></>}</>:!complete&&preview&&!preview.already_processed&&<><label><input type="checkbox" checked={confirmed} disabled={busy||!ready} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the posting date, accounts, and amounts.</label><button className="primary" disabled={busy||!ready||!confirmed||!(role==='owner'||role==='manager')} onClick={()=>void run('post')}>Confirm ledger posting</button></>}</section>;
}
