'use client';
import {useEffect,useRef,useState} from 'react';
import {registrationStaffRequest} from '@/lib/registration-staff-client';
import {verifyRegistrationDocument} from '@/lib/registration-document';
import {readRegistrationCard,registrationCardHash} from '@/lib/registration-card';
import {readRegistrationSignature} from '@/lib/registration-signature';
import type {reviewRegistration} from '@/lib/registration-review';
type Detail=Awaited<ReturnType<typeof reviewRegistration>>;
type Props={tenant:string;property:string;actor:string;reservation:string;registrationId:string;accessToken:string};
export function RegistrationDetail(props:Props){return <DetailView key={[props.tenant,props.property,props.actor,props.reservation,props.registrationId].join('/')} {...props}/>}
function DetailView(props:Props){
 const [record,setRecord]=useState<Detail|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [guestLink,setGuestLink]=useState('');
 const active=useRef(true),pending=useRef(false),revokeReason=useRef<string|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 async function load(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');setRecord(null);setGuestLink('');
  try{
   const raw=await registrationStaffRequest(props,{action:'review',registrationId:props.registrationId});
   if(!raw||typeof raw!=='object')throw Error('Registration could not be verified.');
   const r=raw as Detail;
   if(r.registrationId!==props.registrationId||r.reservation!==props.reservation||![r.issuedAt,r.expiresAt].every(v=>Number.isSafeInteger(v)&&v>0)||r.expiresAt<=r.issuedAt||!(r.revokedAt===null||(Number.isSafeInteger(r.revokedAt)&&r.revokedAt>=r.issuedAt)))throw Error('Registration does not match this reservation.');
   const document=await verifyRegistrationDocument(r.document,r.documentHash);
   if((r.card===null)!==(r.cardHash===null))throw Error('Electronic registration card could not be verified.');
   if(r.card!==null){r.card=readRegistrationCard(r.card);if(await registrationCardHash(r.card)!==r.cardHash)throw Error('Electronic registration card could not be verified.')}
   if(r.receipt!==null){
    if(!r.receipt||!Number.isSafeInteger(r.receipt.signedAt)||r.receipt.signedAt<r.issuedAt||r.receipt.signedAt>=r.expiresAt||r.receipt.documentHash!==r.documentHash||r.receipt.cardHash!==(r.cardHash??undefined))throw Error('Signature receipt could not be verified.');
    const {signedAt,...signature}=r.receipt;r.receipt={...readRegistrationSignature(signature),signedAt};
   }
   if(r.revocationReason!==null&&(typeof r.revocationReason!=='string'||r.revocationReason.length>500))throw Error('Revocation record could not be verified.');
   if(active.current)setRecord({...r,document});
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Registration unavailable.')}
  finally{pending.current=false;if(active.current)setBusy(false)}
 }
 async function recoverLink(){
  if(!record||pending.current||record.issuedBy!==props.actor||record.revokedAt!==null||record.receipt||record.expiresAt<=Date.now())return;
  pending.current=true;setBusy(true);setError('');setGuestLink('');
  try{
   const raw=await registrationStaffRequest(props,{action:'issue',requestId:props.registrationId,reservation:props.reservation,documentHash:record.documentHash});
   const result=raw as {registrationId:string;documentHash:string;cardHash:string;token:string;expiresAt:number};
   if(!result||result.registrationId!==props.registrationId||result.documentHash!==record.documentHash||result.cardHash!==record.cardHash||result.expiresAt!==record.expiresAt||result.expiresAt<=Date.now()||typeof result.token!=='string'||!/^[a-f0-9]{64}$/.test(result.token))throw Error('The existing link could not be verified. Refresh this registration.');
   const link=new URL('/registration',window.location.origin);link.hash='token='+result.token;
   if(active.current)setGuestLink(link.toString());
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Link recovery unavailable.')}
  finally{pending.current=false;if(active.current)setBusy(false)}
 }
 async function revoke(){
  if(!record||pending.current||record.revokedAt!==null)return;
  const text=revokeReason.current??reason.trim();if(!text||text.length>500){setError('Enter a reason up to 500 characters.');return}
  revokeReason.current=text;setGuestLink('');pending.current=true;setBusy(true);setError('');
  try{
   const raw=await registrationStaffRequest(props,{action:'revoke',registrationId:props.registrationId,reason:text});
   if(!raw||typeof raw!=='object')throw Error('Revocation could not be confirmed. Retry.');
   const r=raw as {registrationId:string;revoked:boolean;revokedAt:number;revokedBy:string;reason:string};
   if(r.registrationId!==props.registrationId||r.revoked!==true||!Number.isSafeInteger(r.revokedAt)||r.revokedAt<record.issuedAt||typeof r.revokedBy!=='string'||!r.revokedBy||typeof r.reason!=='string'||!r.reason||r.reason.length>500)throw Error('Revocation could not be confirmed. Retry.');
   if(active.current)setRecord({...record,revokedAt:r.revokedAt,revokedBy:r.revokedBy,revocationReason:r.reason});
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Revocation unavailable.')}
  finally{pending.current=false;if(active.current)setBusy(false)}
 }
 return <section className="card" aria-label="Registration details"><h2>Registration details</h2><button disabled={busy} onClick={()=>void load()}>{busy?'Please wait…':record?'Refresh registration':'Load registration details'}</button>
  {error&&<p role="alert">{error}</p>}{record&&<>{record.card&&<section aria-label="Electronic registration card"><h3>Stay details on signed card</h3><dl><dt>Guest</dt><dd>{record.card.guestName}</dd><dt>Arrival</dt><dd>{record.card.arrival}</dd><dt>Departure</dt><dd>{record.card.departure}</dd><dt>Room type</dt><dd>{record.card.roomType}</dd><dt>Guests</dt><dd>{record.card.guests}</dd></dl></section>}<h3>{record.document.title}</h3><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{record.document.body}</div>
   {record.receipt?<><p>Signed by {record.receipt.signerName} on {new Date(record.receipt.signedAt).toLocaleString()}</p>{record.receipt.method==='typed'?<p>Typed electronic signature: {record.receipt.signerName}</p>:<svg role="img" aria-label="Saved guest signature" viewBox="0 0 10000 10000" preserveAspectRatio="none" style={{width:'100%',height:'auto',aspectRatio:'2 / 1'}}>{record.receipt.strokes.map((stroke,i)=><polyline key={i} points={stroke.map(p=>p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</svg>}</>:<p>No signature saved.</p>}
   {record.issuedBy===props.actor&&record.revokedAt===null&&!record.receipt&&record.expiresAt>Date.now()&&<button type="button" disabled={busy} onClick={()=>void recoverLink()}>Recover existing guest link</button>}
   {guestLink&&<label className="field">Existing guest registration link<input readOnly value={guestLink}/></label>}
   {record.revokedAt!==null?<p role="status">Guest link revoked. {record.revocationReason}</p>:<form onSubmit={e=>{e.preventDefault();void revoke()}}><p>Revoking the link prevents guest access. Any saved signature remains in the registration record.</p><label className="field">Reason for revoking<input required maxLength={500} value={reason} disabled={busy||revokeReason.current!==null} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy} type="submit">{revokeReason.current?'Retry revoking link':'Revoke guest link'}</button></form>}
  </>}
 </section>;
}
