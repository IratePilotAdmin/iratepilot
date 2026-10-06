'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import {accountingUsd,type PostingPreview} from '@/lib/accounting';
import {retainNightlyBatch,readNightlyBatch,nightlyBatchParams,readNightlyBatchStatus,readNightlyBatchRetirement,clearNightlyBatch,type NightlyBatch} from '@/lib/nightly-batch-request';
export function NightlyBatchAction({membership,review}:{membership:Membership;review:PostingPreview[]|null}){
 const {tenant_id,property_id,role}=membership;
 const [actor,setActor]=useState(''),[pending,setPending]=useState<NightlyBatch|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[complete,setComplete]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0),mounted=useRef(false),mutex=useRef(false),scope=useRef('');scope.current=tenant_id+'/'+property_id;
 const latest=useRef({role,review});latest.current={role,review};
 useEffect(()=>{let current=true;generation.current++;mounted.current=true;mutex.current=false;setBusy(false);setActor('');setPending(null);setReady(false);setConfirmed(false);setComplete(false);setError('');setMessage('');
  hotelClient().auth.getUser().then(({data,error})=>{if(error||!data.user)throw Error('Verify sign-in before batch posting.');const saved=readNightlyBatch(sessionStorage,data.user.id,tenant_id,property_id);if(current){setActor(data.user.id);setPending(saved);setReady(true);}}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Batch recovery unavailable.');});
  return()=>{current=false;generation.current++;mounted.current=false;};
 },[tenant_id,property_id]);
 useEffect(()=>{setConfirmed(false);},[review]);
 async function verifyActor(){const {data,error}=await hotelClient().auth.getUser();if(error||data.user?.id!==actor)throw Error('Sign-in changed. Reopen the workspace before continuing.');}
 async function run(mode:'post'|'status'|'cancel'|'cancellation-status'){
  if(mutex.current||!ready||complete)return;mutex.current=true;setBusy(true);setError('');setMessage('');const startedScope=scope.current,startedGeneration=generation.current;
  const current=()=>mounted.current&&scope.current===startedScope&&generation.current===startedGeneration;
  try{
   await verifyActor();if(!current())return;
   let batch=readNightlyBatch(sessionStorage,actor,tenant_id,property_id);
   if(pending&&JSON.stringify(batch)!==JSON.stringify(pending))throw Error('Retained batch changed. Reopen recovery.');
   if(!pending&&batch){setPending(batch);throw Error('A retained batch was found. Review it before continuing.');}
   if(mode==='post'){
    if(latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to post a batch.');
    if(!batch){if(!confirmed||!review||latest.current.review!==review)throw Error('Review the batch before confirming.');batch={version:1,actor,tenant:tenant_id,property:property_id,request:crypto.randomUUID(),items:review.map(preview=>({request_id:crypto.randomUUID(),preview}))};}
    retainNightlyBatch(sessionStorage,batch);setPending(batch);
    const result=await hotelRpc<unknown>('post_service_batch',nightlyBatchParams(batch));if(!current())return;await verifyActor();if(!current())return;
    clearNightlyBatch(sessionStorage,batch,result);setPending(null);setComplete(true);setMessage('Nightly batch saved. Refresh reconciliation to see its posting status.');
   }else{
    if(!batch)throw Error('No retained nightly batch was found.');
    if(mode==='status'){
     const result=await hotelRpc<unknown>('service_batch_status',{p_tenant:tenant_id,p_property:property_id,p_request:batch.request});if(!current())return;await verifyActor();if(!current())return;
     const receipt=readNightlyBatchStatus(result,batch);
     if(receipt){clearNightlyBatch(sessionStorage,batch,receipt);setPending(null);setComplete(true);setMessage('Saved nightly batch confirmed. Refresh reconciliation.');}else setMessage('No saved batch found yet. Keep the original request for another check, exact retry or cancellation.');
    }else{
     if(mode==='cancel'&&latest.current.role!=='owner'&&latest.current.role!=='manager')throw Error('Manager access is required to cancel a batch.');
     const result=await hotelRpc<unknown>(mode==='cancel'?'retire_service_batch':'service_batch_retirement_status',mode==='cancel'?nightlyBatchParams(batch):{p_tenant:tenant_id,p_property:property_id,p_request:batch.request});if(!current())return;await verifyActor();if(!current())return;
     if(readNightlyBatchRetirement(result,batch)){clearNightlyBatch(sessionStorage,batch,result,true);setPending(null);setComplete(true);setMessage('Nightly batch request cancelled. Refresh sources before preparing another batch.');}else setMessage('No cancellation is saved. The original batch remains available for recovery.');
    }
   }
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Batch result is uncertain. Check the retained request.');}
  finally{if(current()){mutex.current=false;setBusy(false);}}
 }
 const canWrite=role==='owner'||role==='manager';
 return <section aria-label="Nightly batch confirmation" aria-busy={busy}>
  {error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<p role="status">{message}</p>}{!ready&&!error&&<p role="status">Checking retained nightly batch…</p>}
  {ready&&!pending&&!review&&!complete&&<p>No retained nightly batch for this signed-in property.</p>}
  {pending?<><p>Retained nightly batch {pending.request} · {pending.items.length} sources</p><details><summary>Review retained sources and account lines</summary>{pending.items.map(item=><section key={item.request_id}><h4>{item.preview.service_date} · {item.preview.reservation_id}</h4><p>Posting {item.preview.posting_date} · Mapping version {item.preview.mapping_version} · {accountingUsd(item.preview.total_minor)}</p><ul>{item.preview.lines.map((line,i)=><li key={i}>{line.account_code} · {line.component} · {line.side} · {accountingUsd(line.amount_minor)}</li>)}</ul>{!item.preview.lines.length&&<p>No journal lines required.</p>}</section>)}</details>
   <button className="secondary" disabled={busy} onClick={()=>void run('status')}>Check nightly batch result</button><button className="secondary" disabled={busy} onClick={()=>void run('cancellation-status')}>Check nightly batch cancellation</button>
   {canWrite&&<><button className="secondary" disabled={busy} onClick={()=>void run('post')}>Retry original nightly batch</button><button className="secondary" disabled={busy} onClick={()=>void run('cancel')}>Cancel retained nightly batch</button><p>Cancellation prevents this batch request from posting. A saved batch must be recovered instead.</p></>}
  </>:ready&&!complete&&review&&canWrite&&<><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed every source, posting date and account line in this batch.</label><button className="primary" disabled={busy||!confirmed} onClick={()=>void run('post')}>Post reviewed nightly batch</button></>}
 </section>;
}
