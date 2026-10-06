'use client';
import {useEffect,useRef,useState} from 'react';
import {registrationStaffRequest} from '@/lib/registration-staff-client';
type Row={registrationId:string;documentHash:string;title:string;issuedAt:number;expiresAt:number;revokedAt:number|null;signedAt:number|null};
type Props={tenant:string;property:string;actor:string;reservation:string;accessToken:string;onReview:(id:string)=>void};
export function ReservationRegistrationHistory(props:Props){return <History key={[props.tenant,props.property,props.actor,props.reservation].join('/')} {...props}/>}
function History(props:Props){
 const [rows,setRows]=useState<Row[]>([]),[next,setNext]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const active=useRef(true),pending=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 async function load(reset=false){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');
  const after=reset?null:next;
  try{
   const raw=await registrationStaffRequest(props,{action:'history',reservation:props.reservation,after});
   if(!raw||typeof raw!=='object')throw Error('Registration history could not be verified.');
   const page=raw as {tenant:string;property:string;reservation:string;records:Row[];next:string|null};
   if(page.tenant!==props.tenant||page.property!==props.property||page.reservation!==props.reservation||!Array.isArray(page.records)||page.records.length>50)throw Error('Registration history does not match this reservation.');
   let previous=after??'';
   for(const row of page.records){
    if(!row||typeof row.registrationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(row.registrationId)||row.registrationId<=previous||typeof row.title!=='string'||!row.title||row.title.length>200||typeof row.documentHash!=='string'||!/^[a-f0-9]{64}$/.test(row.documentHash)||![row.issuedAt,row.expiresAt].every(v=>Number.isSafeInteger(v)&&v>0)||row.expiresAt<=row.issuedAt||![row.revokedAt,row.signedAt].every(v=>v===null||(Number.isSafeInteger(v)&&v>=row.issuedAt)))throw Error('Registration history could not be verified.');
    previous=row.registrationId;
   }
   if(page.next!==null&&(page.records.length!==50||page.next!==previous))throw Error('Registration history page could not be verified.');
   if(active.current){setRows(old=>reset?page.records:[...old,...page.records]);setNext(page.next);setLoaded(true)}
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Registration history unavailable.')}
  finally{pending.current=false;if(active.current)setBusy(false)}
 }
 return <section className="card" aria-label="Registration history"><h2>Registration history</h2><button disabled={busy} onClick={()=>void load(true)}>{busy?'Loading history…':loaded?'Refresh registration history':'Load registration history'}</button>
  {error&&<p role="alert">{error}</p>}{loaded&&!rows.length&&<p>No registration requests found for this reservation.</p>}
  {rows.map(row=><article key={row.registrationId}><h3>{row.title}</h3><p>{row.signedAt!==null?'Signed':'Not signed'} · {row.revokedAt!==null?'Link revoked':row.expiresAt<=Date.now()?'Link expired':'Link active'}</p><p>Issued {new Date(row.issuedAt).toLocaleString()}</p><button disabled={busy} onClick={()=>props.onReview(row.registrationId)}>Review registration</button></article>)}
  {next&&<button disabled={busy} onClick={()=>void load()}>Load more registrations</button>}
 </section>;
}
