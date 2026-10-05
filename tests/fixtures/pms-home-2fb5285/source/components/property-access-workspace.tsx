'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient} from '@/lib/pilot';
import {PropertyStaffAccessPanel} from './property-staff-access-panel';
type Props={tenant:string;property:string;actor:string;role:string};
export function PropertyAccessWorkspace(props:Props){
 if(props.role!=='owner')return null;
 return <VerifiedWorkspace key={`${props.tenant}/${props.property}/${props.actor}`} {...props}/>;
}
function VerifiedWorkspace(props:Props){
 const [verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),pending=useRef(false),generation=useRef(0);
 useEffect(()=>{alive.current=true;const {data}=hotelClient().auth.onAuthStateChange((event,session)=>{
  if(!alive.current||event==='INITIAL_SESSION')return;
  if(session?.user.id!==props.actor){generation.current++;setVerified(false);setError('Sign-in changed. Verify your account again.');}
 });return()=>{alive.current=false;generation.current++;data.subscription.unsubscribe()}},[props.actor]);
 async function open(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');const current=generation.current;let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   await Promise.race([(async()=>{const auth=hotelClient().auth,user=await auth.getUser();if(user.error||user.data.user?.id!==props.actor)throw Error('Sign in again to manage property access.');const session=await auth.getSession();if(session.error||session.data.session?.user.id!==props.actor||!session.data.session.access_token)throw Error('Sign in again to manage property access.');})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Account verification timed out. Please retry.')),20000)})]);
   if(alive.current&&current===generation.current)setVerified(true);
  }catch(e){if(alive.current&&current===generation.current)setError(e instanceof Error?e.message:'Unable to verify account.')}finally{clearTimeout(timer);pending.current=false;if(alive.current)setBusy(false)}
 }
 return verified?<PropertyStaffAccessPanel {...props}/>:<section className="card pilot-settings"><h2>Property access</h2><p>Verify your signed-in owner account to review staff permissions.</p>{error&&<p role="alert">{error}</p>}<button className="secondary" disabled={busy} onClick={()=>void open()}>{busy?'Verifying account…':'Open property access'}</button></section>;
}
