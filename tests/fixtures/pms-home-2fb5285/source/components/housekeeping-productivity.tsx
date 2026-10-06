'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient} from '@/lib/pilot';
type Day={report_date:string;completed_turnovers:number;cleaning_samples:number;average_cleaning_minutes:number|null;inspection_samples:number;average_inspection_minutes:number|null};
type Report={tenant_id:string;property_id:string;start_date:string;end_date:string;time_zone:string;generated_at:string;days:Day[]};
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function HousekeepingProductivity({actor,tenant,property,businessDate}:{actor:string;tenant:string;property:string;businessDate:string}){
 const [start,setStart]=useState(businessDate),[end,setEnd]=useState(businessDate),[report,setReport]=useState<Report|null>(null),[reportKey,setReportKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const mounted=useRef(false),pending=useRef<AbortController|null>(null),scope=useRef('');
 const scopeKey=JSON.stringify([actor,tenant,property,businessDate]);scope.current=scopeKey;
 const requestKey=JSON.stringify([actor,tenant,property,start,end]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort()}},[]);
 useEffect(()=>{pending.current?.abort();pending.current=null;setReport(null);setReportKey('');setError('');setBusy(false);setStart(businessDate);setEnd(businessDate);return()=>pending.current?.abort()},[actor,tenant,property,businessDate]);
 async function load(){
  if(pending.current)return;setReport(null);setError('');
  const length=(Date.parse(end)-Date.parse(start))/86400000+1;
  if(!validDate(start)||!validDate(end)||length<1||length>31){setError('Choose 1 to 31 days.');return}
  const controller=new AbortController(),requestScope=scopeKey,loadedKey=requestKey;pending.current=controller;setBusy(true);const timer=setTimeout(()=>controller.abort(),30000);
  try{
   const client=hotelClient(),user=await client.auth.getUser();if(user.error||user.data.user?.id!==actor)throw Error('Sign in again to review housekeeping.');
   if(controller.signal.aborted||scope.current!==requestScope)return;
   const {data,error:failure}=await client.rpc('irp_pms_pilot_housekeeping_productivity',{p_tenant:tenant,p_property:property,p_start:start,p_end:end}).abortSignal(controller.signal);
   if(failure)throw Error('Housekeeping reporting is unavailable. Current owner or manager access and the report update are required.');
   if(controller.signal.aborted||scope.current!==requestScope)return;
   const r=data as Report;
   if(!r||r.tenant_id!==tenant||r.property_id!==property||r.start_date!==start||r.end_date!==end||typeof r.time_zone!=='string'||!Number.isFinite(Date.parse(r.generated_at))||!Array.isArray(r.days)||r.days.length!==length)throw Error('The report could not be verified.');
   new Intl.DateTimeFormat('en-US',{timeZone:r.time_zone}).format();
   r.days.forEach((d,i)=>{
    const expected=new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10);
    if(!d||d.report_date!==expected||![d.completed_turnovers,d.cleaning_samples,d.inspection_samples].every(n=>Number.isSafeInteger(n)&&n>=0)||d.cleaning_samples>d.completed_turnovers||d.inspection_samples>d.completed_turnovers)throw Error('The daily totals could not be verified.');
    for(const [count,average] of [[d.cleaning_samples,d.average_cleaning_minutes],[d.inspection_samples,d.average_inspection_minutes]])if(count===0?average!==null:typeof average!=='number'||!Number.isFinite(average)||average<0)throw Error('The timing data could not be verified.');
   });
   const again=await client.auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this property.');
   if(controller.signal.aborted||scope.current!==requestScope)return;if(mounted.current){setReport(r);setReportKey(loadedKey)}
  }catch(cause){if(mounted.current&&scope.current===requestScope)setError(controller.signal.aborted?'The report took too long. Try loading again.':cause instanceof Error?cause.message:'The report is unavailable.')}
  finally{clearTimeout(timer);if(pending.current===controller)pending.current=null;if(mounted.current&&scope.current===requestScope)setBusy(false)}
 }
 return <section className="card" style={{padding:20}} aria-label="Housekeeping productivity"><h2>Completed turnovers</h2><p>Release preview. Daily completions and elapsed cleaning and inspection times.</p><form onSubmit={e=>{e.preventDefault();void load()}}><div className="pilot-form-grid"><label className="field">From<input type="date" required value={start} disabled={busy} onChange={e=>{setStart(e.target.value);setReport(null);setReportKey('')}}/></label><label className="field">Through<input type="date" required value={end} disabled={busy} onChange={e=>{setEnd(e.target.value);setReport(null);setReportKey('')}}/></label></div><button className="primary" disabled={busy}>{busy?'Loading report…':'Load housekeeping report'}</button></form>{error&&<p role="alert">{error}</p>}{report&&reportKey===requestKey&&<><p>Completion dates use {report.time_zone}. Generated {new Date(report.generated_at).toLocaleString()} in your browser time zone.</p><p>On small screens, scroll the table sideways to see every column.</p><div role="region" aria-label="Daily housekeeping results" tabIndex={0} style={{overflowX:'auto'}}><table style={{minWidth:620}}><caption>Daily completed turnover work</caption><thead><tr><th scope="col">Date</th><th scope="col">Completed</th><th scope="col">Average cleaning elapsed</th><th scope="col">Average inspection wait</th></tr></thead><tbody>{report.days.map(d=><tr key={d.report_date}><th scope="row">{d.report_date}</th><td>{d.completed_turnovers}</td><td>{d.average_cleaning_minutes===null?'No timing data':`${d.average_cleaning_minutes.toFixed(2)} min (${d.cleaning_samples} ${d.cleaning_samples===1?'sample':'samples'})`}</td><td>{d.average_inspection_minutes===null?'No timing data':`${d.average_inspection_minutes.toFixed(2)} min (${d.inspection_samples} ${d.inspection_samples===1?'sample':'samples'})`}</td></tr>)}</tbody></table></div></>}<p>Only completed turnover tasks are counted. Cleaning elapsed runs from the latest work start to submission; inspection wait runs from submission to approval. Durations include breaks and delays and are not paid labor hours. Cancelled work and earlier cleaning attempts are excluded. Dates use the property’s current time zone.</p></section>;
}
