'use client';
import {useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {hotelClient,formText} from '@/lib/pilot';

export function AuthPanel({recovery,onRecovered,onCancelRecovery,allowSignUp=true}:{recovery:boolean;onRecovered:()=>void;onCancelRecovery:()=>void;allowSignUp?:boolean}){
 const [mode,setMode]=useState<'login'|'signup'|'reset'>('login'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [showPassword,setShowPassword]=useState(false);
 const title=recovery?'Choose a new password':mode==='login'?'Welcome back':mode==='signup'?'Create your staff account':'Reset your password';
 async function submit(form:FormData){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   if(mode==='signup'&&!allowSignUp)throw Error('Account registration is not available here.');
   const client=hotelClient(),email=formText(form,'email').trim(),password=formText(form,'password');
   if(recovery){
    if(password!==formText(form,'confirmation'))throw Error('The two passwords must match.');
    const {error}=await client.auth.updateUser({password});if(error)throw error;
    onRecovered();return;
   }
   if(mode==='reset'){
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/'});if(error)throw error;
    setNotice('If an account can receive email at this address, you’ll receive a password reset link.');return;
   }
   const credentials={email,password};
   const result=mode==='login'?await client.auth.signInWithPassword(credentials):await client.auth.signUp({...credentials,options:{emailRedirectTo:window.location.origin+'/'}});
   if(result.error)throw result.error;
   setNotice(mode==='signup'&&!result.data.session?'Check your email to confirm your account, then return here to sign in.':'Signed in. Opening your hotel workspace…');
  }catch(e){setError(e instanceof Error?e.message:'Unable to complete authentication.')}finally{setBusy(false)}
 }
 function change(next:'login'|'signup'|'reset'){setMode(next);setError('');setNotice('');setShowPassword(false)}
 return <section className="pilot-login"><h2>{title}</h2><p>{recovery?'Save a new password for this account.':mode==='login'?'Sign in to your hotel workspace.':mode==='signup'?'Confirm your email before setting up a property.':'Enter the email address for your staff account.'}</p>
  {error&&<div className="pilot-error" role="alert">{error}</div>}{notice&&<output className="pilot-notice">{notice}</output>}
  <form onSubmit={e=>{e.preventDefault();void submit(new FormData(e.currentTarget))}}>
   {!recovery&&<label className="field">Work email<input name="email" type="email" autoComplete="email" required disabled={busy}/></label>}
   {(recovery||mode!=='reset')&&<><label className="field">{recovery?'New password':'Password'}<input name="password" type={!recovery&&mode==='login'&&showPassword?'text':'password'} autoComplete={!recovery&&mode==='login'?'current-password':'new-password'} required minLength={!recovery&&mode==='login'?undefined:8} disabled={busy}/></label>{!recovery&&mode==='login'&&<button type="button" className="text-button" aria-label="Show password" aria-pressed={showPassword} disabled={busy} onClick={()=>setShowPassword(value=>!value)}>{showPassword?'Hide password':'Show password'}</button>}</>}
   {recovery&&<label className="field">Confirm new password<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} disabled={busy}/></label>}
   <button className="primary full" disabled={busy}>{busy?'Please wait…':recovery?'Save password':mode==='login'?'Sign in':mode==='signup'?'Create account':'Send reset link'}<ArrowRight size={17}/></button>
  </form>
  {recovery&&<button className="text-button" disabled={busy} onClick={()=>{void hotelClient().auth.signOut().then(({error})=>{if(error)setError(error.message);else onCancelRecovery()})}}>Return to sign in</button>}
  {!recovery&&<>{(allowSignUp||mode!=='login')&&<button className="text-button" disabled={busy} onClick={()=>change(mode==='login'?'signup':'login')}>{mode==='login'?'New to iRatePilot PMS? Create an account':'Return to sign in'}</button>}{mode==='login'&&<button className="text-button" disabled={busy} onClick={()=>change('reset')}>Forgot password?</button>}</>}
 </section>;
}
