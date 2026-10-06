'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {PropertyAccessHistory} from '@/components/property-access-history';
import {preparePropertyAccessChange,readPropertyStaffPage,type PropertyRole,type PropertyStaffMember,type PropertyStaffPage} from '@/lib/property-staff-access';
type Props={tenant:string;property:string;actor:string;role:string};
export function PropertyStaffAccessPanel(props:Props){
 if(props.role!=='owner')return <p>Only an organization owner can manage property access.</p>;
 return <AccessEditor key={`${props.tenant}/${props.property}/${props.actor}`} {...props}/>;
}
function AccessEditor({tenant,property,actor}:Props){
 const [page,setPage]=useState<PropertyStaffPage|null>(null),[cursor,setCursor]=useState<string|null>(null),[selected,setSelected]=useState<PropertyStaffMember|null>(null);
 const [access,setAccess]=useState<PropertyRole>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reads=useRef(0),alive=useRef(true),running=useRef(false),pending=useRef<ReturnType<typeof preparePropertyAccessChange>|null>(null);
 const [retry,setRetry]=useState(false); const [history,setHistory]=useState<PropertyStaffMember|null>(null); const [historyVersion,setHistoryVersion]=useState(0);
 useEffect(()=>{alive.current=true;let current=true;const version=++reads.current;setPage(null);setError('');
  hotelRpc('property_staff_access',{p_tenant:tenant,p_property:property,p_after:cursor}).then(value=>{if(current&&version===reads.current)setPage(readPropertyStaffPage(value,tenant,property,cursor))}).catch(e=>{if(current&&version===reads.current)setError(e instanceof Error?e.message:'Unable to load staff access.')});
  return()=>{current=false;alive.current=false};
 },[tenant,property,cursor]);
 async function refresh(){
  if(running.current)return;running.current=true;++reads.current;setBusy(true);setError('');
  try{const value=await hotelRpc('property_staff_access',{p_tenant:tenant,p_property:property,p_after:cursor});const verified=readPropertyStaffPage(value,tenant,property,cursor);if(alive.current){setPage(verified);pending.current=null;setRetry(false);setSelected(null);setNotice('Current access loaded. Review it before making another change.')}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to refresh access.')}finally{running.current=false;if(alive.current)setBusy(false)}
 }
 async function save(){
  if(running.current||!selected)return;running.current=true;++reads.current;setBusy(true);setError('');setNotice('');
  try{
   const command=pending.current??preparePropertyAccessChange(tenant,property,selected,access,reason,crypto.randomUUID());pending.current=command;setRetry(true);
   const result=await hotelRpc<Record<string,unknown>>('set_property_staff_access',command);
   if(!result||result.tenant_id!==tenant||result.property_id!==property||result.user_id!==command.p_user||result.actor_id!==actor||result.request_id!==command.p_request||result.membership_generation!==command.p_generation||result.next_role!==command.p_role||result.expected_revision!==command.p_revision||result.reason!==command.p_reason)throw Error('The save result could not be verified. Retry the same change.');
   if(!alive.current)return;pending.current=null;setRetry(false);setSelected(null);setNotice('Property access saved.');setHistoryVersion(v=>v+1);setPage(null);
   const refreshed=await hotelRpc('property_staff_access',{p_tenant:tenant,p_property:property,p_after:cursor});
   if(alive.current)setPage(readPropertyStaffPage(refreshed,tenant,property,cursor));
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to save access. Retry the same change.')}finally{running.current=false;if(alive.current)setBusy(false)}
 }
 return <section className="card pilot-settings"><h2>Access to this property</h2><p>Owners retain access to every property. Choose which other team members can work here.</p>
  {error&&<div className="pilot-error" role="alert">{error}</div>}{notice&&<p role="status">{notice}</p>}
  {!page&&!error&&<p role="status">Loading staff…</p>}
  {page&&<div className="pilot-staff-list">{page.members.map(member=><div className="pilot-list-row" key={member.user_id}><div><strong>{member.email??member.user_id}</strong><small>{member.effective_role===null?'No property access':member.effective_role==='owner'?'Owner — all properties':member.effective_role==='manager'?'Manager':'Staff'}</small></div><button className="secondary" onClick={()=>setHistory(member)}>History</button>{member.account_role!=='owner'&&<button className="secondary" disabled={busy||retry} onClick={()=>{setSelected(member);setAccess(member.assigned_role);setReason('');setError('');setNotice('')}}>Change access</button>}</div>)}</div>}
  {history&&<PropertyAccessHistory key={`${history.user_id}/${historyVersion}`} tenant={tenant} property={property} user={history.user_id} label={history.email??history.user_id}/>}
  {selected&&<form onSubmit={e=>{e.preventDefault();void save()}}><h3>{selected.email??selected.user_id}</h3><label className="field">Property access<select disabled={busy||retry} value={access??'none'} onChange={e=>setAccess(e.target.value==='none'?null:e.target.value as PropertyRole)}><option value="none">No access</option><option value="staff">Staff</option>{selected.account_role==='manager'&&<option value="manager">Manager</option>}</select></label><label className="field">Reason for change<textarea required minLength={4} maxLength={500} value={reason} disabled={busy||retry} onChange={e=>setReason(e.target.value)}/></label>{retry&&<p>Retry uses the same change to avoid duplicate records.</p>}<div className="pilot-actions"><button className="primary" disabled={busy}>{busy?'Saving…':retry?'Retry same change':'Save property access'}</button><button type="button" className="secondary" disabled={busy||retry} onClick={()=>setSelected(null)}>Cancel</button></div></form>}
  <div className="pilot-actions"><button className="secondary" disabled={busy} onClick={()=>void refresh()}>Refresh current access</button>{cursor&&<button className="secondary" disabled={busy||retry} onClick={()=>{setSelected(null);setCursor(null)}}>First page</button>}{page?.next&&<button className="secondary" disabled={busy||retry} onClick={()=>{setSelected(null);setCursor(page.next)}}>Next page</button>}</div>
 </section>;
}



