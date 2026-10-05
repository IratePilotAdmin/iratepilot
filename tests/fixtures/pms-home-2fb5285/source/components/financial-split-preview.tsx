'use client';
import {useEffect,useRef,useState} from 'react';
import type {FinancialPostingSelection} from '@/lib/financial-migration-posting';
import {splitEntrySources,type prepareSplitEntries} from '@/lib/financial-split-entry';
import {readSplitReview} from '@/lib/financial-split-review';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import {bankCloseMoney} from '@/lib/cashier-bank-close';
import {FinancialSplitBatchEntry} from './financial-split-batch-entry';
type Props={selection:FinancialPostingSelection;assessment:Record<string,unknown>;onReviewed:(review:Record<string,unknown>)=>void;onRecoveryLock?:(locked:boolean)=>void};
export function FinancialSplitPreview(props:Props){return <Preview key={JSON.stringify([props.selection,props.assessment])} {...props}/>}
function Preview({selection,assessment,onReviewed,onRecoveryLock}:Props){
 const [review,setReview]=useState<ReturnType<typeof readSplitReview>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{onRecoveryLock?.(busy)},[busy,onRecoveryLock]);
 async function identify(){const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==selection.scope.actor)throw Error('Sign-in changed. Reopen migration.');}
 async function preview(allocations:ReturnType<typeof prepareSplitEntries>){if(lock.current)return;lock.current=true;setBusy(true);setReview(null);setError('');try{await identify();const raw=await hotelRpc('preview_financial_migration_splits',{p_tenant:selection.scope.tenant,p_property:selection.scope.property,p_assessment:assessment,p_allocations:allocations});const next=readSplitReview(raw,selection,assessment,allocations);await identify();if(alive.current)setReview(next);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to preview allocations.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 return <section aria-label="Preview split migration"><FinancialSplitBatchEntry sources={splitEntrySources(assessment,selection)} disabled={busy} onPrepared={allocations=>void preview(allocations)} onEdited={()=>setReview(null)}/>{busy&&<p role="status">Checking current balances…</p>}{review&&<section aria-label="Reviewed split totals"><h3>Reviewed split totals</h3><p>Matched receivables: {bankCloseMoney(review.matched)}</p><p>New receivables: {bankCloseMoney(review.additional.receivable)}</p><p>New prepayments: {bankCloseMoney(review.additional.prepayment)}</p><p>New security deposits: {bankCloseMoney(review.additional.security)}</p><p>No financial records have been posted.</p><button type="button" disabled={busy} onClick={()=>onReviewed(review.raw)}>Continue with reviewed split</button></section>}{error&&<p role="alert">{error}</p>}</section>;
}
