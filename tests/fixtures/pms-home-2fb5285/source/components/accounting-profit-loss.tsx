'use client';
import {useEffect,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {profitLossFromLedger,profitLossRows,signedLedgerDecimal,type ProfitLoss} from '@/lib/profit-loss';
import {downloadReport} from '@/lib/report-export';
import {ReportCsvCopy} from '@/components/report-csv-copy';

export function AccountingProfitLoss({membership,start,end}:{membership:Membership;start:string;end:string}){
 const {tenant_id,property_id,role}=membership;
 const permitted=role==='owner'||role==='manager';
 const [report,setReport]=useState<ProfitLoss|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let current=true;setReport(null);setError('');setLoading(permitted);
  if(permitted)hotelRpc('trial_balance',{p_tenant:tenant_id,p_property:property_id,p_start:start,p_end:end})
   .then(value=>{const parsed=profitLossFromLedger(value,{tenant_id,property_id,start,end});if(current)setReport(parsed);})
   .catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to load profit and loss.');})
   .finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[tenant_id,property_id,permitted,start,end,revision]);
 if(!permitted)return <p>Profit and loss is available to owners and managers.</p>;
 const visible=!loading&&!error&&report?.tenant_id===tenant_id&&report.property_id===property_id&&report.start===start&&report.end===end?report:null;
 function exportCsv(){if(!visible)return;try{downloadReport('profit-loss-'+property_id+'-'+start+'-'+end,profitLossRows(visible));}catch(cause){setError(cause instanceof Error?cause.message:'Unable to export profit and loss.');}}
 return <section className="pilot-report" aria-label="Profit and loss" aria-busy={loading}>
  <div className="pilot-section-heading"><h2>Profit and loss</h2><button type="button" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh profit and loss</button><button type="button" disabled={!visible} onClick={exportCsv}>Export profit and loss CSV</button></div>
  <p>{start} through {end} (end excluded) · USD · Posted ledger activity.</p>
  <p>Includes income and expense accounts. Unposted bookings, invoices and payments are excluded. Reconcile account classifications and all required postings before treating these figures as final financial statements.</p>
  {loading&&<p role="status">Loading profit and loss…</p>}{error&&<p role="alert">{error}</p>}
  {visible&&<><div className="pilot-report-totals"><div>Income <strong>${signedLedgerDecimal(visible.income_minor)}</strong></div><div>Expenses <strong>${signedLedgerDecimal(visible.expense_minor)}</strong></div><div>Net income / loss <strong>${signedLedgerDecimal(visible.net_minor)}</strong></div></div>
   <ReportCsvCopy rows={()=>profitLossRows(visible)}/>
   <div className="pilot-table-wrap"><table className="pilot-table"><caption>Income and expense account activity in USD</caption><thead><tr><th scope="col">Account</th><th scope="col">Type</th><th scope="col">Net activity USD</th></tr></thead><tbody>{visible.rows.map(row=><tr key={row.id}><th scope="row">{row.code}</th><td>{row.kind==='income'?'Income':'Expense'}</td><td>{signedLedgerDecimal(row.amount_minor)}</td></tr>)}</tbody></table></div>
   {!visible.rows.length&&<p>No income or expense accounts are configured. This does not establish that the property has no income or expenses.</p>}
  </>}
 </section>;
}
