'use client';
import {useEffect,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {balanceSheetFromLedger,balanceSheetRows,type BalanceSheet} from '@/lib/balance-sheet';
import {signedLedgerDecimal} from '@/lib/profit-loss';
import {downloadReport} from '@/lib/report-export';
import {ReportCsvCopy} from '@/components/report-csv-copy';
export function AccountingBalanceSheet({membership,start,end}:{membership:Membership;start:string;end:string}){
 const {tenant_id,property_id,role}=membership,permitted=role==='owner'||role==='manager';
 const [report,setReport]=useState<BalanceSheet|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{let current=true;setReport(null);setError('');setLoading(permitted);
  if(permitted)hotelRpc('trial_balance',{p_tenant:tenant_id,p_property:property_id,p_start:start,p_end:end}).then(value=>{const next=balanceSheetFromLedger(value,{tenant_id,property_id,start,end});if(current)setReport(next);}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to load balance sheet.');}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[tenant_id,property_id,permitted,start,end,revision]);
 if(!permitted)return <p>Balance sheets are available to owners and managers.</p>;
 const visible=!loading&&!error&&report?.tenant_id===tenant_id&&report.property_id===property_id&&report.end===end?report:null;
 function exportCsv(){if(!visible)return;try{downloadReport('balance-sheet-'+property_id+'-before-'+end,balanceSheetRows(visible));}catch(cause){setError(cause instanceof Error?cause.message:'Unable to export balance sheet.');}}
 return <section className="pilot-report" aria-label="Balance sheet" aria-busy={loading}>
  <div className="pilot-section-heading"><h2>Balance sheet</h2><button type="button" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh balance sheet</button><button type="button" disabled={!visible} onClick={exportCsv}>Export balance sheet CSV</button></div>
  <p>Posted balances before {end} (exclusive) · USD. Includes opening balances before the selected start date.</p>
  <p>Unposted activity is excluded. Unclosed income or loss is the balance still held in income and expense accounts; it is shown separately from posted equity. Reconcile opening balances, account classifications and required postings before final financial-statement use.</p>
  {loading&&<p role="status">Loading balance sheet…</p>}{error&&<p role="alert">{error}</p>}
  {visible&&<><ReportCsvCopy rows={()=>balanceSheetRows(visible)}/><div className="pilot-table-wrap"><table className="pilot-table"><caption>Posted asset, liability and equity balances in USD</caption><thead><tr><th scope="col">Account</th><th scope="col">Type</th><th scope="col">Signed balance USD</th></tr></thead><tbody>{visible.rows.map(r=><tr key={r.id}><th scope="row">{r.code}</th><td>{r.kind}</td><td>{signedLedgerDecimal(r.amount_minor)}</td></tr>)}</tbody></table></div>
   <dl>{([['Assets',visible.assets_minor],['Liabilities',visible.liabilities_minor],['Posted equity',visible.equity_minor],['Unclosed income / loss',visible.unclosed_result_minor],['Total equity',visible.total_equity_minor],['Liabilities and equity',visible.liabilities_equity_minor],['Difference',visible.difference_minor]] as const).map(([label,amount])=><div key={label}><dt>{label}</dt><dd>${signedLedgerDecimal(amount)}</dd></div>)}</dl>
   {!visible.rows.length&&<p>No asset, liability or equity accounts are configured. Zero totals do not establish complete books.</p>}
  </>}
 </section>;
}
