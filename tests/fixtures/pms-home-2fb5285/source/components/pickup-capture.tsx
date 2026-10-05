'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import {useClientReady} from '@/lib/client-ready';
import {afterDays} from '@/lib/rates';
import {definitiveBookingRejection} from '@/lib/pending-booking';
type Command={p_capture:string;p_start:string;p_end:string};
type Props={actor:string;tenant:string;property:string;businessDate:string};
function valid(v:unknown):v is Command{
 if(!v||typeof v!=='object')return false;const c=v as Command;
 const date=(d:unknown):d is string=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 return Object.keys(c).sort().join(',')==='p_capture,p_end,p_start'&&typeof c.p_capture==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.p_capture)&&date(c.p_start)&&date(c.p_end)&&c.p_end>c.p_start&&Date.parse(c.p_end)-Date.parse(c.p_start)<=31*86400000;
}
export function PickupCapture(props:Props){return useClientReady()?<CaptureForm key={props.actor+'/'+props.tenant+'/'+props.property} {...props}/>:<p>Loading snapshot recovery…</p>}
function CaptureForm({actor,tenant,property,businessDate}:Props){
 const key='iratepilot-pickup-capture:'+actor+':'+tenant+':'+property;
 const [initial]=useState(()=>{try{const raw=sessionStorage.getItem(key);if(raw===null)return {pending:null,error:''};const v:unknown=JSON.parse(raw);if(!valid(v))throw Error();return {pending:v,error:''}}catch{return {pending:null,error:'Saved snapshot request cannot be read. Reconcile it before creating another snapshot.'}}});
 const [pending,setPending]=useState<Command|null>(initial.pending),[busy,setBusy]=useState(false),[error,setError]=useState(initial.error),[notice,setNotice]=useState('');
 const [start,setStart]=useState(businessDate),[end,setEnd]=useState(afterDays(businessDate,7));
 const generation=useRef(0),alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++}},[]);
 function verifyStored(command:Command,optional=false){
  const raw=sessionStorage.getItem(key);if(raw===null&&optional)return;
  const current=raw===null?null:JSON.parse(raw);
  if(!valid(current)||current.p_capture!==command.p_capture||current.p_start!==command.p_start||current.p_end!==command.p_end)throw Error('A different snapshot request is pending. Reopen Booking pickup to review it.');
 }
 async function save(){
  if(lock.current||initial.error)return;
  const command=pending??{p_capture:crypto.randomUUID(),p_start:start,p_end:end};
  if(!valid(command)){setError('Select 1 to 31 stay nights. The end date is excluded.');return;}
  const recovered=!!pending,id=++generation.current;lock.current=true;setBusy(true);setError('');setNotice('');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   verifyStored(command,true);
   sessionStorage.setItem(key,JSON.stringify(command));setPending(command);
   const response=await Promise.race([(async()=>{
    const {data,error:authError}=await hotelClient().auth.getUser();
    if(authError||data.user?.id!==actor)throw Error('Sign-in changed. Return to your workspace before retrying.');
    if(!alive.current||generation.current!==id)throw Error('Request interrupted.');
    return hotelRpc<{schema_version:number;tenant_id:string;property_id:string;actor_id:string;capture:Record<string,unknown>}>('capture_pickup',{p_tenant:tenant,p_property:property,...command});
   })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The response is delayed. Retry this saved snapshot request.')),15000)})]);
   if(!alive.current||generation.current!==id)return;
   const c=response?.capture;
   const timestamp=(v:unknown):v is string=>typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
   const nights=(Date.parse(command.p_end)-Date.parse(command.p_start))/86400000;
   if(!c||!timestamp(c.started_at)||!timestamp(c.completed_at)||Date.parse(c.completed_at)<Date.parse(c.started_at)||typeof c.row_count!=='number'||c.row_count>10000||c.row_count%nights!==0)throw Error('Snapshot confirmation could not be verified. Retry the saved request.');
   if(response?.schema_version!==1||response.tenant_id!==tenant||response.property_id!==property||response.actor_id!==actor||!c||c.tenant_id!==tenant||c.property_id!==property||c.capture_id!==command.p_capture||c.start_date!==command.p_start||c.end_date!==command.p_end||!Number.isSafeInteger(c.row_count)||(c.row_count as number)<1||typeof c.replayed!=='boolean')throw Error('Snapshot confirmation could not be verified. Retry the saved request.');
   verifyStored(command);
   sessionStorage.removeItem(key);setPending(null);setNotice('Snapshot saved. Load recent captures to compare it.');
  }catch(e){if(alive.current&&generation.current===id){
   if(!recovered&&definitiveBookingRejection(e)){try{verifyStored(command);sessionStorage.removeItem(key);setPending(null)}catch{}}
   setError(e instanceof Error?e.message:'Snapshot save failed. Retry the saved request.');
  }}finally{clearTimeout(timer);if(alive.current&&generation.current===id){generation.current++;lock.current=false;setBusy(false)}}
 }
 return <section><h3>Save pickup snapshot</h3><p>Save current booked room nights and room revenue for a future comparison. This does not change reservations or rates. Development preview.</p>{error&&<p role="alert" className="pilot-error">{error}</p>}{notice&&<p role="status">{notice}</p>}{pending?<p>Saved request: {pending.p_start} to {pending.p_end} (end excluded).</p>:<div className="form-grid"><label className="field">First stay night<input type="date" value={start} disabled={busy||!!initial.error} onChange={e=>setStart(e.target.value)}/></label><label className="field">End date (excluded)<input type="date" value={end} disabled={busy||!!initial.error} onChange={e=>setEnd(e.target.value)}/></label></div>}<button className="secondary" disabled={busy||!!initial.error} onClick={()=>void save()}>{busy?'Saving snapshot…':pending?'Retry saved snapshot':'Save pickup snapshot'}</button></section>;
}
