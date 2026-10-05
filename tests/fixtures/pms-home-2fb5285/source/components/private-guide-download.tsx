'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient} from '@/lib/pilot';
export function PrivateGuideDownload(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const control=useRef<{controller:AbortController;timer:ReturnType<typeof setTimeout>}|null>(null);
 useEffect(()=>{
  const {data:{subscription}}=hotelClient().auth.onAuthStateChange(event=>{
   if(event==='INITIAL_SESSION'||!control.current)return;
   control.current.controller.abort();clearTimeout(control.current.timer);control.current=null;setBusy(false);setError('Your sign-in changed. Start the download again.');
  });
  return()=>{subscription.unsubscribe();control.current?.controller.abort();clearTimeout(control.current?.timer);control.current=null;};
 },[]);
 async function download(){
  if(control.current)return;
  setBusy(true);setError('');const controller=new AbortController();
  const current={controller,timer:setTimeout(()=>{if(control.current!==current)return;controller.abort();control.current=null;setBusy(false);setError('The download timed out. Try again.');},30000)};control.current=current;
  const active=()=>control.current===current&&!controller.signal.aborted;
  try{
   const client=hotelClient(),session=await client.auth.getSession();if(!active())return;
   if(session.error||!session.data.session)throw Error('Sign in before downloading the guide.');
   const actor=session.data.session.user.id;
   const response=await fetch('/api/operating-guide',{headers:{Authorization:'Bearer '+session.data.session.access_token},signal:controller.signal,cache:'no-store',redirect:'error'});
   if(!active())return;
   if(!response.ok){await response.body?.cancel();throw Error(response.status===403?'This guide is available only to the preview owner.':'The guide could not be downloaded. Try again.');}
   if(response.headers.get('content-type')?.split(';')[0]!=='application/pdf'||!response.body){await response.body?.cancel();throw Error('The server did not return a PDF guide.');}
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
   try{while(true){const chunk=await reader.read();if(!active())return;if(chunk.done)break;length+=chunk.value.byteLength;if(length>2_000_000)throw Error('The guide exceeds the download limit.');chunks.push(chunk.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('The guide is not a valid PDF.');
   const verified=await client.auth.getUser();if(!active())return;
   if(verified.error||verified.data.user?.id!==actor)throw Error('Your sign-in changed. Start the download again.');
   const objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=document.createElement('a');
   try{link.href=objectUrl;link.download='iRatePilot-operating-guide-2026-09-26.pdf';document.body.appendChild(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}
  }catch(reason){if(active())setError(reason instanceof Error?reason.message:'The guide could not be downloaded.');}
  finally{clearTimeout(current.timer);if(control.current===current){control.current=null;setBusy(false);}}
 }
 return <><button type="button" className="secondary" disabled={busy} onClick={()=>void download()}>{busy?'Preparing PDF…':'Download printable operating guide PDF'}</button>{error&&<p role="alert">{error}</p>}</>;
}
