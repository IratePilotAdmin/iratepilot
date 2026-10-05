'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {hotelClient} from '@/lib/pilot';

type Schedule={enabled:boolean;recipient_email:string;local_send_time:string;consent_confirmed:boolean;version:number;updated_at?:string};
type Delivery={business_date:string;state:string;attempt_count:number;sent_at:string|null;updated_at:string;last_error_code:string|null};
type Result={tenant_id:string;property_id:string;schedule:Schedule;deliveries:Delivery[]};
type SaveReceipt={tenant_id:string;property_id:string;enabled:boolean;local_send_time:string;version:number;replayed?:boolean};
const validEmail=(value:string)=>value.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);

export function ManagerDailyBriefSettings({actor,tenant,property,timeZone}:{actor:string;tenant:string;property:string;timeZone:string}){
 const [open,setOpen]=useState(false),[result,setResult]=useState<Result|null>(null),[recipient,setRecipient]=useState(''),[sendTime,setSendTime]=useState('08:00'),[enabled,setEnabled]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[uncertainSave,setUncertainSave]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<{request:string;version:number;recipient:string;time:string;enabled:boolean;consent:boolean}|null>(null),mounted=useRef(false),controller=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),15000);setError('');
  try{
   const client=hotelClient(),auth=await client.auth.getUser();if(auth.error||auth.data.user?.id!==actor)throw Error('Sign in again to review daily summary delivery settings.');
   const response=await client.rpc('irp_pms_pilot_manager_brief_schedule',{p_tenant:tenant,p_property:property}).abortSignal(abort.signal);
   if(response.error)throw Error(response.error.code==='PGRST202'?'Scheduled summaries are not activated in the connected database yet.':response.error.code==='42501'?'Only an owner or manager can manage this delivery.':response.error.message);
   const value=response.data as Result;if(value.tenant_id!==tenant||value.property_id!==property||!value.schedule||!Array.isArray(value.deliveries))throw Error('The schedule response did not match this property.');
   if(!mounted.current||abort.signal.aborted)return;const uncertain=pending.current;setResult(value);setRecipient(value.schedule.recipient_email);setSendTime(value.schedule.local_send_time);setEnabled(value.schedule.enabled);setConsent(value.schedule.consent_confirmed);
   if(uncertain&&value.schedule.version>uncertain.version){pending.current=null;setUncertainSave(false);const matched=value.schedule.recipient_email===uncertain.recipient&&value.schedule.local_send_time===uncertain.time&&value.schedule.enabled===uncertain.enabled&&value.schedule.consent_confirmed===uncertain.consent;setNotice(matched?'The previous save is confirmed.': 'The schedule changed while the save result was unknown. Review the current settings before saving again.');}else setNotice('');
  }catch(reason){if(!mounted.current||abort.signal.aborted)return;setError(reason instanceof Error?reason.message:'Schedule could not be loaded.');}finally{clearTimeout(timer);if(controller.current===abort)controller.current=null;}
 },[actor,tenant,property]);
 useEffect(()=>{mounted.current=true;if(!open)return()=>{mounted.current=false;controller.current?.abort()};const timer=window.setTimeout(()=>void load(),0);return()=>{window.clearTimeout(timer);mounted.current=false;controller.current?.abort()}},[load,open]);
 async function save(){
  if(busy||!result)return;setError('');setNotice('');
  if(!validEmail(recipient.trim())){setError('Enter a valid recipient email address.');return;}
  if(enabled&&!consent){setError('Confirm that you are authorized to send this property’s operational summary to that address.');return;}
  const command=pending.current??{request:crypto.randomUUID(),version:result.schedule.version,recipient:recipient.trim().toLowerCase(),time:sendTime,enabled,consent};pending.current=command;setUncertainSave(true);setBusy(true);const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
  let rpcDispatched=false;
  try{
   const client=hotelClient(),auth=await client.auth.getUser();if(auth.error||auth.data.user?.id!==actor)throw Error('Sign in again before saving.');
   const request=client.rpc('irp_pms_pilot_save_manager_brief_schedule',{p_tenant:tenant,p_property:property,p_request:command.request,p_expected_version:command.version,p_recipient_email:command.recipient,p_local_send_time:command.time,p_enabled:command.enabled,p_consent_confirmed:command.consent}).abortSignal(abort.signal);rpcDispatched=true;const response=await request;
   if(response.error){pending.current=null;setUncertainSave(false);throw Error(response.error.code==='PGRST202'?'Scheduled summaries are not activated in the connected database yet.':response.error.code==='42501'?'Only an owner or manager can change this schedule.':response.error.message);}
   const saved=response.data as SaveReceipt;if(saved.tenant_id!==tenant||saved.property_id!==property||saved.version!==command.version+1||saved.enabled!==command.enabled)throw Error('Save result could not be verified. Reload schedule status before trying again.');
   pending.current=null;setUncertainSave(false);setNotice('Schedule settings saved. Delivery requires the hosted worker and email sender to be configured.');await load();
  }catch(reason){if(!rpcDispatched){pending.current=null;setUncertainSave(false);}if(mounted.current)setError(reason instanceof Error?reason.message:'Save result is unknown. Select Save again to safely retry the same request.');}finally{clearTimeout(timer);if(mounted.current)setBusy(false);}
 }
 return <section className="card manager-brief-schedule" aria-labelledby="manager-daily-brief-settings-title">
  <div className="section-top"><div><h2 id="manager-daily-brief-settings-title">Scheduled manager summary</h2><p>Optional daily email with property-level room and stay counts only.</p></div><button type="button" className="secondary" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Hide schedule':'Configure schedule'}</button></div>
  {open&&<>
  <div className="section-top"><span>Review the recipient, local send time, and delivery status for this property.</span><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}>Refresh status</button></div>
  <p>Send time uses {timeZone}. The email excludes guest names, reservation references, room numbers, payments, folios, and identity details.</p>
  {uncertainSave&&<p>A previous save has an unknown result. Retry that exact save or refresh status before editing these fields.</p>}
  <div className="manager-brief-fields"><label className="field">Recipient email<input type="email" autoComplete="email" maxLength={254} value={recipient} disabled={busy||uncertainSave} onChange={event=>setRecipient(event.target.value)}/></label><label className="field">Daily send time ({timeZone})<input type="time" value={sendTime} disabled={busy||uncertainSave} onChange={event=>setSendTime(event.target.value)}/></label></div>
  <label className="manager-brief-check"><input type="checkbox" checked={enabled} disabled={busy||uncertainSave} onChange={event=>setEnabled(event.target.checked)}/>Enable scheduled summary email</label>
  {enabled&&<label className="manager-brief-check"><input type="checkbox" checked={consent} disabled={busy||uncertainSave} onChange={event=>setConsent(event.target.checked)}/>I am authorized to send this property’s operational summary to the address above.</label>}
  <div className="manager-brief-save"><button type="button" className="primary" disabled={busy||!result} onClick={()=>void save()}>{busy?'Saving…':uncertainSave?'Retry same save':'Save schedule'}</button><span>{enabled?'Delivery is opt-in and still depends on the hosted worker being configured.':'Email delivery is off.'}</span></div>
  {error&&<p className="pilot-error" role="alert">{error}</p>}{notice&&<output className="manager-brief-success">{notice}</output>}
  {result&&<div className="manager-brief-history"><h3>Recent delivery status</h3><table className="pilot-table"><thead><tr><th>Business date</th><th>Status</th><th>Attempts</th><th>Last update</th></tr></thead><tbody>{result.deliveries.map(item=><tr key={item.business_date}><td>{item.business_date}</td><td>{item.state.replaceAll('_',' ')}</td><td>{item.attempt_count}</td><td>{new Date(item.updated_at).toLocaleString()}</td></tr>)}{!result.deliveries.length&&<tr><td colSpan={4}>No delivery attempts yet.</td></tr>}</tbody></table></div>}
  </>}
 </section>;
}
