'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient} from '@/lib/pilot';
import {useClientReady} from '@/lib/client-ready';
import type {TurnoverScope} from '@/lib/turnovers';
import {readAssignmentBatch,storeAssignmentBatch,clearConfirmedAssignmentBatch,assignmentBatchArgs,validAssignmentBatch,verifyAssignmentBatchStatus,type PendingAssignmentBatch} from '@/lib/turnover-batch-recovery';
async function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 let abort=()=>{};const stopped=new Promise<never>((_,reject)=>{abort=()=>reject(Error('Request timed out'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()});
 try{return await Promise.race([promise,stopped])}finally{signal.removeEventListener('abort',abort)}
}
type Props=TurnoverScope&{candidate:PendingAssignmentBatch|null;disabled:boolean;canManage:boolean;onBusyChange:(busy:boolean)=>void;onPendingChange:(pending:boolean)=>void;onSaved:()=>Promise<void>};
export function AssignmentBatchSave(props:Props){return useClientReady()?<BatchControls key={props.actor+':'+props.tenant+':'+props.property} {...props}/>:null}
function BatchControls(props:Props){
 const [initial]=useState(()=>{try{return {pending:readAssignmentBatch(sessionStorage,props),error:''}}catch(cause){return {pending:null,error:cause instanceof Error?cause.message:'Recovery record unavailable.'}}});
 const [pending,setPending]=useState(initial.pending),[error,setError]=useState(initial.error),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false);
 const alive=useRef(false),lock=useRef(false),callbacks=useRef(props);
 useEffect(()=>{callbacks.current=props},[props]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(lock.current)callbacks.current.onBusyChange(false)}},[]);
 useEffect(()=>{props.onPendingChange(!!pending||!!initial.error)},[pending,initial.error,props.onPendingChange]);
 useEffect(()=>setReviewed(false),[props.candidate]);
 async function run(check:boolean,cancel=false){
  if(lock.current||props.disabled||initial.error||(!check&&!props.canManage))return;
  const request=pending??props.candidate;if(!request||(!pending&&!reviewed))return;
  lock.current=true;setBusy(true);setError('');setNotice('');props.onBusyChange(true);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   if(!validAssignmentBatch(request,props))throw Error('This assignment batch belongs to a different account or property. Reopen the reviewed property before continuing.');
   const client=hotelClient();const auth=await abortable(client.auth.getUser(),controller.signal);if(controller.signal.aborted)throw Error('Request timed out');if(!alive.current)return;
   if(auth.error||auth.data.user?.id!==props.actor)throw Error('Sign-in changed. Reopen this property.');
   if(!check){storeAssignmentBatch(sessionStorage,request);setPending(request);props.onPendingChange(true)}
   const response=await client.rpc(cancel?'irp_pms_pilot_cancel_turnover_batch':check?'irp_pms_pilot_turnover_batch_status':'irp_pms_pilot_assign_turnover_batch',(check||cancel)?{p_tenant:props.tenant,p_property:props.property,p_request:request.requestId}:assignmentBatchArgs(request)).abortSignal(controller.signal);
   if(response.error)throw Error('The batch result is unconfirmed. Keep this request and check its status.');
   const again=await abortable(client.auth.getUser(),controller.signal);if(controller.signal.aborted)throw Error('Request timed out');if(!alive.current)return;
   if(again.error||again.data.user?.id!==props.actor)throw Error('Sign-in changed. Keep the saved request.');
   const receipt=verifyAssignmentBatchStatus(check?response.data:{found:true,result:response.data},request);
   if(!receipt){setNotice('No receipt was found yet. The earlier request may still complete. Keep this request and check again.');return}
   clearConfirmedAssignmentBatch(sessionStorage,request,receipt);setPending(null);props.onPendingChange(false);setNotice(receipt.cancelled===true?'Unsaved batch cancelled. No delayed save can apply this request.':'Assignment batch confirmed.');setReviewed(false);
   try{await props.onSaved()}catch{if(alive.current)setError(receipt.cancelled===true?'Cancellation is confirmed, but refresh failed. Refresh the queue before more work.':'Assignments are confirmed, but refresh failed. Refresh the queue before more work.')}
  }catch(cause){if(alive.current)setError(controller.signal.aborted?'The request timed out. Check the saved batch before retrying.':cause instanceof Error?cause.message:'Unable to confirm batch.')}
  finally{clearTimeout(timer);lock.current=false;if(alive.current){setBusy(false);callbacks.current.onBusyChange(false)}}
 }
 return <section aria-label="Save assignment batch" style={{display:'grid',gap:12,overflowWrap:'anywhere'}}>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{pending?<><h3>Recover assignment batch</h3><p>{pending.assignments.length} assignments for {pending.day}. Request {pending.requestId}.</p><button className="secondary" disabled={props.disabled||busy||!!initial.error} onClick={()=>void run(true)}>Check saved assignment batch</button>{props.canManage&&<><button className="secondary" disabled={props.disabled||busy||!!initial.error} onClick={()=>void run(false)}>Retry exact assignment batch</button><button className="secondary" disabled={props.disabled||busy||!!initial.error} onClick={()=>void run(false,true)}>Cancel unsaved batch</button><p>Already saved assignments are preserved. Otherwise this request is cancelled and cannot save later.</p></>}</>:props.candidate&&props.canManage?<><label style={{display:'flex',alignItems:'center',gap:10,minHeight:44,cursor:'pointer'}}><input style={{width:20,height:20,flexShrink:0}} type="checkbox" checked={reviewed} disabled={props.disabled||busy||!!initial.error} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the proposed rooms, team and task limits.</label><button className="primary" disabled={!reviewed||props.disabled||busy||!!initial.error} onClick={()=>void run(false)}>Save reviewed assignments</button></>:null}</section>;
}
