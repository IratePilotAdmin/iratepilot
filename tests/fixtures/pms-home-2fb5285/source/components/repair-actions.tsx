'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {SubmitEvent} from 'react';
import {hotelRpc,type HotelWorkspace} from '@/lib/pilot';
import {RepairHistory} from './repair-history';
import {repairCancellationResult,availableRepairActions,parseRepairDetail,parseRepairTeam,repairChangeKey,repairChangeArgs,repairChangeStatus,validPendingRepairChange,verifyRepairChangeReceipt,type PendingRepairChange,type RepairAction,type RepairDetail,type RepairPerson} from '@/lib/repair-work-orders';
const names:Record<RepairAction,string>={priority:'Change priority',assign:'Assign repair',start:'Start work',submit:'Submit for verification',complete:'Verify completed repair',return:'Return for more work',cancel:'Cancel repair',reopen:'Reopen repair'};
type Props={actor:string;tenant:string;property:string;order:string|null;onSaved:()=>void};
export function RepairActions(props:Props){return <Actions key={[props.actor,props.tenant,props.property,props.order??''].join('/')} {...props}/>}
function Actions({actor,tenant,property,order,onSaved}:Props){
 const scope=useMemo(()=>({actor,tenant,property}),[actor,tenant,property]),key=repairChangeKey(scope);
 const [initial]=useState(()=>{try{const raw=sessionStorage.getItem(key);if(raw===null)return {pending:null,error:''};const p:unknown=JSON.parse(raw);if(!validPendingRepairChange(p,scope))throw Error();return {pending:p,error:''}}catch{return {pending:null,error:'The saved repair action cannot be read. Ask your manager to reconcile it before making another change.'}}});
 const [pending,setPending]=useState<PendingRepairChange|null>(initial.pending),[error,setError]=useState(initial.error),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[review,setReview]=useState<{detail:RepairDetail;role:string;people:RepairPerson[]}|null>(null),[action,setAction]=useState<RepairAction|' '>(' '),[revision,setRevision]=useState(0);
 const alive=useRef(true),lock=useRef(false);
 const [showSavedHistory,setShowSavedHistory]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{let current=true;if(!order||pending||initial.error)return;
  Promise.all([hotelRpc<unknown>('repair_detail',{p_tenant:tenant,p_property:property,p_order:order,p_after_version:0}),hotelRpc<HotelWorkspace>('workspace',{p_tenant:tenant,p_property:property})]).then(async([raw,workspace])=>{
   const detail=parseRepairDetail(raw,scope,order);if(workspace.property.id!==property||!['owner','manager','staff'].includes(workspace.role))throw Error('Unable to verify current property access.');
   const people:RepairPerson[]=[];
   if(['owner','manager'].includes(workspace.role)&&['reported','assigned'].includes(detail.order.state)){
    let after:string|null=null;
    do{const raw=await hotelRpc<unknown>('repair_assignees',{p_tenant:tenant,p_property:property,p_after:after,p_limit:100});const page=parseRepairTeam(raw,scope,after,100);people.push(...page.people);after=page.next_after;if(!current)return;}while(after);
   }
   if(current){setReview({detail,role:workspace.role,people});setError('');}
  }).catch(e=>{if(current)setError(e instanceof Error?e.message:'Unable to load repair actions.');});
  return()=>{current=false};
 },[scope,tenant,property,order,pending,revision,initial.error]);
 async function save(p:PendingRepairChange,lookup=false,cancel=false){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{
   let outcome: 'saved'|'cancelled'='saved';
   if(cancel){outcome=repairCancellationResult(await hotelRpc<unknown>('cancel_repair_request',{p_tenant:tenant,p_property:property,p_order:p.order,p_request:p.request}),p);}
   else if(lookup){const result=await hotelRpc<unknown>('repair_request_status',{p_tenant:tenant,p_property:property,p_request:p.request});if(!repairChangeStatus(result,p)){if(alive.current)setNotice('No confirmation found yet. Retry the saved action to reconcile it.');return;}}
   else verifyRepairChangeReceipt(await hotelRpc<unknown>(p.action==='priority'?'repair_priority':p.action==='assign'?'assign_repair':'repair_progress',repairChangeArgs(p)),p);
   sessionStorage.removeItem(key);if(alive.current){setPending(null);setReview(null);setAction(' ');setShowSavedHistory(false);setNotice(outcome==='cancelled'?'Unsaved request cancelled. Review the repair before making a new change.':'Repair updated.');setRevision(v=>v+1);onSaved();}
  }catch(e){if(alive.current)setError((e instanceof Error?e.message:'Unable to confirm repair update.')+' The saved action is retained.');}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 function submit(e:SubmitEvent<HTMLFormElement>){
  e.preventDefault();if(lock.current||pending||!review||action===' '||initial.error)return;
  if(!availableRepairActions(review.detail.order,actor,review.role).includes(action))return;
  const form=new FormData(e.currentTarget),value=(name:string)=>{const field=form.get(name);return typeof field==='string'?field.trim():''},p={...scope,request:crypto.randomUUID(),order:review.detail.order.id,version:review.detail.order.version,action,...(action==='priority'?{priority:value('priority'),priorState:review.detail.order.state}:{}),reason:value('reason'),assignee:action==='assign'?value('assignee'):null,due:action==='assign'?value('due')||null:null};
  if(!validPendingRepairChange(p,scope)||(action==='assign'&&!review.people.some(person=>person.user_id===p.assignee))){setError('Complete the selected action details and enter a reason of at least four characters.');return;}
  try{sessionStorage.setItem(key,JSON.stringify(p));if(sessionStorage.getItem(key)!==JSON.stringify(p))throw Error();}catch{setError('Browser recovery storage is unavailable. No action was sent.');return;}
  setPending(p);void save(p);
 }
 if(!order&&!pending&&!initial.error)return null;
 const actions=review?availableRepairActions(review.detail.order,actor,review.role):[];
 return <section className="card repair-panel" aria-label="Repair actions"><h3>Repair actions</h3>{error&&<p role="alert">{error}</p>}{notice&&<output>{notice}</output>}
 {!pending&&!initial.error&&order&&<button type="button" className="secondary" disabled={busy||(!review&&!error)} onClick={()=>{setError('');setReview(null);setRevision(v=>v+1)}}>Refresh repair actions</button>}
 {pending?<><p>Saved action: {names[pending.action]}</p>{pending.action==='priority'&&<p>New priority: {pending.priority}</p>}<p>{pending.reason}</p><p>Reviewed repair version: {pending.version}. History can help investigate this request; it does not confirm whether the saved action succeeded.</p><button type="button" aria-expanded={showSavedHistory} onClick={()=>setShowSavedHistory(v=>!v)}>{showSavedHistory?'Hide saved repair history':'View saved repair history'}</button>{showSavedHistory&&<RepairHistory key={pending.request} tenant={tenant} property={property} order={pending.order}/>}<button type="button" disabled={busy} onClick={()=>void save(pending,true)}>Check saved action</button><button type="button" disabled={busy} onClick={()=>void save(pending)}>Retry saved action</button><p>Cancel unsaved request keeps any change already saved. Otherwise, it prevents this request from saving later. It does not cancel the repair itself.</p><button type="button" disabled={busy} onClick={()=>void save(pending,false,true)}>Cancel unsaved request</button></>:review?<><h4>{review.detail.order.location}</h4>{actions.length?<form onSubmit={submit}><fieldset disabled={busy}><label>Action <select value={action} onChange={e=>setAction(e.target.value as RepairAction|' ')}><option value=" ">Choose action</option>{actions.map(a=><option key={a} value={a}>{names[a]}</option>)}</select></label>
 {action==='priority'&&<label>New priority <select name="priority" required defaultValue=""><option value="">Choose priority</option>{['low','normal','high','urgent'].filter(p=>p!==review.detail.order.priority).map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}</select></label>}
 {action==='assign'&&<><label>Assign to <select name="assignee" required><option value="">Choose staff member</option>{review.people.map(p=><option key={p.user_id} value={p.user_id}>{p.label}</option>)}</select></label><label>Due date <input name="due" type="date"/></label></>}
 <label>Work notes / reason <textarea name="reason" required minLength={4} maxLength={500}/></label><button className="primary" disabled={action===' '}>Save repair action</button></fieldset></form>:<p>No actions are available for your role and this repair status.</p>}</>:!error?<output>Loading repair actions…</output>:null}
 </section>;
}
