"use client";
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import type {HandoffScope} from '@/lib/cashier-handoff';
import {readBankCloseRequest,readBankCloseReceipt,readBankCloseRequestStatus,type BankCloseRequest} from '@/lib/cashier-bank-close-request';
type Props={scope:HandoffScope;bank:string;draft:Omit<BankCloseRequest,'id'|'bank'>|null;onResolved:()=>void};
export function CashierBankCloseAction(p:Props){return <Action key={[p.scope.tenant,p.scope.property,p.scope.actor,p.bank].join(':')} {...p}/>}
function Action({scope,bank,draft,onResolved}:Props){
 const key=['irp-bank-close-request',scope.tenant,scope.property,scope.actor,bank].join(':');
 const [pending,setPending]=useState<BankCloseRequest|null>(null),[confirmed,setConfirmed]=useState(false),[cancelConfirmed,setCancelConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[invalid,setInvalid]=useState(false);
 const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;try{const raw=sessionStorage.getItem(key);if(raw)setPending(readBankCloseRequest(JSON.parse(raw),scope,bank))}catch(e){setInvalid(true);setError(e instanceof Error?e.message:'Unable to recover bank request.')}return()=>{alive.current=false}},[key,scope,bank]);
 useEffect(()=>{setConfirmed(false)},[draft]);
 async function checkUser(){const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen reconciliation.');}
 function finish(request:BankCloseRequest,text:string){if(!alive.current)return;const current=readBankCloseRequest(JSON.parse(sessionStorage.getItem(key)??'null'),scope,bank);if(current.id!==request.id)throw Error('A different bank request is pending. Reopen reconciliation to review it.');sessionStorage.removeItem(key);if(alive.current){setPending(null);setConfirmed(false);setCancelConfirmed(false);setMessage(text);onResolved()}}
 async function run(action:'submit'|'status'|'cancel'){
  if(lock.current||invalid)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   await checkUser();if(!alive.current)return;let p=pending;
   if(!p){if(action!=='submit'||!draft||!confirmed)throw Error('Review and confirm this bank action.');if(sessionStorage.getItem(key)!==null)throw Error('An unresolved request exists. Reopen reconciliation.');p=readBankCloseRequest({...draft,bank,id:crypto.randomUUID()},scope,bank);sessionStorage.setItem(key,JSON.stringify(p));setPending(p);}
   const args={p_tenant:scope.tenant,p_property:scope.property,p_request:p.id};
   if(action==='submit'){
    const result=await hotelRpc(p.kind==='close'?'record_bank_close':'reopen_bank_close',{...args,...(p.kind==='close'?{p_review:p.review}:{p_close:p.close,p_reason:p.reason}),p_confirmed:true});await checkUser();if(!alive.current)return;readBankCloseReceipt(result,p,scope);finish(p,p.kind==='close'?'Bank close recorded. Refresh history to view it.':'Bank close reopened. Refresh history before making corrections.');
   }else{
    if(action==='cancel'){
     if(!cancelConfirmed)throw Error('Confirm cancellation of the saved request.');
     const r=await hotelRpc<Record<string,unknown>>('cancel_bank_close_request',{...args,p_kind:p.kind,p_confirmed:true});await checkUser();if(!alive.current)return;
     if(r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||r.request_id!==p.id||r.kind!==p.kind||r.cancelled!==true)throw Error('Cancellation receipt does not match. Check saved request status.');
    }
    const status=readBankCloseRequestStatus(await hotelRpc('bank_close_request_status',{...args,p_kind:p.kind}),p,scope);await checkUser();if(!alive.current)return;
    if(status.found)finish(p,status.reopened?'Saved close was recorded and subsequently reopened.':'Saved bank action was completed. Refresh history.');else if(status.cancelled)finish(p,'Saved bank request cancelled.');else if(alive.current)setMessage('The request is not recorded. Retry it or cancel it.');
   }
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to resolve bank request.')}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <section><h3>Confirm bank action</h3>{pending?<><p>Saved {pending.kind==='close'?'closing':'reopening'} request: {pending.id}</p><button disabled={busy||invalid} type="button" onClick={()=>void run('submit')}>Retry saved bank action</button><button disabled={busy||invalid} type="button" onClick={()=>void run('status')}>Check saved request status</button><label><input type="checkbox" disabled={busy} checked={cancelConfirmed} onChange={e=>setCancelConfirmed(e.target.checked)}/>Cancel this unresolved bank request</label><button disabled={busy||invalid||!cancelConfirmed} type="button" onClick={()=>void run('cancel')}>Cancel saved bank request</button></>:draft?<><label><input type="checkbox" disabled={busy||invalid} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm this {draft.kind==='close'?'closing review':'reopening and its reason'}</label><button disabled={busy||invalid||!confirmed} type="button" onClick={()=>void run('submit')}>{draft.kind==='close'?'Record bank close':'Reopen bank close'}</button></>:<p>Select a reviewed bank action to continue.</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
