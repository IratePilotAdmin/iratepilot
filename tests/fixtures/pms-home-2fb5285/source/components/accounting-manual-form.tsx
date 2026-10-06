'use client';

import {useState} from 'react';
import type {Membership} from '@/lib/pilot';
import {accountingUsd, type AccountingSetup} from '@/lib/accounting';
import {adjustmentAmount, validateAdjustmentRequest, type AdjustmentCommand} from '@/lib/accounting-adjustment-request';
import {AccountingAdjustmentAction} from '@/components/accounting-adjustment-action';

type Entry = {id:number;account:string;side:'debit'|'credit';amount:string};
const placeholder = '00000000-0000-4000-8000-000000000001';
export function AccountingManualForm({membership,setup,businessDate}:{membership:Membership;setup:AccountingSetup;businessDate:string}) {
  const [period,setPeriod]=useState(''),[date,setDate]=useState(businessDate),[reason,setReason]=useState('');
  const [entries,setEntries]=useState<Entry[]>([{id:1,account:'',side:'debit',amount:''},{id:2,account:'',side:'credit',amount:''}]);
  const [review,setReview]=useState<{setup:AccountingSetup;command:AdjustmentCommand}|null>(null),[error,setError]=useState('');
  const permitted=membership.role==='owner'||membership.role==='manager';
  const scoped=setup.tenant_id===membership.tenant_id&&setup.property_id===membership.property_id;
  const active=setup.accounts.filter(a=>a.active);
  function changed(){setReview(null);setError('');}
  function update(id:number,change:Partial<Entry>){changed();setEntries(rows=>rows.map(row=>row.id===id?{...row,...change}:row));}
  function prepare(event:React.FormEvent){
    event.preventDefault();setReview(null);setError('');
    try {
      if(!permitted||!scoped)throw Error('Reload this property before preparing an adjustment.');
      const selected=setup.periods.find(p=>p.period_id===period&&!p.closed);
      if(!selected||date<selected.start_date||date>=selected.end_date_exclusive)throw Error('Choose an open period containing the posting date.');
      const lines=entries.map(row=>{
        if(!active.some(a=>a.account_id===row.account))throw Error('Choose an active account for every line.');
        return {account_id:row.account,side:row.side,amount_minor:adjustmentAmount(row.amount)};
      });
      const command:AdjustmentCommand={period_id:period,posting_date:date,currency:'USD',description:reason,source_kind:'manual_journal',source_id:placeholder,source_version:1,lines};
      validateAdjustmentRequest({version:1,actor:placeholder,tenant:membership.tenant_id,property:membership.property_id,request:placeholder,command});
      setReview({setup,command});
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to prepare adjustment.');}
  }
  const visible=permitted&&scoped&&review?.setup===setup?review.command:null;
  return <section aria-label="Manual journal">
    <h3>Manual journal</h3><p>Record a reviewed accounting adjustment. This does not change guest charges, payments, inventory, or saved nightly entries.</p>
    {permitted&&scoped&&<form onSubmit={prepare}>
      <label className="field">Journal period<select value={period} onChange={e=>{changed();setPeriod(e.target.value);}}><option value="">Choose an open period</option>{setup.periods.filter(p=>!p.closed).map(p=><option key={p.period_id} value={p.period_id}>{p.start_date} through {p.end_date_exclusive} (end excluded)</option>)}</select></label>
      <label className="field">Journal date<input type="date" value={date} onChange={e=>{changed();setDate(e.target.value);}}/></label>
      <label className="field">Adjustment reason<input maxLength={500} value={reason} onChange={e=>{changed();setReason(e.target.value);}}/></label>
      {entries.map((row,index)=><fieldset key={row.id}><legend>Line {index+1}</legend>
        <label className="field">Account for line {index+1}<select value={row.account} onChange={e=>update(row.id,{account:e.target.value})}><option value="">Choose an account</option>{active.map(a=><option key={a.account_id} value={a.account_id}>{a.code} · {a.name}</option>)}</select></label>
        <label className="field">Side for line {index+1}<select value={row.side} onChange={e=>update(row.id,{side:e.target.value as Entry['side']})}><option value="debit">Debit</option><option value="credit">Credit</option></select></label>
        <label className="field">USD amount for line {index+1}<input inputMode="decimal" value={row.amount} onChange={e=>update(row.id,{amount:e.target.value})}/></label>
        <button type="button" className="text-button" disabled={entries.length<=2} onClick={()=>{changed();setEntries(rows=>rows.filter(item=>item.id!==row.id));}}>Remove line {index+1}</button>
      </fieldset>)}
      <button type="button" className="secondary" disabled={entries.length>=1000} onClick={()=>{changed();setEntries(rows=>[...rows,{id:Math.max(...rows.map(row=>row.id))+1,account:'',side:'debit',amount:''}]);}}>Add journal line</button>
      <button type="submit" className="primary">Review manual journal</button>
    </form>}
    {error&&<p role="alert" className="pilot-error">{error}</p>}
    {visible&&<section aria-label="Reviewed manual journal"><p>{visible.posting_date} · {visible.description}</p><table className="pilot-table"><caption>Reviewed journal lines</caption><thead><tr><th>Account</th><th>Side</th><th>USD</th></tr></thead><tbody>{visible.lines.map((line,index)=><tr key={index}><td>{active.find(a=>a.account_id===line.account_id)?.code}</td><td>{line.side}</td><td>{accountingUsd(line.amount_minor)}</td></tr>)}</tbody></table></section>}
    <AccountingAdjustmentAction membership={membership} preview={visible}/>
  </section>;
}
