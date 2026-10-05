'use client';
import {useEffect,useRef,useState} from 'react';
import {billingFromGuest,guestFields,isIdentityField,type BillingData,type GuestData} from '@/lib/guests';
import {hotelClient,hotelRpc} from '@/lib/pilot';

// A late read must never overwrite fields after the user retries or enters them manually.
async function recipientResponse<T>(request:PromiseLike<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Loading saved details took too long. Try again or enter the recipient manually.')),15000)})])}
 finally{clearTimeout(timer)}
}

type Props={tenant:string;property:string;reservation:string;actor:string;disabled:boolean;getEditVersion:()=>number;onCopy:(data:BillingData)=>void};
export function InvoiceRecipientCopy({tenant,property,reservation,actor,disabled,getEditVersion,onCopy}:Props){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function copy(mode:'guest'|'billing'){
  if(disabled||lock.current)return;
  lock.current=true;setBusy(true);setError('');const version=getEditVersion();
  try{
   const before=await recipientResponse(hotelClient().auth.getUser());
   if(before.error||before.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');
   if(!alive.current)return;
   const value=await recipientResponse(hotelRpc<unknown>('reservation_guest',{p_tenant:tenant,p_property:property,p_reservation:reservation}));
   const after=await recipientResponse(hotelClient().auth.getUser());
   if(after.error||after.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');
   if(!alive.current)return;
   if(!value||typeof value!=='object'||!('reservation_id' in value)||value.reservation_id!==reservation)throw Error('Guest details do not match this stay.');
   const row=value as Record<string,unknown>,source=mode==='guest'?row.contact:row.billing_party;
   if(!source||typeof source!=='object'||Array.isArray(source))throw Error('No saved details are available. Enter the recipient below.');
   const clean:Partial<GuestData>={};
   for(const [key,,max] of guestFields){
    if(isIdentityField(key))continue;
    const v=(source as Record<string,unknown>)[key];
    if(v!=null&&(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v)))throw Error('Saved guest details need review.');
    clean[key]=typeof v==='string'?v:null;
   }
   if(mode==='guest'&&!clean.legal_name&&!clean.display_name&&typeof row.reservation_name==='string')clean.display_name=row.reservation_name;
   const billing=billingFromGuest(clean);
   if(!Object.values(billing).some(Boolean))throw Error('No saved details are available. Enter the recipient below.');
   if(getEditVersion()!==version)throw Error('Details changed while loading. Select the copy option again to replace them.');
   onCopy(billing);
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Unable to load saved details.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <div><button type="button" disabled={disabled||busy} onClick={()=>void copy('guest')}>Same as guest</button><button type="button" disabled={disabled||busy} onClick={()=>void copy('billing')}>Use saved billing details</button>{busy&&<p role="status">Loading saved details…</p>}{error&&<p role="alert">{error}</p>}</div>;
}
