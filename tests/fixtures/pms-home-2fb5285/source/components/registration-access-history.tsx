'use client';
import {useEffect,useRef,useState} from 'react';
import {registrationStaffRequest} from '../lib/registration-staff-client';
type Props={tenant:string;property:string;actor:string;registrationId:string;accessToken:string;role:string};
type Entry={id:string;actor:string;accessedAt:number};
type Cursor={at:number;id:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function RegistrationAccessHistory(props:Props){
 if(!['owner','manager'].includes(props.role))return null;
 return <History key={[props.tenant,props.property,props.actor,props.registrationId,props.role].join('/')} {...props}/>;
}
function History(props:Props){
 const [rows,setRows]=useState<Entry[]>([]),[next,setNext]=useState<Cursor|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),pending=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function load(after:Cursor|null){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');
  if(!after){setRows([]);setNext(null);setLoaded(false)}
  try{
   const raw=await registrationStaffRequest(props,{action:'access_history',registrationId:props.registrationId,after});
   if(!alive.current)return;
   const page=raw as {tenant:string;property:string;registrationId:string;records:Entry[];next:Cursor|null};
   if(!page||page.tenant!==props.tenant||page.property!==props.property||page.registrationId!==props.registrationId||!Array.isArray(page.records)||page.records.length>50)throw Error('Access history does not match this registration.');
   let previous=after;
   for(const row of page.records){
    if(!row||!uuid(row.id)||!uuid(row.actor)||!Number.isSafeInteger(row.accessedAt)||row.accessedAt<=0||row.accessedAt>8640000000000000||previous&&(row.accessedAt<previous.at||row.accessedAt===previous.at&&row.id<=previous.id))throw Error('Access history could not be verified.');
    previous={at:row.accessedAt,id:row.id};
   }
   if(page.next!==null&&(!previous||page.records.length!==50||page.next?.at!==previous.at||page.next?.id!==previous.id))throw Error('Access history page could not be verified.');
   setRows(current=>after?[...current,...page.records]:page.records);setNext(page.next);setLoaded(true);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Access history unavailable.')}
  finally{pending.current=false;if(alive.current)setBusy(false)}
 }
 return <section aria-label="Registration access history"><h3>Who viewed this registration</h3><p>Staff account IDs and access times, oldest first.</p>
  <button type="button" disabled={busy} onClick={()=>void load(null)}>{busy?'Loading access history...':loaded?'Refresh access history':'Load access history'}</button>
  {error&&<p role="alert">{error}</p>}{loaded&&rows.length===0&&<p>No recorded access.</p>}
  <ul>{rows.map(row=><li key={row.id}><span style={{overflowWrap:'anywhere'}}>Staff {row.actor}</span> — <time dateTime={new Date(row.accessedAt).toISOString()}>{new Date(row.accessedAt).toLocaleString()}</time></li>)}</ul>
  {next&&<button type="button" disabled={busy} onClick={()=>void load(next)}>Load more access history</button>}
 </section>;
}
