'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import type {SetupCommand} from '@/lib/accounting-setup-request';
import {readSetupRetirement,clearSetupRetirement,setupParams as accountingRequestParams,readSetupRequest as readAccountingRequest,retainSetupRequest as retainAccountingRequest,clearSetupRequest as clearAccountingRequest,setupStatus,type SetupRequest as AccountingPostingRequest} from '@/lib/accounting-setup-request';
export function AccountingSetupAction({membership,preview}:{membership:Membership;preview:SetupCommand|null}){
 const {tenant_id,property_id,role}=membership;
 const [actor,setActor]=useState(''),[pending,setPending]=useState<AccountingPostingRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false);
 const generation=useRef(0);
 const latest=useRef({role,preview});latest.current={role,preview};
 const mounted=useRef(false),mutex=useRef(false),scope=useRef('');scope.current=tenant_id+'/'+property_id;
 useEffect(()=>{generation.current++;let current=true;mounted.current=true;mutex.current=false;setBusy(false);setMessage('');setConfirmed(false);setReady(false);setPending(null);setActor('');setComplete(false);setError('');
  hotelClient().auth.getUser().then(({data,error})=>{if(error||!data.user)throw Error('Verify sign-in before saving.');const saved=readAccountingRequest(sessionStorage,data.user.id,tenant_id,property_id);if(current){setActor(data.user.id);setPending(saved);setReady(true);}}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to read setup recovery.');});
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
    if(!request)throw Error('No retained setup request was found.');
    if(mode==='retire'&&latest.current.role!=='owner')throw Error('Owner access is required to cancel setup.');
    const result=await hotelRpc<unknown>(mode==='retire'?'retire_gl_setup':'gl_setup_retirement_status',{p_tenant:tenant_id,p_property:property_id,p_request:request.request,...(mode==='retire'?{p_command:request.command,p_confirmed:true}:{p_kind:request.command.kind})});
    if(!current())return;await verifyActor();if(!current())return;
    if(readSetupRetirement(result,request)){clearSetupRetirement(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Setup request cancelled. Refresh Accounting Setup before entering corrected details.');}
    else setMessage('No setup cancellation is saved. The original request remains available for recovery.');
   }else if(mode==='post'){
    if(latest.current.role!=='owner')throw Error('Owner access is required to configure accounting.');
    if(!request){if(!confirmed||!preview||latest.current.preview!==preview)throw Error('Review the setup details again.');request={version:1,actor,tenant:tenant_id,property:property_id,request:crypto.randomUUID(),command:preview};}
    retainAccountingRequest(sessionStorage,request);setPending(request);
    const result=await hotelRpc<unknown>(request.command.kind==='account'?'create_gl_account':request.command.kind==='period'?'create_gl_period':'save_gl_mappings',accountingRequestParams(request));
    if(!current())return;await verifyActor();if(!current())return;
    clearAccountingRequest(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Setup saved. Refresh Accounting Setup to see the saved item.');
   }else{
    if(!request)throw Error('No retained setup request was found.');setPending(request);
    const result=setupStatus(await hotelRpc<unknown>(request.command.kind==='mappings'?'gl_mapping_status':'gl_configuration_status',{p_tenant:tenant_id,p_property:property_id,p_request:request.request}),request);
    if(!current())return;await verifyActor();if(!current())return;
    if(result){clearAccountingRequest(sessionStorage,request,result);setPending(null);setComplete(true);setMessage('Saved setup confirmed. Refresh Accounting Setup.');}

    else setMessage('No saved result found yet. The original request is retained for another check or exact retry.');
   }
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Accounting setup result is uncertain. Check the retained request before continuing.');}
  finally{if(current()){mutex.current=false;setBusy(false);}}
 }
 return <section aria-label="Accounting setup confirmation" aria-busy={busy}>{error&&<p role="alert" className="pilot-error">{error}</p>}{message&&<p role="status">{message}</p>}{!ready&&!error&&<p role="status">Checking saved setup requests…</p>}{pending?<><p>Retained {pending.command.kind} setup request {pending.request}</p><button className="secondary" disabled={busy} onClick={()=>void run('check')}>Check setup result</button><button className="secondary" disabled={busy} onClick={()=>void run('retirement-status')}>Check setup cancellation</button>{role==='owner'&&<><button className="secondary" disabled={busy} onClick={()=>void run('post')}>Retry original setup</button><button className="secondary" disabled={busy} onClick={()=>void run('retire')}>Cancel retained setup request</button><p>Cancellation prevents this request from creating or changing setup. Saved setup cannot be cancelled here.</p></>}</>:!complete&&preview&&role==='owner'&&<><label><input type="checkbox" checked={confirmed} disabled={busy||!ready} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed these accounting setup details.</label><button className="primary" disabled={busy||!ready||!confirmed} onClick={()=>void run('post')}>Save accounting setup</button></>}</section>;
}
