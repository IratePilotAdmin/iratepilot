'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import {accountingUsd,type AccountingSetup} from '@/lib/accounting';
import {adjustmentAmount} from '@/lib/accounting-adjustment-request';
import type {PaymentSources} from '@/lib/payment-accounting';
import {readAllocationView,readTransferReview,type AllocationView,type TransferReview} from '@/lib/payment-reclassification';
import {PaymentTransferAction} from './payment-transfer-action';

export function PaymentTransferForm({membership,setup,sources,businessDate}:{membership:Membership;setup:AccountingSetup;sources:PaymentSources;businessDate:string}){
 const [entry,setEntry]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[amount,setAmount]=useState(''),[period,setPeriod]=useState(''),[date,setDate]=useState(businessDate),[reason,setReason]=useState('');
 const [allocation,setAllocation]=useState<AllocationView|null>(null),[review,setReview]=useState<TransferReview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(false),lock=useRef(false),generation=useRef(0),latest=useRef({membership,setup,sources});latest.current={membership,setup,sources};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const context=useRef<typeof latest.current|null>(null);
 const same=context.current?.membership===membership&&context.current.setup===setup&&context.current.sources===sources;
 const loaded=same?allocation:null,visible=same?review:null;
 const allowed=['owner','manager'].includes(membership.role)&&setup.tenant_id===membership.tenant_id&&setup.property_id===membership.property_id&&sources.tenant_id===membership.tenant_id&&sources.property_id===membership.property_id;
 const source=sources.rows.find(s=>s.entry_id===entry&&s.kind==='external_payment'&&s.journal_id);
 const controls=setup.accounts.filter(a=>a.active&&['asset','liability'].includes(a.kind)&&a.account_id!==loaded?.clearing_account_id);
 function changed(){generation.current++;setReview(null);setError('');}
 async function run(preview:boolean){
  if(lock.current||!allowed)return;lock.current=true;setBusy(true);setReview(null);setError('');
  const snapshot=latest.current,version=generation.current;
  const current=()=>alive.current&&version===generation.current&&latest.current.membership===snapshot.membership&&latest.current.setup===snapshot.setup&&latest.current.sources===snapshot.sources;
  try{
   if(!source)throw Error('Choose a posted original payment.');
   const identity=await hotelClient().auth.getUser();if(identity.error||identity.data.user?.id!==sources.actor_id)throw Error('Verify sign-in and reload payment records.');
   const scope={actor:sources.actor_id,tenant:membership.tenant_id,property:membership.property_id};
   let result:unknown;
   if(preview){
    const minor=adjustmentAmount(amount),selected=setup.periods.find(p=>p.period_id===period&&!p.closed);
    if(!loaded||!controls.some(a=>a.account_id===from)||!controls.some(a=>a.account_id===to)||from===to||BigInt(minor)>BigInt(loaded.allocations.find(a=>a.account_id===from)?.available_minor??'0'))throw Error('Choose distinct control accounts and an available amount.');
    if(!selected||date<selected.start_date||date>=selected.end_date_exclusive)throw Error('Choose a date within an open period.');
    result=await hotelRpc('preview_payment_reclassification',{p_tenant:scope.tenant,p_property:scope.property,p_entry:entry,p_from:from,p_to:to,p_amount:minor,p_period:period,p_date:date,p_reason:reason.trim()});
   }else{setAllocation(null);result=await hotelRpc('payment_allocation_state',{p_tenant:scope.tenant,p_property:scope.property,p_entry:entry});}
   const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reload payment records.');if(!current())return;
   context.current=snapshot;
   if(preview){const parsed=readTransferReview(result,scope);if(parsed.entry_id!==entry||parsed.from_account_id!==from||parsed.to_account_id!==to||parsed.amount_minor!==adjustmentAmount(amount)||parsed.command.period_id!==period||parsed.command.posting_date!==date||parsed.command.description!==reason.trim()||parsed.allocation_state.original_journal_id!==source.journal_id||parsed.allocation_state.original_amount_minor!==source.amount_minor)throw Error('Transfer review differs from your selection.');setReview(parsed);}
   else{const parsed=readAllocationView(result,scope,entry);if(parsed.original_journal_id!==source.journal_id||parsed.original_amount_minor!==source.amount_minor||parsed.reservation_id!==source.reservation_id)throw Error('Allocation does not match the selected payment.');setAllocation(parsed);setFrom('');setTo('');}
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Unable to review allocation transfer.');}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 if(!allowed)return <p>Manager access is required to transfer payment allocations.</p>;
 return <section aria-label="Payment allocation transfer"><h3>Transfer payment allocation</h3><p>Move an available payment allocation between receivable and advance accounts. Guest balances and payment clearing remain unchanged.</p>
 <form onSubmit={event=>{event.preventDefault();void run(true)}}><fieldset disabled={busy}>
 <label className="field">Posted payment<select value={entry} onChange={event=>{changed();setEntry(event.target.value);setAllocation(null);setFrom('');setTo('')}}><option value="">Choose a posted payment</option>{sources.rows.filter(s=>s.kind==='external_payment'&&s.journal_id).map(s=><option key={s.entry_id} value={s.entry_id}>{s.reservation_reference} / {accountingUsd(s.amount_minor)} / {s.source_date}</option>)}</select></label>
 <button type="button" onClick={()=>void run(false)}>Load available allocations</button>
 {loaded&&<><table className="pilot-table"><caption>Current payment allocations</caption><thead><tr><th>Account</th><th>Available USD</th></tr></thead><tbody>{loaded.allocations.map(a=><tr key={a.account_id}><td>{setup.accounts.find(x=>x.account_id===a.account_id)?.name??a.account_id}</td><td>{accountingUsd(a.available_minor)}</td></tr>)}</tbody></table>
 <label className="field">Transfer from<select value={from} onChange={e=>{changed();setFrom(e.target.value)}}><option value="">Choose source account</option>{controls.filter(a=>loaded.allocations.some(x=>x.account_id===a.account_id&&BigInt(x.available_minor)>0)).map(a=><option key={a.account_id} value={a.account_id}>{a.code} / {a.name}</option>)}</select></label>
 <label className="field">Transfer to<select value={to} onChange={e=>{changed();setTo(e.target.value)}}><option value="">Choose destination account</option>{controls.filter(a=>a.account_id!==from).map(a=><option key={a.account_id} value={a.account_id}>{a.code} / {a.name}</option>)}</select></label>
 <label className="field">Transfer amount USD<input inputMode="decimal" value={amount} onChange={e=>{changed();setAmount(e.target.value)}}/></label>
 <label className="field">Transfer period<select value={period} onChange={e=>{changed();setPeriod(e.target.value)}}><option value="">Choose an open period</option>{setup.periods.filter(p=>!p.closed).map(p=><option key={p.period_id} value={p.period_id}>{p.start_date} to {p.end_date_exclusive} (end excluded)</option>)}</select></label>
 <label className="field">Transfer date<input type="date" value={date} onChange={e=>{changed();setDate(e.target.value)}}/></label>
 <label className="field">Transfer reason<input maxLength={500} value={reason} onChange={e=>{changed();setReason(e.target.value)}}/></label><button type="submit">Review allocation transfer</button></>}
 </fieldset></form>{error&&<p role="alert" className="pilot-error">{error}</p>}
 {visible&&<table className="pilot-table"><caption>Reviewed allocation transfer</caption><thead><tr><th>Account</th><th>Side</th><th>USD</th></tr></thead><tbody>{visible.command.lines.map((line,i)=><tr key={line.account_id}><td>{visible.accounts[i].code} / {visible.accounts[i].name}</td><td>{line.side}</td><td>{accountingUsd(line.amount_minor)}</td></tr>)}</tbody></table>}
 <PaymentTransferAction membership={membership} preview={visible}/></section>;
}
