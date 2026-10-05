'use client';
import {useEffect,useState} from 'react';
import {ReportCsvCopy} from '@/components/report-csv-copy';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {downloadReport} from '@/lib/report-export';
import {accountingUsd,readTrialBalance,trialBalanceRows,type TrialBalance} from '@/lib/accounting';

export function AccountingTrialBalance({membership,start,end}:{membership:Membership;start:string;end:string}){
 const [report,setReport]=useState<TrialBalance|null>(null);
 const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [revision,setRevision]=useState(0);
 const {tenant_id,property_id,role}=membership;
 useEffect(()=>{
  let current=true;setReport(null);setError('');
  if(role!=='owner'&&role!=='manager'){setLoading(false);return;}
  setLoading(true);
  hotelRpc<unknown>('trial_balance',{p_tenant:tenant_id,p_property:property_id,p_start:start,p_end:end})
   .then(value=>{const next=readTrialBalance(value,{tenant_id,property_id,start,end});if(current)setReport(next);})
   .catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to load accounting report.');})
   .finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[tenant_id,property_id,role,start,end,revision]);
 if(role!=='owner'&&role!=='manager')return <p>Accounting reports are available to owners and managers.</p>;
 const visible=report?.tenant_id===tenant_id&&report.property_id===property_id&&report.start_date===start&&report.end_date_exclusive===end?report:null;
 function exportCsv(){if(!visible||loading||error)return;try{downloadReport('trial-balance-'+visible.property_id+'-'+visible.start_date+'-'+visible.end_date_exclusive,trialBalanceRows(visible));}catch(cause){setError(cause instanceof Error?cause.message:'Unable to export trial balance.');}}
 return <section className="pilot-report" aria-label="Trial balance" aria-busy={loading}>
  <div className="pilot-section-heading"><h2>Trial balance</h2><button type="button" className="text-button" disabled={loading} onClick={()=>setRevision(value=>value+1)}>Refresh</button><button type="button" className="secondary" disabled={!visible||loading||!!error} onClick={exportCsv}>Export CSV</button></div>
  <p>Posted ledger entries in USD. {start} through {end} (end date excluded).</p>
  {loading&&<p role="status">Loading trial balance…</p>}
  {error&&<p className="pilot-error" role="alert">{error}</p>}
  {visible&&!loading&&!error&&<ReportCsvCopy rows={()=>trialBalanceRows(visible)}/>}
  {visible&&<div className="pilot-table-wrap"><table className="pilot-table"><caption>Opening balances, activity, and closing balances</caption><thead><tr><th scope="col">Account</th><th scope="col">Type</th><th scope="col">Opening debit</th><th scope="col">Opening credit</th><th scope="col">Activity debit</th><th scope="col">Activity credit</th><th scope="col">Closing debit</th><th scope="col">Closing credit</th></tr></thead><tbody>{visible.accounts.map(row=><tr key={row.account_id}><th scope="row">{row.account_code}</th><td>{row.account_kind}</td>{(['opening_debit_minor','opening_credit_minor','period_debit_minor','period_credit_minor','closing_debit_minor','closing_credit_minor'] as const).map(key=><td key={key}>{accountingUsd(row[key])}</td>)}</tr>)}</tbody></table>{!visible.accounts.length&&<p className="pilot-empty">No ledger accounts have been configured for this property.</p>}</div>}
 </section>;
}
