'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {hotelRpc,type Room} from '@/lib/pilot';
import {repairReportCancellation,repairReportKey,validPendingRepairReport,verifyRepairReportReceipt,repairReportStatus,type PendingRepairReport} from '@/lib/repair-work-orders';
type Props={actor:string;tenant:string;property:string;rooms:Room[];disabled?:boolean;onSaved:()=>void};
export function ReportRepair(props:Props){return <RepairForm key={props.actor+':'+props.tenant+':'+props.property} {...props}/>}
function RepairForm({actor,tenant,property,rooms,disabled=false,onSaved}:Props){
 const scope={actor,tenant,property},key=repairReportKey(scope);
 const [initial]=useState(()=>{try{const raw=sessionStorage.getItem(key);if(raw===null)return {pending:null,error:''};const value:unknown=JSON.parse(raw);if(!validPendingRepairReport(value,scope))throw Error();return {pending:value,error:''}}catch{return {pending:null,error:'The saved repair request cannot be read. Ask your manager to reconcile it before submitting another report.'}}});
 const [pending,setPending]=useState<PendingRepairReport|null>(initial.pending),[busy,setBusy]=useState(false),[error,setError]=useState(initial.error),[notice,setNotice]=useState('');
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 function complete(cancelled=false){sessionStorage.removeItem(key);if(alive.current){setPending(null);setNotice(cancelled?'Unsaved report cancelled. You can prepare a new report.':'Repair reported. You can track it in the repair list.');onSaved()}}
 async function run(command:PendingRepairReport,lookup:boolean,cancel=false){
  if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{
   if(cancel){const result=await hotelRpc<unknown>('cancel_repair_report',{p_tenant:tenant,p_property:property,p_request:command.request});complete(repairReportCancellation(result,command)==='cancelled');}
   else if(lookup){const receipt=await hotelRpc<unknown>('repair_request_status',{p_tenant:tenant,p_property:property,p_request:command.request});if(repairReportStatus(receipt,command))complete();else if(alive.current)setNotice('No confirmation was found yet. Retry this saved report to check and save it without creating a duplicate.');}
   else{const result=await hotelRpc<unknown>('report_repair',{p_tenant:tenant,p_property:property,p_request:command.request,p_room:command.room,p_location:command.location,p_description:command.description,p_priority:command.priority});verifyRepairReportReceipt(result,command);complete();}
  }catch(e){if(alive.current)setError((e instanceof Error?e.message:'Unable to confirm this repair.')+' Your saved report has been retained.');}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(disabled||lock.current||pending||initial.error)return;
  const form=new FormData(event.currentTarget),room=String(form.get('room')||'');
  const command={...scope,request:crypto.randomUUID(),room:room||null,location:String(form.get('location')||'').trim(),description:String(form.get('description')||'').trim(),priority:String(form.get('priority')||'normal')};
  if(!validPendingRepairReport(command,scope)||(room&&!rooms.some(r=>r.id===room))){setError('Choose a current room or common area, location, issue description, and priority.');return;}
  try{sessionStorage.setItem(key,JSON.stringify(command));if(sessionStorage.getItem(key)!==JSON.stringify(command))throw Error();}catch{setError('This browser cannot save recovery information. Enable browser storage before reporting a repair.');return;}
  setPending(command);event.currentTarget.reset();void run(command,false);
 }
 return <section className="card repair-panel" aria-label="Report a repair"><h2>Report a repair</h2>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {pending?<div><p>Saved report: <strong>{pending.location}</strong></p><p>{pending.description}</p><p>Confirm this report before starting another one.</p><button type="button" className="secondary" disabled={busy||disabled} onClick={()=>void run(pending,true)}>Check repair confirmation</button><button type="button" className="primary" disabled={busy||disabled} onClick={()=>void run(pending,false)}>Retry saved report</button><p>Cancel unsaved report keeps a report that already saved. Otherwise it prevents this request from creating a repair later.</p><button type="button" className="secondary" disabled={busy||disabled} onClick={()=>void run(pending,false,true)}>Cancel unsaved report</button></div>:
  <form onSubmit={submit}><fieldset disabled={busy||disabled||!!initial.error}>
   <label>Room <select name="room"><option value="">Common area / no room</option>{rooms.map(room=><option key={room.id} value={room.id}>{room.label}</option>)}</select></label>
   <label>Location <input name="location" required maxLength={200} placeholder="Room 113 bathroom or lobby"/></label>
   <label>What needs repair? <textarea name="description" required minLength={4} maxLength={2000}/></label>
   <label>Priority <select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
   <button type="submit" className="primary">Report repair</button>
  </fieldset></form>}
 </section>;
}
