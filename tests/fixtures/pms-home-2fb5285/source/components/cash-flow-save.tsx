'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import {cashCommand,cashParams,cashRequestKey,readCashRequest,verifyCashResult,type CashCommand,type CashRequest} from '@/lib/cash-flow-request';
export function CashFlowSave({membership,command,onSaved}:{membership:Membership;command:CashCommand|null;onSaved:()=>void}){
 const {tenant_id,property_id,role}=membership;
 const [actor,setActor]=useState(''),[pending,setPending]=useState<CashRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 const mutex=useRef(false),generation=useRef(0),latest=useRef({role,command});latest.current={role,command};
 useEffect(()=>{let current=true;generation.current++;mutex.current=false;setActor('');setReady(false);setPending(null);setError('');setBusy(false);setConfirmed(false);
  hotelClient().auth.getUser().then(({data,error})=>{if(error||!data.user)throw Error('Sign in again before saving.');const r=readCashRequest(sessionStorage,data.user.id,{tenant_id,property_id});if(current){setActor(data.user.id);setPending(r);setReady(true);}}).catch(e=>{if(current)setError(e.message);});
  return()=>{current=false;generation.current++;};
 },[tenant_id,property_id]);
 const commandKey=JSON.stringify(command);useEffect(()=>setConfirmed(false),[commandKey]);
 async function save(){if(mutex.current||!ready||latest.current.role!=='owner')return;mutex.current=true;setBusy(true);setError('');const run=generation.current;let sent:CashRequest|null=null;
  const current=()=>generation.current===run;
  try{
   const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this property.');if(!current()||latest.current.role!=='owner')return;
   const scope={tenant_id,property_id},stored=readCashRequest(sessionStorage,actor,scope);
   if(JSON.stringify(stored)!==JSON.stringify(pending)){setPending(stored);throw Error('A retained request changed. Review it before retrying.');}
   if(!stored&&(!confirmed||latest.current.command!==command||!command))throw Error('Review and confirm the current details.');
   const r=stored??{actor,tenant:tenant_id,property:property_id,request:crypto.randomUUID(),command:cashCommand(command)};
   sessionStorage.setItem(cashRequestKey(actor,scope),JSON.stringify(r));sent=r;setPending(r);
   const result=await hotelRpc(r.command.kind==='configuration'?'save_cash_flow_configuration':'save_cash_flow_review',cashParams(r));
   if(!current())return;const after=await hotelClient().auth.getUser();if(after.error||after.data.user?.id!==actor)throw Error('Sign-in changed. The original request is retained.');if(!current())return;
   verifyCashResult(result,r);if(JSON.stringify(readCashRequest(sessionStorage,actor,scope))!==JSON.stringify(r))throw Error('Recovery data changed; reopen this property.');
   sessionStorage.removeItem(cashRequestKey(actor,scope));setPending(null);setConfirmed(false);onSaved();
  }catch(e){if(current()){
   // PT409 is returned only after the locked request lookup found no saved result
   // and the monotonically increasing review version invalidated this request.
   if(sent&&(e as {code?:string}).code==='PT409'&&JSON.stringify(readCashRequest(sessionStorage,actor,{tenant_id,property_id}))===JSON.stringify(sent)){sessionStorage.removeItem(cashRequestKey(actor,{tenant_id,property_id}));setPending(null);setConfirmed(false);}
   setError(e instanceof Error?e.message:'Unable to confirm the save. Retry the retained request.');
  }}finally{if(current()){mutex.current=false;setBusy(false);}}
 }
 if(role!=='owner')return null;
 return <section aria-label="Save cash-flow review" aria-busy={busy}>{error&&<p role="alert">{error}</p>}{!ready&&!error&&<p role="status">Checking saved requests…</p>}{pending?<><p>Retained {pending.command.kind} request: {pending.request}. Reason: {pending.command.reason}. Retrying uses the original details.</p><button type="button" disabled={busy||!ready} onClick={()=>void save()}>Retry original cash-flow save</button></>:<><label><input type="checkbox" checked={confirmed} disabled={!command||busy||!ready} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed these cash-flow details.</label><button type="button" className="primary" disabled={!command||!confirmed||!ready||busy} onClick={()=>void save()}>Save cash-flow review</button></>}</section>;
}
