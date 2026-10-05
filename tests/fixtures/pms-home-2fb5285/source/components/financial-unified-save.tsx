'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import {readUnifiedSaveStatus,validateUnifiedSaveRequest,type UnifiedSaveRequest} from '@/lib/financial-unified-save';
type Props={draft:UnifiedSaveRequest;onSaved:(r:UnifiedSaveRequest)=>void;onCancelled:()=>void;onRecoveryLock:(locked:boolean)=>void};
export function FinancialUnifiedSave(props:Props){const d=props.draft;return <Save key={[d.scope.tenant,d.scope.property,d.scope.actor,d.batch].join(':')} {...props}/>}
function Save({draft,onSaved,onCancelled,onRecoveryLock}:Props){
 const {scope,batch}=draft,key=['irp.unified.save.v1',scope.tenant,scope.property,scope.actor,batch].join(':');
 const [pending,setPending]=useState<UnifiedSaveRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[cancelConfirmed,setCancelConfirmed]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;try{const stored=sessionStorage.getItem(key);if(stored){const r=validateUnifiedSaveRequest(JSON.parse(stored));if(r.scope.tenant!==scope.tenant||r.scope.property!==scope.property||r.scope.actor!==scope.actor||r.batch!==batch)throw Error('Saved request belongs to another workspace.');setPending(r)}setReady(true)}catch(e){setError(e instanceof Error?e.message:'Unable to recover migration.')}return()=>{alive.current=false}},[key]);
 useEffect(()=>{onRecoveryLock(!ready||busy||!!pending)},[ready,busy,pending,onRecoveryLock]);
 async function identify(){const u=await hotelClient().auth.getUser();if(u.error||u.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen migration.');}
 async function run(kind:'save'|'check'|'cancel'){
  if(!ready||lock.current||done)return;lock.current=true;setBusy(true);setError('');
  try{
   await identify();let request=pending;
   if(!request){if(kind!=='save'||!confirmed)throw Error('Confirm the reviewed balances.');if(sessionStorage.getItem(key))throw Error('Recover the existing request first.');request=structuredClone(validateUnifiedSaveRequest(draft));sessionStorage.setItem(key,JSON.stringify(request));if(alive.current)setPending(request);}
   const args={p_tenant:scope.tenant,p_property:scope.property,p_request:request.id};let value:unknown;
   if(kind==='save'){if(!confirmed)throw Error('Confirm the reviewed balances.');value=await hotelRpc('save_unified_financial_migration_review',{...args,p_review:request.review});}
   else if(kind==='cancel'){if(!cancelConfirmed)throw Error('Confirm cancellation.');value=await hotelRpc('cancel_unified_financial_migration_review',{...args,p_reason:'Cancelled unsaved migration review'});}
   else value=await hotelRpc('unified_financial_migration_review_status',args);
   const status=readUnifiedSaveStatus(value,request);await identify();
   if(alive.current){if(status.outcome==='missing')setMessage('No saved review found. Retry or cancel this request.');else{if(status.outcome==='saved')onSaved(request);sessionStorage.removeItem(key);setPending(null);setDone(true);setMessage(status.outcome==='saved'?'Review saved. Balances have not been posted.':'Unsaved review cancelled.');if(status.outcome==='cancelled')onCancelled();}}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to resolve migration save.')}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <section className="card" aria-label="Save invoice and deposit review"><h3>Save reviewed allocations</h3><p>Saving retains the decisions and evidence. Posting balances is a separate step.</p><label><input type="checkbox" disabled={!ready||busy||done} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the allocations and supporting references</label><button type="button" disabled={!ready||busy||done||!confirmed} onClick={()=>void run('save')}>{pending?'Retry review save':'Save migration review'}</button>{pending&&<><button type="button" disabled={busy} onClick={()=>void run('check')}>Check saved review</button><label><input type="checkbox" disabled={busy} checked={cancelConfirmed} onChange={e=>setCancelConfirmed(e.target.checked)}/>Cancel only if this review was not saved</label><button type="button" disabled={busy||!cancelConfirmed} onClick={()=>void run('cancel')}>Cancel unsaved review</button></>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
