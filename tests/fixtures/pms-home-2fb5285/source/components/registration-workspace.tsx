'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient} from '@/lib/pilot';
import {PropertyRegistrationDocuments} from './registration-document-editor';
import {ReservationRegistrationPanel} from './reservation-registration-panel';
type Props={tenant:string;property:string;actor:string;role:string;reservation?:string};
export function RegistrationWorkspace(props:Props){return <Workspace key={[props.tenant,props.property,props.actor,props.role,props.reservation??'documents'].join('/')} {...props}/>}
function Workspace(props:Props){
 const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const alive=useRef(true),pending=useRef(false),generation=useRef(0);
 useEffect(()=>{alive.current=true;const {data}=hotelClient().auth.onAuthStateChange((_event,session)=>{if(!alive.current)return;if(_event==='INITIAL_SESSION')return;if(session?.user.id===props.actor){setToken(current=>current?session.access_token:'');return}generation.current++;setToken('');setError('Sign-in changed. Open registration again.')});return()=>{alive.current=false;data.subscription.unsubscribe()}},[]);
 async function open(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');const current=generation.current;let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const access=await Promise.race([(async()=>{const client=hotelClient(),user=await client.auth.getUser();if(user.error||user.data.user?.id!==props.actor)throw Error('Sign in again to open registration.');const session=await client.auth.getSession();if(session.error||session.data.session?.user.id!==props.actor||!session.data.session.access_token)throw Error('Sign in again to open registration.');return session.data.session.access_token})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Sign-in verification timed out. Please retry.')),20000)})]);
   if(alive.current&&current===generation.current)setToken(access);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Registration unavailable.')}
  finally{clearTimeout(timer);pending.current=false;if(alive.current)setBusy(false)}
 }
 if(!['owner','manager','staff'].includes(props.role)||!props.reservation&&!['owner','manager'].includes(props.role))return null;
 return <section className="card"><h2>{props.reservation?'Digital registration':'Registration documents'}</h2>
  {!token&&<><p>Registration requires an activated connection for this property.</p><button type="button" disabled={busy} onClick={()=>void open()}>{busy?'Verifying sign-in...':'Open registration controls'}</button></>}
  {error&&<p role="alert">{error}</p>}
  {token&&(props.reservation?<ReservationRegistrationPanel {...props} reservation={props.reservation} accessToken={token}/>:<PropertyRegistrationDocuments {...props} accessToken={token}/>)}
 </section>;
}
