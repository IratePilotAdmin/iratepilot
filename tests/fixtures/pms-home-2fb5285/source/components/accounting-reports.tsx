'use client';
import {useState} from 'react';
import type {Membership} from '@/lib/pilot';
import {afterDays} from '@/lib/rates';
import {AccountingReconciliation} from '@/components/accounting-reconciliation';
import {AccountingLedger} from '@/components/accounting-ledger';
import {AccountingCashFlow} from '@/components/accounting-cash-flow';
import {AccountingBalanceSheet} from '@/components/accounting-balance-sheet';
import {AccountingProfitLoss} from '@/components/accounting-profit-loss';
import {AccountingTrialBalance} from '@/components/accounting-trial-balance';
export function AccountingReports({membership,businessDate}:{membership:Membership;businessDate:string}){
 const [kind,setKind]=useState('trial_balance');
 const [start,setStart]=useState(businessDate.slice(0,8)+'01');
 const [end,setEnd]=useState(afterDays(businessDate,1));
 const [selected,setSelected]=useState<{start:string;end:string}|null>(null);
 const [error,setError]=useState('');
 function load(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');
  const startTime=Date.parse(start+'T00:00:00Z'),endTime=Date.parse(end+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(startTime)||!Number.isFinite(endTime)||endTime<=startTime||endTime-startTime>366*86400000){setSelected(null);setError('Choose a start date and a later end date, up to 366 days apart.');return;}
  setSelected({start,end});
 }
 const fresh=selected?.start===start&&selected.end===end;
 return <section className="card pilot-reports"><label className="field">Accounting report<select value={kind} onChange={e=>{setKind(e.target.value);setSelected(null);}}><option value="trial_balance">Trial balance</option><option value="profit_loss">Profit and loss</option><option value="balance_sheet">Balance sheet</option><option value="cash_flow">Cash flow</option><option value="ledger">General ledger</option><option value="sources">Nightly source reconciliation</option><option value="corrections">Correction reconciliation</option></select></label><form className="pilot-report-filters" onSubmit={load}><label className="field">From<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label><label className="field">Until (exclusive)<input type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></label><button className="primary" type="submit">{kind==='cash_flow'?'Load cash flow':kind==='balance_sheet'?'Load balance sheet':kind==='profit_loss'?'Load profit and loss':kind==='ledger'?'Load ledger':kind==='trial_balance'?'Load trial balance':'Load reconciliation'}</button></form>{error&&<p className="pilot-error" role="alert">{error}</p>}{fresh&&selected?(kind==='sources'||kind==='corrections'?<AccountingReconciliation key={kind+'/'+selected.start+'/'+selected.end} membership={membership} start={selected.start} end={selected.end} corrections={kind==='corrections'} businessDate={businessDate}/>:kind==='ledger'?<AccountingLedger key={selected.start+'/'+selected.end} membership={membership} start={selected.start} end={selected.end} businessDate={businessDate}/>:kind==='profit_loss'?<AccountingProfitLoss key={selected.start+'/'+selected.end} membership={membership} start={selected.start} end={selected.end}/>:kind==='cash_flow'?<AccountingCashFlow key={selected.start+'/'+selected.end} membership={membership} start={selected.start} end={selected.end}/>:kind==='balance_sheet'?<AccountingBalanceSheet key={selected.start+'/'+selected.end} membership={membership} start={selected.start} end={selected.end}/>:<AccountingTrialBalance key={selected.start+'/'+selected.end} membership={membership} start={selected.start} end={selected.end}/>):<p className="pilot-empty">Choose dates and load the selected accounting report.</p>}</section>;
}

