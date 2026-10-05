'use client';
import {useState} from 'react';
import type {Membership} from '@/lib/pilot';
import {accountingUsd,type AccountingSetup} from '@/lib/accounting';
import type {JournalDetail} from '@/lib/accounting-journal';
import {validateAdjustmentRequest,type AdjustmentCommand} from '@/lib/accounting-adjustment-request';
import {AccountingAdjustmentAction} from '@/components/accounting-adjustment-action';
export function AccountingReversalForm({membership,setup,journal,businessDate}:{membership:Membership;setup:AccountingSetup;journal:JournalDetail;businessDate:string}) {
  const [period,setPeriod]=useState(''),[date,setDate]=useState(businessDate),[reason,setReason]=useState(''),[error,setError]=useState('');
  const [review,setReview]=useState<{setup:AccountingSetup;journal:JournalDetail;command:AdjustmentCommand}|null>(null);
  const permitted=membership.role==='owner'||membership.role==='manager';
  const scoped=setup.tenant_id===membership.tenant_id&&setup.property_id===membership.property_id&&journal.tenant_id===membership.tenant_id&&journal.property_id===membership.property_id;
  function changed(){setReview(null);setError('');}
  function prepare(event:React.FormEvent){event.preventDefault();changed();try{
    if(!permitted||!scoped)throw Error('Reload this property before reviewing a reversal.');
    if(journal.direct_reversal_id)throw Error('This journal already has a reversal.');
    const selected=setup.periods.find(p=>p.period_id===period&&!p.closed);
    if(!selected||date<selected.start_date||date>=selected.end_date_exclusive||date<journal.posting_date)throw Error('Choose an open period and a date on or after the original posting.');
    const lines=journal.lines.map(line=>{
      if(!setup.accounts.some(account=>account.account_id===line.account_id&&account.active))throw Error('An original account is inactive or unavailable. Review accounting setup first.');
      return {account_id:line.account_id,side:line.side==='debit'?'credit' as const:'debit' as const,amount_minor:line.amount_minor};
    });
    const command:AdjustmentCommand={period_id:period,posting_date:date,currency:'USD',description:reason,source_kind:'journal_reversal',source_id:journal.journal_id,source_version:1,lines};
    validateAdjustmentRequest({version:1,actor:journal.created_by,tenant:membership.tenant_id,property:membership.property_id,request:journal.request_id,command});
    setReview({setup,journal,command});
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to prepare reversal.');}}
  const visible=permitted&&scoped&&!journal.direct_reversal_id&&review?.setup===setup&&review.journal===journal?review.command:null;
  return <section aria-label="Journal reversal"><h3>Reverse journal</h3>
    {scoped&&permitted&&<><p>Original journal {journal.journal_id} · {journal.posting_date} · {journal.description}</p><p>A reversal adds the opposite accounting entries. The original remains in the audit trail. Guest charges, payments and saved service records require their own corrections.</p>
    <table className="pilot-table"><caption>Original journal lines</caption><thead><tr><th>Account</th><th>Side</th><th>USD</th></tr></thead><tbody>{journal.lines.map(line=><tr key={line.line_no}><td>{line.account_code} · {line.current_account_name}</td><td>{line.side}</td><td>{accountingUsd(line.amount_minor)}</td></tr>)}</tbody></table>
    {journal.direct_reversal_id?<p>Already reversed by journal {journal.direct_reversal_id}.</p>:permitted&&<form onSubmit={prepare}>
      <label className="field">Reversal period<select value={period} onChange={e=>{changed();setPeriod(e.target.value);}}><option value="">Choose an open period</option>{setup.periods.filter(p=>!p.closed).map(p=><option key={p.period_id} value={p.period_id}>{p.start_date} through {p.end_date_exclusive} (end excluded)</option>)}</select></label>
      <label className="field">Reversal date<input type="date" value={date} onChange={e=>{changed();setDate(e.target.value);}}/></label>
      <label className="field">Reversal reason<input maxLength={500} value={reason} onChange={e=>{changed();setReason(e.target.value);}}/></label>
      <button type="submit" className="primary">Review reversal</button>
    </form>}</>}
    {error&&<p className="pilot-error" role="alert">{error}</p>}
    {visible&&<table className="pilot-table"><caption>Reviewed reversal lines</caption><thead><tr><th>Account</th><th>Side</th><th>USD</th></tr></thead><tbody>{visible.lines.map((line,index)=><tr key={index}><td>{journal.lines[index].account_code}</td><td>{line.side}</td><td>{accountingUsd(line.amount_minor)}</td></tr>)}</tbody></table>}
    <AccountingAdjustmentAction membership={membership} preview={visible}/>
  </section>;
}
