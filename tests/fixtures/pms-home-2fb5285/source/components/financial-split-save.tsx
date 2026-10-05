'use client';
import {useEffect,useRef,useState} from 'react';
import {bankCloseMoney} from '@/lib/cashier-bank-close';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import {validateSplitSaveRequest,readSplitSaveReceipt,readSplitSaveStatus,type SplitSaveRequest} from '@/lib/financial-split-save';
type Props={draft:SplitSaveRequest;onSaved:(request:SplitSaveRequest)=>void;onCancelled?:()=>void;onRecoveryLock?:(locked:boolean)=>void};
export function FinancialSplitSave(props:Props){const s=props.draft.selection;return <SaveReview key={[s.scope.tenant,s.scope.property,s.scope.actor,s.batch].join(':')} {...props}/>}
function SaveReview({draft,onSaved,onCancelled,onRecoveryLock}:Props){
 const {scope,batch}=draft.selection,key=['irp.split.save.v1',scope.tenant,scope.property,scope.actor,batch].join(':');
 const [pending,setPending]=useState<SplitSaveRequest|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[cancelConfirmed,setCancelConfirmed]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const alive=useRef(false),locked=useRef(false);
 useEffect(()=>{alive.current=true;try{const raw=sessionStorage.getItem(key);if(raw){const r=JSON.parse(raw) as SplitSaveRequest;validateSplitSaveRequest(r);if(r.selection.scope.tenant!==scope.tenant||r.selection.scope.property!==scope.property||r.selection.scope.actor!==scope.actor||r.selection.batch!==batch)throw Error('Saved review belongs to another workspace.');setPending(r)}setReady(true)}catch(e){setError(e instanceof Error?e.message:'Unable to restore review.')}return()=>{alive.current=false}},[key]);
 useEffect(()=>{onRecoveryLock?.(!ready||busy||!!pending)},[ready,busy,pending,onRecoveryLock]);
 async function identify(){const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen migration.');}
 async function run(kind:'save'|'check'|'cancel'){
  if(!ready||locked.current||done)return;locked.current=true;setBusy(true);setError('');setMessage('');
  try{
   await identify();let request=pending;
   if(!request){if(kind!=='save'||!confirmed)throw Error('Confirm the reviewed decisions.');validateSplitSaveRequest(draft);if(sessionStorage.getItem(key))throw Error('Recover the existing save request first.');request=structuredClone(draft);sessionStorage.setItem(key,JSON.stringify(request));if(alive.current)setPending(request)}
   const args={p_tenant:scope.tenant,p_property:scope.property,p_request:request.id};let saved=false,cancelled=false;
   if(kind==='save'){if(!confirmed)throw Error('Confirm the reviewed decisions.');readSplitSaveReceipt(await hotelRpc('save_financial_migration_splits',{...args,p_review:request.review}),request);saved=true;}
   else{if(kind==='cancel'){if(!cancelConfirmed)throw Error('Confirm cancellation.');await hotelRpc('cancel_financial_migration_split_save',{...args,p_confirmed:true})}const status=readSplitSaveStatus(await hotelRpc('financial_migration_split_status',args),request);saved=status.found;cancelled=status.cancelled;}
   await identify();if(alive.current){if(saved||cancelled){if(saved)onSaved(request);sessionStorage.removeItem(key);setPending(null);setDone(true);setConfirmed(false);setCancelConfirmed(false);setMessage(saved?'Split allocation decisions saved. No balances were posted.':'Split allocation save cancelled.');if(cancelled)onCancelled?.()}else setMessage('No saved review found. Retry or cancel the original request.');}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to save split allocation.')}finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 const shown=pending??draft;
 return <section className="card" aria-label="Save split allocation review"><h3>Save split allocation decisions</h3><p>Saving retains the reviewed evidence. It does not post balances or collect money.</p><ul>{shown.allocations.map(d=><li key={JSON.stringify([d.source_item_id,d.invoice_id])}>{d.source_item_id} ({bankCloseMoney(d.amount_minor)}): {d.invoice_id!==null?`Existing invoice ${d.invoice_id}`:'Additional balance'} — {d.evidence}</li>)}</ul><label><input type="checkbox" checked={confirmed} disabled={!ready||busy||done} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed each source item and supporting reference</label><button type="button" disabled={!ready||busy||done||!confirmed} onClick={()=>void run('save')}>{pending?'Retry split allocation save':'Save split allocation decisions'}</button>{pending&&<><button type="button" disabled={busy} onClick={()=>void run('check')}>Check split allocation save</button><label><input type="checkbox" checked={cancelConfirmed} disabled={busy} onChange={e=>setCancelConfirmed(e.target.checked)}/>Cancel if the review was not saved</label><button type="button" disabled={busy||!cancelConfirmed} onClick={()=>void run('cancel')}>Cancel split allocation save</button></>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
