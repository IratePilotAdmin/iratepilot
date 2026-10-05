'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {hotelClient} from '@/lib/pilot';
import {boundedProviderResponse} from '@/lib/bounded-provider-response';
import {AuthPanel} from '@/components/auth-panel';
import {StaffMfaChallenge} from '@/components/staff-mfa-challenge';
const recoveryKey='iratepilot-pms-password-recovery';
function recoveryMarker(value?:string|null){try{if(value===null)sessionStorage.removeItem(recoveryKey);else if(value)sessionStorage.setItem(recoveryKey,value);return sessionStorage.getItem(recoveryKey)}catch{return null}}

/** Presentation gate only. Backend property authorization is always required. */
export function ReleasePreviewGate({children,allowSignIn=false}:{children:ReactNode;allowSignIn?:boolean}){
 const [state,setState]=useState<'checking'|'allowed'|'denied'|'signin'|'recovery'|'mfa'>('checking'),[message,setMessage]=useState(''),[attempt,setAttempt]=useState(0),[signingOut,setSigningOut]=useState(false),[mfaActor,setMfaActor]=useState('');
 useEffect(()=>{
  const client=hotelClient();let alive=true,generation=0,controller:AbortController|null=null,timer:ReturnType<typeof setTimeout>|undefined,verificationTimer:ReturnType<typeof setTimeout>|undefined;
  async function verify(){
   const current=++generation;controller?.abort();clearTimeout(verificationTimer);const requestController=new AbortController();controller=requestController;const signal=requestController.signal;
   setState('checking');setMessage('');
   const timeout=verificationTimer=setTimeout(()=>{requestController.abort();if(alive&&generation===current){generation++;setMessage('Preview verification timed out. Try again.');setState('denied');}},10000);
   try{
    const session=await client.auth.getSession();if(!alive||generation!==current||signal.aborted)return;
    if(session.error)throw Error('Your sign-in could not be checked. Try again.');
    if(!session.data.session?.access_token){if(allowSignIn){recoveryMarker(null);setState('signin');return;}throw Error('Sign in to the PMS, then reopen this preview.');}
    const actor=session.data.session.user.id;
    if(allowSignIn&&recoveryMarker()===actor){setState('recovery');return;}
    const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if(!alive||generation!==current||signal.aborted)return;
    if(assurance.error)throw Error('Two-step verification status could not be checked. Try again.');
    if(!['aal1','aal2'].includes(assurance.data.currentLevel??'')||!['aal1','aal2'].includes(assurance.data.nextLevel??''))throw Error('Your verification status is unavailable. Sign in again.');
    if(assurance.data.nextLevel==='aal2'&&assurance.data.currentLevel!=='aal2'){setMfaActor(actor);setState('mfa');return;}
    const response=await fetch('/api/release-preview',{headers:{Authorization:'Bearer '+session.data.session.access_token},cache:'no-store',redirect:'error',signal});
    if(!alive||generation!==current||signal.aborted)return;
    const result=JSON.parse(await boundedProviderResponse(response,8192));
    if(!alive||generation!==current||signal.aborted)return;
    if(!response.ok)throw Error(response.status===403&&result.error==='Complete two-step verification to open the private preview.'?'Complete two-step verification, then check access again.':response.status===403?'This preview is available only to its designated owner.':response.status===401?'Sign in to the PMS, then reopen this preview.':'Private preview is not available yet.');
    if(result.schema_version!==1||result.verified!==true||result.actor_id!==actor)throw Error('Preview verification did not match your sign-in.');
    const identity=await client.auth.getUser();if(identity.error||identity.data.user?.id!==actor)throw Error('Your sign-in changed. Reopen the preview.');
    if(alive&&generation===current){setState('allowed');}
   }catch(error){if(alive&&generation===current){setMessage(error instanceof Error&&error.name!=='AbortError'?error.message:'Preview verification timed out. Try again.');setState('denied');}}
   finally{clearTimeout(timeout);}
  }
  const {data:listener}=client.auth.onAuthStateChange((event,session)=>{
   if(!alive||event==='INITIAL_SESSION')return;
   generation++;controller?.abort();clearTimeout(verificationTimer);setState('checking');clearTimeout(timer);
   if(event==='SIGNED_OUT'||event==='PASSWORD_RECOVERY'){
    if(allowSignIn){recoveryMarker(event==='PASSWORD_RECOVERY'?session?.user.id:null);setState(event==='PASSWORD_RECOVERY'?'recovery':'signin');return;}
    setMessage('Sign in to the PMS, then reopen this preview.');setState('denied');return;
   }
   timer=setTimeout(()=>void verify(),0);
  });
  void verify();
  return()=>{alive=false;generation++;controller?.abort();clearTimeout(verificationTimer);clearTimeout(timer);listener.subscription.unsubscribe();};
 },[attempt,allowSignIn]);
 if(state==='mfa')return <StaffMfaChallenge key={mfaActor} actor={mfaActor} onVerified={()=>setAttempt(value=>value+1)} onSignOut={()=>{void hotelClient().auth.signOut({scope:'local'}).then(({error})=>{if(error){setMessage('Could not sign out. Try again.');setState('denied');}else{recoveryMarker(null);setAttempt(value=>value+1);}})}}/>;
 if(state==='allowed')return <>{children}</>;
 if(state==='signin'||state==='recovery')return <main className="pilot-onboard"><h1>iRatePilot PMS · Private preview</h1><AuthPanel allowSignUp={false} recovery={state==='recovery'} onRecovered={()=>{recoveryMarker(null);setAttempt(value=>value+1)}} onCancelRecovery={()=>{recoveryMarker(null);setState('signin')}}/></main>;
 return <main className="pilot-onboard"><section className="card"><h1>Private preview</h1>{state==='checking'?<p role="status">Verifying your owner access…</p>:<><p role="alert">{message}</p><button type="button" className="primary" disabled={signingOut} onClick={()=>setAttempt(value=>value+1)}>Check access again</button>{allowSignIn?<button type="button" className="text-button" disabled={signingOut} onClick={async()=>{setSigningOut(true);try{const result=await hotelClient().auth.signOut({scope:'local'});if(result.error)throw result.error;recoveryMarker(null);setState('signin');}catch{setMessage('Could not sign out. Try again.');}finally{setSigningOut(false)}}}>Sign out and use another account</button>:<p><a href="/">Return to PMS sign-in</a></p>}</>}</section></main>;
}

