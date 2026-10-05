'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {pickupInstant} from '@/lib/pickup-time';

type Event={day:string;at:string;status:string;version:number};
const healthLabels:Record<string,string>={unconfigured:'Not configured',disabled:'Disabled',configuration_error:'Schedule configuration needs attention',waiting:'Waiting for the first eligible capture',captured:'Latest expected capture recorded',missed:'Latest expected capture was missed',overdue:'Capture overdue — no completion recorded',pending:'Capture window is open',failed:'Capture attempt failed — retry may still complete'};
type Status={schedule:{version:number;enabled:boolean;cutoff:string;time_zone:string;horizon:number;window_seconds:number}|null;runs:number;failures:number;events:Event[];health:{state:string;checked_at:string}|null};
function parse(value:unknown,tenant:string,property:string):Status{
 const d=value as Record<string,unknown>;
 if(!d||d.schema_version!==1||d.tenant_id!==tenant||d.property_id!==property)throw Error('Schedule response did not match this property.');
 for(const key of ['recent_runs','recent_failures','recent_changes']){
  const rows=d[key];
  if(!Array.isArray(rows)||rows.some(r=>!r||r.tenant_id!==tenant||r.property_id!==property))throw Error('Schedule history did not match this property.');
 }
 const s=d.schedule as Record<string,unknown>|null;
 if(s!==null&&(!s||s.tenant_id!==tenant||s.property_id!==property||typeof s.enabled!=='boolean'||typeof s.cutoff!=='string'||typeof s.time_zone!=='string'))throw Error('Schedule settings could not be read.');
 if(s&&(!Number.isSafeInteger(s.version)||Number(s.version)<1||!Number.isInteger(s.horizon)||Number(s.horizon)<1||Number(s.horizon)>31||!Number.isInteger(s.window_seconds)||Number(s.window_seconds)<0||Number(s.window_seconds)>3600))throw Error('Schedule values could not be read.');
 const events:Event[]=[];
 for(const key of ['recent_runs','recent_failures'])for(const row of d[key] as Record<string,unknown>[]){
  const at=key==='recent_runs'?row.recorded_at:row.failed_at;
  if(typeof at!=='string'||pickupInstant(at)===null||typeof row.local_day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.local_day)||!Number.isSafeInteger(row.schedule_version)||Number(row.schedule_version)<1)throw Error('Capture history contains invalid timing.');
  if(key==='recent_runs'&&row.status!=='captured'&&row.status!=='missed')throw Error('Capture history contains an unknown result.');
  events.push({day:row.local_day,at,status:key==='recent_failures'?'Failed attempt':row.status==='captured'?'Captured':'Missed',version:Number(row.schedule_version)});
 }
 events.sort((a,b)=>{const x=pickupInstant(a.at)!,y=pickupInstant(b.at)!;return x===y?0:x>y?-1:1});
 const health=d.health as Record<string,unknown>|undefined;
 if(health&&(!Object.hasOwn(healthLabels,String(health.state))||typeof health.checked_at!=='string'||pickupInstant(health.checked_at)===null||health.schedule_version!==(s?.version??null)))throw Error('Schedule health could not be verified.');
 return {schedule:s as Status['schedule'],runs:(d.recent_runs as unknown[]).length,failures:(d.recent_failures as unknown[]).length,events,health:health as Status['health']??null};
}
export function PickupScheduleStatus({tenant,property}:{tenant:string;property:string}){
 return <ScheduleSession key={tenant+'/'+property} tenant={tenant} property={property}/>;
}
function ScheduleSession({tenant,property}:{tenant:string;property:string}){
 const [data,setData]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const sequence=useRef(0),running=useRef(false);
 const [notice,setNotice]=useState('');
 useEffect(()=>()=>{sequence.current++},[]);
 async function load(){
  if(running.current)return;running.current=true;const id=++sequence.current;
  setBusy(true);setError('');setNotice('');setData(null);let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const result=await Promise.race([hotelRpc('pickup_schedule',{p_tenant:tenant,p_property:property}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Schedule loading timed out. Please retry.')),15000)})]);
   if(id===sequence.current)setData(parse(result,tenant,property));
  }catch(e){if(id===sequence.current)setError(e instanceof Error?e.message:'Could not load schedule.');}
  finally{clearTimeout(timer);if(id===sequence.current){running.current=false;setBusy(false)}}
 }
 async function save(form:HTMLFormElement){
  if(running.current||!data)return;
  const values=new FormData(form),horizon=Number(values.get('horizon')),windowSeconds=Number(values.get('window'));
  const cutoff=String(values.get('cutoff')??'');
  if(!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(cutoff)||!Number.isInteger(horizon)||horizon<1||horizon>31||!Number.isInteger(windowSeconds)||windowSeconds<0||windowSeconds>3600){setError('Enter a valid time, 1–31 nights and a 0–3600 second window.');return;}
  running.current=true;const id=++sequence.current;setBusy(true);setError('');setNotice('');
  const expected=data.schedule?.version??0;setData(null);let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const result=await Promise.race([hotelRpc('set_pickup_schedule',{p_tenant:tenant,p_property:property,p_expected_version:expected,p_enabled:values.get('enabled')==='on',p_cutoff:cutoff,p_horizon:horizon,p_window_seconds:windowSeconds}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Save confirmation timed out.')),15000)})]);
   const receipt=result as Record<string,unknown>;
   if(!receipt||receipt.tenant_id!==tenant||receipt.property_id!==property||receipt.version!==expected+1||receipt.enabled!==(values.get('enabled')==='on')||receipt.horizon!==horizon||receipt.window_seconds!==windowSeconds||receipt.cutoff!==(cutoff.length===5?cutoff+':00':cutoff))throw Error('Save response did not match the requested settings.');
   if(id===sequence.current)setNotice('Schedule saved. Load schedule status to review the saved settings.');
  }catch(e){if(id===sequence.current)setError((e instanceof Error?e.message:'Save could not be confirmed.')+' Load schedule status before trying another edit.');}
  finally{clearTimeout(timer);if(id===sequence.current){running.current=false;setBusy(false)}}
 }
 return <section className="card" aria-label="Revenue capture schedule"><h2>Revenue capture schedule</h2>
  <p>Development preview. Saved settings do not confirm that automatic scheduling is active.</p>
  <button type="button" className="btn secondary" disabled={busy} onClick={load}>{busy?'Loading schedule…':'Load schedule status'}</button>
  {error&&<p role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {data&&<div role="status">{data.schedule?<p>Saved schedule: {data.schedule.enabled?'Enabled':'Disabled'} · {data.schedule.cutoff} ({data.schedule.time_zone})</p>:<p>No schedule has been configured.</p>}
   <p>Recent recorded runs: {data.runs} (up to 31). Recent failed attempts: {data.failures} (up to 31).</p>
   <p>Failure history may include attempts followed by a successful retry.</p></div>}
  {data&&<div aria-label="Capture health">{data.health?<><p role={['overdue','missed','failed','configuration_error'].includes(data.health.state)?'alert':undefined}>{healthLabels[data.health.state]}</p><p>Checked by the server at {data.health.checked_at}. Load schedule status again to refresh. This checks the latest expected occurrence, not the entire capture history.</p></>:<p>Current capture health is unavailable. Earlier successful runs do not confirm that the scheduler is running.</p>}</div>}
  {!!data?.events.length&&<div className="table-wrap"><table aria-label="Recent scheduled capture results"><thead><tr><th>Scheduled day</th><th>Result</th><th>Recorded time (with UTC offset)</th><th>Schedule version</th></tr></thead><tbody>{data.events.map((event,index)=><tr key={index}><td>{event.day}</td><td>{event.status}</td><td>{event.at}</td><td>{event.version}</td></tr>)}</tbody></table></div>}
  {data&&<form aria-label="Edit capture schedule" onSubmit={e=>{e.preventDefault();void save(e.currentTarget)}}>
   <label className="field">Daily capture time (property time zone)<input name="cutoff" type="time" step="1" required defaultValue={data.schedule?.cutoff??'06:00'}/></label>
   <label className="field">Stay nights to capture<input name="horizon" type="number" min="1" max="31" required defaultValue={data.schedule?.horizon??7}/></label>
   <label className="field">Allowed delay (seconds)<input name="window" type="number" min="0" max="3600" required defaultValue={data.schedule?.window_seconds??300}/></label>
   <label><input name="enabled" type="checkbox" defaultChecked={data.schedule?.enabled??false}/> Enable saved schedule</label>
   <p>Late captures outside this window are recorded as missed. Actual observation times remain unchanged.</p>
   <button className="btn primary" type="submit" disabled={busy}>Save capture schedule</button>
  </form>}
 </section>;
}
