'use client';
import {useEffect,useRef,useState} from 'react';
import {readPropertyAnswer,type PropertyAnswer} from '@/lib/property-answer';
import {hotelClient} from '@/lib/pilot';
import {operatingManual,manualRevision} from '@/lib/operating-manual';

type Answer={answer:string;topicIds:string[];needsStaffReview:boolean;revision:string};
export function ManualAiHelp({actor,tenant,property}:{actor:string;tenant:string;property:string}){
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState<Answer|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [mode,setMode]=useState<'manual'|'property'>('manual'),[propertyAnswer,setPropertyAnswer]=useState<PropertyAnswer|null>(null);
 const [lastRequest,setLastRequest]=useState(''),[requestStatus,setRequestStatus]=useState('');
 const requestKey='irp-manual-ai-last:'+actor+':'+tenant+':'+property;
 useEffect(()=>{try{const value=sessionStorage.getItem(requestKey);if(value&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))setLastRequest(value)}catch{/* Status recovery is optional when browser storage is unavailable. */}},[requestKey]);
 const alive=useRef(false),lock=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort()}},[]);
 async function ask(){
  if(lock.current)return;
  const value=question.trim();if(value.length<3||value.length>1000){setError('Enter a question of 3–1,000 characters.');return;}
  lock.current=true;setBusy(true);setError('');setAnswer(null);setPropertyAnswer(null);
  const abort=new AbortController();controller.current=abort;
  const timeout=setTimeout(()=>abort.abort(),40000);
  try{
   const client=hotelClient(),user=await client.auth.getUser();
   if(user.error||user.data.user?.id!==actor)throw Error('Sign-in changed. Reopen Help & manual after signing in.');
   const session=await client.auth.getSession();
   if(session.error||session.data.session?.user.id!==actor||!session.data.session.access_token)throw Error('Sign in again to use AI help.');
   if(!alive.current||abort.signal.aborted)return;
   const requestId=crypto.randomUUID();
   setLastRequest(requestId);setRequestStatus('');try{sessionStorage.setItem(requestKey,requestId)}catch{/* The current screen still retains the reference. */}
   const response=await fetch('/api/manual-help',{method:'POST',headers:{Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({tenant,property,requestId,question:value,mode}),signal:abort.signal});
   const raw:unknown=await response.json();
   if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('AI help returned an unreadable response. Use the written guide.');
   const result=raw as Record<string,unknown>;
   if(!response.ok)throw Error(typeof result?.error==='string'&&result.error.length<500?result.error:'AI help is unavailable. Use the written guide.');
   if(mode==='property'){
    const answer=readPropertyAnswer(result,{tenant,property,requestId});
    const again=await client.auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. The answer was discarded.');
    if(abort.signal.aborted)throw Error('The answer timed out.');
    if(alive.current)setPropertyAnswer(answer);return;
   }
   const allowed=new Set(operatingManual.filter(a=>a.availability==='Pilot workflow').map(a=>a.id));
   if(result?.requestId!==requestId||result.scope!=='manual-only'||result.revision!==manualRevision||typeof result.answer!=='string'||!result.answer.trim()||result.answer.length>6000||typeof result.needsStaffReview!=='boolean'||!Array.isArray(result.topicIds)||result.topicIds.length>8||!result.topicIds.every((id:unknown)=>typeof id==='string'&&allowed.has(id))||new Set(result.topicIds).size!==result.topicIds.length)throw Error('The AI answer could not be matched to this guide. Use the written instructions.');
   const again=await client.auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. The answer was discarded.');
   if(abort.signal.aborted)throw Error('The answer timed out.');
   if(alive.current)setAnswer({answer:result.answer,topicIds:result.topicIds as string[],needsStaffReview:result.needsStaffReview,revision:result.revision});
  }catch(cause){if(alive.current)setError(abort.signal.aborted?'The answer timed out. No hotel action was performed. Use the written guide.':cause instanceof Error?cause.message:'AI help is unavailable. Use the written guide.')}
  finally{clearTimeout(timeout);lock.current=false;if(alive.current)setBusy(false);if(controller.current===abort)controller.current=null;}
 }
 async function checkStatus(){
  if(lock.current||!lastRequest)return;
  lock.current=true;setBusy(true);setRequestStatus('');
  const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),30000);
  try{
   const client=hotelClient(),user=await client.auth.getUser(),session=await client.auth.getSession();
   if(user.error||user.data.user?.id!==actor||session.error||session.data.session?.user.id!==actor)throw Error('Sign in again to check the request.');
   if(!alive.current||abort.signal.aborted)return;
   const response=await fetch('/api/manual-help?'+new URLSearchParams({tenant,property,requestId:lastRequest}),{headers:{Authorization:'Bearer '+session.data.session.access_token},signal:abort.signal});
   const raw:unknown=await response.json();if(!response.ok||!raw||typeof raw!=='object')throw Error('Request status is unavailable.');
   const result=raw as {scope?:unknown;tenant?:unknown;property?:unknown;requestId?:unknown;found?:unknown;request?:{status?:unknown}|null};
   if(result.scope!=='own-request'||result.tenant!==tenant||result.property!==property||result.requestId!==lastRequest||typeof result.found!=='boolean'||(result.found&&!['pending','completed','failed'].includes(String(result.request?.status))))throw Error('Request status could not be verified.');
   const again=await client.auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reopen Help & manual.');
   const message=!result.found?'No request record was found yet. This does not prove a delayed request has stopped. Use the written guide.':result.request?.status==='pending'?'The request outcome is not confirmed. Use the written guide instead of resubmitting.':result.request?.status==='completed'?'The answer completed. Answer text is not retained and cannot be restored here. Use the written guide if you did not receive it.':'The request failed. Provider usage may still have occurred. Use the written guide.';
   if(alive.current&&!abort.signal.aborted)setRequestStatus(message);
  }catch(cause){if(alive.current)setRequestStatus(abort.signal.aborted?'Status check timed out. Try checking again.':cause instanceof Error?cause.message:'Request status is unavailable.')}
  finally{clearTimeout(timer);lock.current=false;if(alive.current)setBusy(false);if(controller.current===abort)controller.current=null}
 }
 return <section className="card manual-ai-help" aria-label="AI operations help"><h2>Ask the PMS assistant</h2><p>AI help · Development preview. A configured AI connection is required. Choose written instructions or a current property question. Property questions cover room readiness, unfinished repairs and current arrivals, departures and in-house counts. Ask “What requires manager attention today?” for a server-derived list of current operational items. When the balance-report connection is available, owners and managers can ask about verified current guest balances seven-day channel booked value, and saved rate-decision explanations. Channel figures are booked accommodation value, not earned revenue, payments, settlement or profit. Revenue forecasts and tonight&apos;s sold occupancy are not supported.</p><form onSubmit={event=>{event.preventDefault();void ask()}}><label className="field">Question source<select value={mode} disabled={busy} onChange={e=>{setMode(e.target.value as typeof mode);setAnswer(null);setPropertyAnswer(null);setError('')}}><option value="manual">Operating instructions</option><option value="property">Current property</option></select></label><label className="field">Your operating question<textarea value={question} maxLength={1000} minLength={3} required disabled={busy} onChange={event=>{setQuestion(event.target.value);setAnswer(null);setPropertyAnswer(null);setError('')}} placeholder="How do I extend a stay?"/></label><p>Your question is sent to the configured AI provider. Do not include guest names, ID images or numbers, card details, passwords or other private information.</p><button className="primary" disabled={busy}>{busy?'Preparing answer…':'Ask AI'}</button></form>{lastRequest&&<div><button className="secondary" disabled={busy} onClick={()=>void checkStatus()}>Check last question status</button><p>This check does not submit another AI question or perform a hotel action.</p>{requestStatus&&<output>{requestStatus}</output>}</div>}{error&&<p className="pilot-error" role="alert">{error}</p>}{propertyAnswer&&<section aria-label="Property answer"><p>Property date {propertyAnswer.businessDate} &#183; {propertyAnswer.timeZone}. Snapshot received {new Date(propertyAnswer.receivedAt).toLocaleString()} in your browser time zone.</p>{propertyAnswer.unsupported?<p>This question is outside the available property facts. Check the relevant PMS screen or ask your manager.</p>:<dl>{propertyAnswer.facts.map(f=><div key={f.id}><dt>{f.label}</dt><dd>{Array.isArray(f.value)?f.value.length?(f.id==='recentRateDecisionExplanations'?<ol>{f.value.map((entry,index)=><li key={index}>{entry}</li>)}</ol>:f.value.join(', ')):'None':f.value}</dd></div>)}</dl>}<ul aria-label="Answer limitations">{propertyAnswer.limitations.map((note,index)=><li key={index}>{note}</li>)}</ul><p>This is a snapshot, not a forecast or tonight&apos;s sold occupancy. Room readiness does not guarantee availability for a stay. No hotel records were changed. Verify that the selected facts answer your question.</p></section>}{answer&&<section aria-label="AI answer"><p className="manual-ai-answer">{answer.answer}</p><p>AI guidance can be wrong. Verify the source instructions before acting. This answer did not change any hotel records.</p>{answer.needsStaffReview&&<p>Staff review is required before acting on this guidance.</p>}{answer.topicIds.length>0&&<><h3>Source instructions</h3>{answer.topicIds.map(id=>{const topic=operatingManual.find(article=>article.id===id)!;return <details key={id}><summary>{topic.title}</summary><ol>{topic.steps.map((step,index)=><li key={index}>{step}</li>)}</ol>{topic.notes.map((note,index)=><p key={index}>{note}</p>)}</details>})}</>}<small>Guide revision {answer.revision}</small></section>}</section>;
}
