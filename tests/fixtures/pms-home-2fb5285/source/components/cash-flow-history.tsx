'use client';
import {useEffect,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {readCashHistory,type CashHistoryScope} from '@/lib/cash-flow-history';
import type {CashReview} from '@/lib/cash-flow-report';
import {signedLedgerDecimal} from '@/lib/profit-loss';

export function CashFlowHistory({membership,configuration,journal,description}:{membership:Membership;configuration:string;journal:string;description:string}){
 const [open,setOpen]=useState(false),[attempt,setAttempt]=useState(0),[result,setResult]=useState<{key:string;rows:CashReview[]}|null>(null),[error,setError]=useState('');
 const {tenant_id,property_id,role}=membership,allowed=role==='owner'||role==='manager';
 const key=JSON.stringify([tenant_id,property_id,configuration,journal,role]);
 useEffect(()=>{let current=true;setResult(null);setError('');if(open&&allowed){const scope:CashHistoryScope={tenant_id,property_id,configuration_id:configuration,journal_id:journal};hotelRpc('cash_flow_review_history',{p_tenant:tenant_id,p_property:property_id,p_configuration:configuration,p_journal:journal}).then(value=>{const rows=readCashHistory(value,scope);if(current)setResult({key,rows});}).catch(e=>{if(current)setError(e instanceof Error?e.message:'Unable to load classification history.');});}return()=>{current=false;};},[open,allowed,tenant_id,property_id,configuration,journal,key,attempt]);
 if(!allowed)return null;
 const rows=result?.key===key?result.rows:null;
 return <div><button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Hide':'View'} history for {description}</button>{open&&<section aria-label={'Classification history for '+description}><h3>Classification history</h3><p>Saved revisions, oldest first. An empty allocation list reopens the movement for review.</p>{error?<><p role="alert">{error}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>Retry classification history</button></>:rows===null?<p role="status">Loading classification history…</p>:rows.length===0?<p>No classification reviews saved for this configuration.</p>:<ol>{rows.map(r=><li key={r.id}><p><strong>Version {r.version}</strong> · {r.created_at}</p><p>{r.reason}</p><p>Reviewed by {r.actor_id} · Review {r.id}</p>{r.allocations.length?<ul>{r.allocations.map((a,i)=><li key={i}>{a.category}: {signedLedgerDecimal(a.amount_minor)} USD</li>)}</ul>:<p>Reopened — no allocations.</p>}</li>)}</ol>}</section>}</div>;
}
