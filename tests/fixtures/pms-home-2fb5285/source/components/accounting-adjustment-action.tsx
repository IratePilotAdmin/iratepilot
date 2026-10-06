'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import {accountingUsd} from '@/lib/accounting';
import type {AdjustmentCommand} from '@/lib/accounting-adjustment-request';
import {adjustmentRetirementParams,readAdjustmentRetirement,clearAdjustmentRetirement,adjustmentParams,readAdjustmentRequest,retainAdjustmentRequest,clearAdjustmentRequest,readAdjustmentStatus,type AdjustmentRequest} from '@/lib/accounting-adjustment-request';
export function AccountingAdjustmentAction({membership,preview}:{membership:Membership;preview:AdjustmentCommand|null}){
 const {tenant_id,property_id,role}=membership;
 const [actor,setActor]=useState(''),[pending,setPending]=useState<AdjustmentRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false);
 const generation=useRef(0);
 const latest=useRef({role,preview});latest.current={role,preview};
 const mounted=useRef(false),mutex=useRef(false),scope=useRef('');scope.current=tenant_id+'/'+property_id;
 useEffect(()=>{generation.current++;let current=true;mounted.current=true;mutex.current=false;setBusy(false);setMessage('');setConfirmed(false);setReady(false);setPending(null);setActor('');setComplete(false);setError('');
  hotelClient().auth.getUser().then(({data,error})=>{if(error||!data.user)throw Error('Verify sign-in before adjustment.');const saved=readAdjustmentRequest(sessionStorage,data.user.id,tenant_id,property_id);if(current){setActor(data.user.id);setPending(saved);setReady(true);}}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to read adjustment recovery.');});
  return()=>{generation.current++;current=false;mounted.current=false;};
 },[tenant_id,property_id]);
 useEffect(()=>{setConfirmed(false);},[preview]);
 async function verifyActor(){const {data,error}=await hotelClient().auth.getUser();if(error||data.user?.id!==actor)throw Error('Sign-in changed. Return to the workspace before continuing.');}
 async function run(mode:'post'|'check'|'retire'|'retirement-status'){
  if(mutex.current||!ready||complete)return;mutex.current=true;setBusy(true);setError('');setMessage('');const originalScope=scope.current,originalGeneration=generation.current;
  const current=()=>mounted.current&&scope.current===originalScope&&generation.current===originalGeneration;
  try{
   await verifyActor();if(!current())return;
   let request=readAdjustmentRequest(sessionStorage,actor,tenant_id,property_id);
   if(pending&&(!request||JSON.stringify(request)!==JSON.stringify(pending)))throw Error('Retained request changed. Reopen recovery before continuing.');
   if(!pending&&request){setPending(request);throw Error('A retained request was found. Review its details before checking or retrying it.');}
   if(mode==='retire'||mode==='retirement-status'){
    if(!request)throw Error('No retained adjustment request was found.');
    if(mode==='retire'&&latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to cancel an adjustment request.');
    const result=await hotelRpc<unknown>(mode==='retire'?'retire_gl_adjustment':'gl_adjustment_retirement_status',mode==='retire'?adjustmentRetirementParams(request):{p_tenant:tenant_id,p_property:property_id,p_request:request.request});
    if(!current())return;await verifyActor();if(!current())return;
    if(readAdjustmentRetirement(result,request)){clearAdjustmentRetirement(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Adjustment request cancelled. Return to adjustments and review the details again.');}
    else setMessage('No cancellation is saved. The original adjustment request remains available for recovery.');
   }else if(mode==='post'){
    if(latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to post.');
    if(!request){if(latest.current.preview!==preview)throw Error('Adjustment review changed. Review it again before confirming.');if(!confirmed||!preview)throw Error('Review this adjustment before confirming.');const requestId=crypto.randomUUID();request={version:1,actor,tenant:tenant_id,property:property_id,request:requestId,command:{...preview,source_id:preview.source_kind==='manual_journal'?requestId:preview.source_id}};}
    retainAdjustmentRequest(sessionStorage,request);setPending(request);
    const result=await hotelRpc<unknown>(request.command.source_kind==='journal_reversal'?'reverse_gl_journal':'post_manual_journal',adjustmentParams(request));
    if(!current())return;await verifyActor();if(!current())return;
    clearAdjustmentRequest(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Adjustment saved. Refresh the ledger to see the adjustment.');
   }else{
    if(!request)throw Error('No retained adjustment request was found.');setPending(request);
    const result=readAdjustmentStatus(await hotelRpc<unknown>(request.command.source_kind==='journal_reversal'?'gl_reversal_status':'manual_journal_status',{p_tenant:tenant_id,p_property:property_id,p_request:request.request}),request);
    if(!current())return;await verifyActor();if(!current())return;
    if(result){clearAdjustmentRequest(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Saved adjustment confirmed. Refresh the ledger to see the adjustment.');}
    else setMessage('No saved result found yet. The original request is retained for another check or exact retry.');
   }
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Adjustment result is uncertain. Check the retained request before continuing.');}
  finally{if(current()){mutex.current=false;setBusy(false);}}
 }
 return <section aria-label="Adjustment confirmation" aria-busy={busy}>{error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<p role="status">{message}</p>}{!ready&&!error&&<p role="status">Checking saved adjustment requests…</p>}{ready&&!pending&&!preview&&!complete&&<p>No retained accounting request for this signed-in property.</p>}{pending?<><p>Retained request {pending.request} · Adjustment date {pending.command.posting_date}</p><p>{pending.command.description}</p><p>{pending.command.source_kind==='journal_reversal'?'Reverses journal '+pending.command.source_id:'Manual journal'}</p><ul>{pending.command.lines.map((line,index)=><li key={index}>{line.account_id} · {line.side} · {accountingUsd(line.amount_minor)}</li>)}</ul><button className="secondary" disabled={busy||!ready} onClick={()=>void run('check')}>Check adjustment result</button><button className="secondary" disabled={busy||!ready} onClick={()=>void run('retirement-status')}>Check adjustment cancellation</button>{(role==='owner'||role==='manager')&&<><button className="secondary" disabled={busy||!ready} onClick={()=>void run('post')}>Retry original adjustment</button><button className="secondary" disabled={busy||!ready} onClick={()=>void run('retire')}>Cancel retained adjustment request</button><p>Cancellation prevents this request from posting. A saved adjustment cannot be cancelled here.</p></>}</>:!complete&&preview&&<><label><input type="checkbox" checked={confirmed} disabled={busy||!ready} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the adjustment date, accounts, and amounts.</label><button className="primary" disabled={busy||!ready||!confirmed||!(role==='owner'||role==='manager')} onClick={()=>void run('post')}>Confirm adjustment</button></>}</section>;
}
