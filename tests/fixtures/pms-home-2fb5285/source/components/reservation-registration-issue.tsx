'use client';
import {useEffect,useRef,useState} from 'react';
import {RegistrationDocumentPicker} from './registration-document-picker';
import {registrationStaffRequest} from '@/lib/registration-staff-client';
type Props={tenant:string;property:string;actor:string;reservation:string;accessToken:string};
type Issued={registrationId:string;documentHash:string;token:string;expiresAt:number};
export function ReservationRegistrationIssue(props:Props){return <Issue key={[props.tenant,props.property,props.actor,props.reservation].join('/')} {...props}/>}
function Issue(props:Props){
 const [document,setDocument]=useState<{documentHash:string;title:string}|null>(null),[issued,setIssued]=useState<Issued|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef<{requestId:string;reservation:string;documentHash:string}|null>(null),sending=useRef(false),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 async function issue(){
  if(!document||sending.current||issued)return;
  const input=pending.current??{requestId:crypto.randomUUID(),reservation:props.reservation,documentHash:document.documentHash};pending.current=input;
  sending.current=true;setBusy(true);setError('');
  try{
   const raw=await registrationStaffRequest(props,{action:'issue',...input});
   if(!raw||typeof raw!=='object')throw Error('Registration link could not be verified. Retry the same request.');
   const r=raw as Issued;
   if(r.registrationId!==input.requestId||r.documentHash!==input.documentHash||typeof r.token!=='string'||!/^[a-f0-9]{64}$/.test(r.token)||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=Date.now())throw Error('Registration link could not be verified or has expired. Review the registration status.');
   if(active.current)setIssued(r);
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Registration link could not be created.')}
  finally{sending.current=false;if(active.current)setBusy(false)}
 }
 return <section className="card" aria-label="Create guest registration"><h2>Guest registration</h2>
  {!document?<RegistrationDocumentPicker tenant={props.tenant} property={props.property} actor={props.actor} list={after=>registrationStaffRequest(props,{action:'documents',after})} onChoose={setDocument}/>:<>
   <p>Selected document: <strong>{document.title}</strong></p>
   {issued?<><p role="status">Registration link created. Share it only with this reservation’s guest.</p><label className="field">Guest registration link<input readOnly value={new URL('/registration#token='+issued.token,window.location.origin).href} onFocus={e=>e.currentTarget.select()}/></label><p>Expires {new Date(issued.expiresAt).toLocaleString()}.</p></>:<><button className="primary" disabled={busy} onClick={()=>void issue()}>{busy?'Creating link…':pending.current?'Retry same link request':'Create registration link'}</button>{!pending.current&&<button onClick={()=>setDocument(null)}>Choose another document</button>}</>}
  </>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
