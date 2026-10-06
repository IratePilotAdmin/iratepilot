'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient} from '@/lib/pilot';
type Row={purpose:'manual'|'property';id:string;created_at:number;status:string;total_tokens:number|null};
export function ManualAiUsage({actor,tenant,property}:{actor:string;tenant:string;property:string}){
 const [rows,setRows]=useState<Row[]|null>(null),[next,setNext]=useState<{before:number;beforeId:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const live=useRef(false),pending=useRef<AbortController|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;pending.current?.abort()}},[]);
 async function load(older=false){
  if(pending.current)return;
  const controller=new AbortController();pending.current=controller;setBusy(true);setRows(null);setError('');
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
   const client=hotelClient(),user=await client.auth.getUser(),session=await client.auth.getSession();
   if(user.error||user.data.user?.id!==actor||session.error||session.data.session?.user.id!==actor)throw Error('Sign in again before reviewing usage.');
   if(!live.current||controller.signal.aborted)return;
   const response=await fetch('/api/manual-help?'+new URLSearchParams({tenant,property,...(older&&next?{before:String(next.before),beforeId:next.beforeId}:{})}),{headers:{Authorization:'Bearer '+session.data.session.access_token},signal:controller.signal});
   const raw:unknown=await response.json();
   if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Usage could not be verified.');
   const result=raw as Record<string,unknown>;
   if(!response.ok)throw Error('Usage is unavailable. Current owner or manager access is required.');
   if(result.scope!=='property'||result.tenant!==tenant||result.property!==property||typeof result.hasMore!=='boolean'||!Array.isArray(result.requests)||result.requests.length>100||!result.requests.every((r:Row)=>r&&['manual','property'].includes(r.purpose)&&typeof r.id==='string'&&Number.isSafeInteger(r.created_at)&&r.created_at>=0&&r.created_at<=8640000000000000&&['pending','completed','failed'].includes(r.status)&&(r.total_tokens===null||(Number.isSafeInteger(r.total_tokens)&&r.total_tokens>=0))))throw Error('Usage could not be verified.');
   if(result.hasMore&&(!result.next||typeof result.next!=='object'||typeof (result.next as {beforeId?:unknown}).beforeId!=='string'||!Number.isSafeInteger((result.next as {before?:unknown}).before)))throw Error('History position could not be verified.');
   const again=await client.auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this property.');
   if(live.current&&!controller.signal.aborted){setRows(result.requests);setNext(result.hasMore?result.next as {before:number;beforeId:string}:null)}
  }catch(cause){if(live.current)setError(controller.signal.aborted?'Usage took too long to load. Try again.':cause instanceof Error?cause.message:'Usage is unavailable.')}
  finally{clearTimeout(timer);pending.current=null;if(live.current)setBusy(false)}
 }
 return <section className="card manual-ai-usage" aria-label="AI usage history"><h2>AI usage history</h2><p>Review requests for this property, 100 at a time. Dates use your browser time zone. Token counts measure AI usage, not a payment amount. Unknown usage may still incur a provider charge.</p><button className="secondary" disabled={busy} onClick={()=>void load()}>{busy?'Loading usage…':'Refresh usage'}</button>{error&&<p role="alert">{error}</p>}{rows&&<>{!rows.length&&<p>No AI requests recorded for this property.</p>}{rows.map(row=><div className="pilot-list-row" key={row.id}><span>{new Date(row.created_at).toLocaleString()}</span><span>{row.purpose==='property'?'Current property':'Operating instructions'}</span><span>{row.status==='pending'?'Outcome not confirmed':row.status==='completed'?'Completed':'Failed'}</span><span>{row.total_tokens===null?'Usage unknown':row.total_tokens.toLocaleString()+' tokens'}</span></div>)}{next&&<button className="secondary" disabled={busy} onClick={()=>void load(true)}>Older requests</button>}</>}</section>;
}
