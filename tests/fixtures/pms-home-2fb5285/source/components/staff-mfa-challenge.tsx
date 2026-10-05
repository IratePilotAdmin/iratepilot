'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient} from '@/lib/pilot';

/** Sign-in challenge only; backend authorization must independently enforce AAL. */
export function StaffMfaChallenge({actor,onVerified,onSignOut}:{actor:string;onVerified:()=>void;onSignOut:()=>void}){
 const [code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[choices,setChoices]=useState<{id:string;name:string}[]>([]),[selected,setSelected]=useState('');
 const alive=useRef(true),pending=useRef(false),generation=useRef(0),timeout=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;clearTimeout(timeout.current);}},[]);
 async function verify(){
  if(pending.current)return;
  pending.current=true;setBusy(true);setError('');
  const currentAttempt=++generation.current;
  const active=()=>alive.current&&generation.current===currentAttempt;
  timeout.current=setTimeout(()=>{if(!active())return;generation.current++;pending.current=false;setBusy(false);setError('Verification timed out. Check your connection and try a current code, or return to sign in.');},15000);
  const submitted=code;setCode('');
  try{
   if(!/^\d{6}$/.test(submitted))throw Error('Enter the six-digit code from your authenticator app.');
   const auth=hotelClient().auth;
   const identity=await auth.getUser();
   if(!active())return;
   if(identity.error||identity.data.user?.id!==actor)throw Error('Your sign-in changed. Return to sign in.');
   const factors=await auth.mfa.listFactors();
   if(!active())return;
   if(factors.error)throw Error('Could not load your verification methods. Try again.');
   const available=factors.data.totp.filter(item=>item.status==='verified');
   if(available.length>1&&!selected){setChoices(available.map((item,index)=>({id:item.id,name:item.friendly_name||`Authenticator ${index+1}`})));throw Error('Choose your authenticator, then enter its current code.');}
   const factor=available.find(item=>selected?item.id===selected:true);
   if(!factor)throw Error('No verified authenticator app is available. Contact your account administrator.');
   const result=await auth.mfa.challengeAndVerify({factorId:factor.id,code:submitted});
   if(!active())return;
   if(result.error)throw Error('Verification did not complete. Use a current code and try again.');
   const current=await auth.getUser();
   if(!active())return;
   const assurance=await auth.mfa.getAuthenticatorAssuranceLevel();
   if(!active())return;
   if(current.error||current.data.user?.id!==actor||assurance.error||assurance.data.currentLevel!=='aal2')throw Error('Your verification could not be confirmed. Return to sign in.');
   onVerified();
  }catch(cause){if(active())setError(cause instanceof Error?cause.message:'Verification failed. Try again.');}
  finally{if(active()){clearTimeout(timeout.current);pending.current=false;setBusy(false);}}
 }
 return <main className="pilot-onboard"><section className="pilot-login"><h1>Two-step verification</h1><p>Enter the code from your authenticator app to continue.</p>
 {error&&<p className="pilot-error" role="alert">{error}</p>}
 <form onSubmit={event=>{event.preventDefault();void verify();}}>{choices.length>1&&<label className="field">Authenticator<select value={selected} onChange={event=>setSelected(event.target.value)} required disabled={busy}><option value="">Choose an authenticator</option>{choices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label className="field">Verification code<input value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy}/></label><button className="primary full" disabled={busy}>{busy?'Verifying…':'Verify and continue'}</button></form>
 <button className="text-button" onClick={onSignOut}>Return to sign in</button>
 </section></main>;
}

