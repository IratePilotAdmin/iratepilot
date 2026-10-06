'use client';

import {useEffect,useState} from 'react';
import {AccountingAdjustments} from '@/components/accounting-adjustments';
import {ReportCsvCopy} from '@/components/report-csv-copy';

import {hotelRpc,type Membership} from '@/lib/pilot';

import {accountingUsd,readLedgerReport,ledgerReportRows,type LedgerReport} from '@/lib/accounting';

import {downloadReport} from '@/lib/report-export';

export function AccountingLedger({membership,start,end,businessDate}:{membership:Membership;start:string;end:string;businessDate?:string}){

 const [page,setPage]=useState(0);
 const [selectedJournal,setSelectedJournal]=useState<string|null>(null);

 const {tenant_id,property_id,role}=membership;const [report,setReport]=useState<LedgerReport|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);

 useEffect(()=>{let current=true;setReport(null);setError('');setPage(0);setSelectedJournal(null);if(role!=='owner'&&role!=='manager'){setLoading(false);return;}setLoading(true);hotelRpc<unknown>('gl_export',{p_tenant:tenant_id,p_property:property_id,p_start:start,p_end:end}).then(value=>{const data=readLedgerReport(value,{tenant_id,property_id,start,end});if(current)setReport(data);}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to load ledger.');}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[tenant_id,property_id,role,start,end,revision]);

 if(role!=='owner'&&role!=='manager')return <p>Ledger reports are available to owners and managers.</p>;

 const visible=report?.tenant_id===tenant_id&&report.property_id===property_id&&report.start_date===start&&report.end_date_exclusive===end?report:null;

 function exportCsv(){if(!visible||loading||error)return;try{downloadReport('general-ledger-'+property_id+'-'+start+'-'+end,ledgerReportRows(visible));}catch(cause){setError(cause instanceof Error?cause.message:'Unable to export ledger.');}}

 return <section aria-label="General ledger" aria-busy={loading}><div className="section-top"><h2>General ledger</h2><button className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh ledger</button><button className="secondary" disabled={!visible||loading||!!error} onClick={exportCsv}>Export ledger CSV</button></div><p>{start} through {end} (end excluded). Posted journal lines in USD.</p>{loading&&<p role="status">Loading ledger…</p>}{error&&<p className="pilot-error" role="alert">{error}</p>}{visible&&!loading&&!error&&<ReportCsvCopy rows={()=>ledgerReportRows(visible)}/>} {visible&&<><p>{visible.line_count} lines · Debits {accountingUsd(visible.debit_total_minor)} · Credits {accountingUsd(visible.credit_total_minor)}</p><nav aria-label="Ledger pages"><button type="button" className="secondary" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Previous page</button><span role="status">Page {page+1} of {Math.max(1,Math.ceil(visible.lines.length/100))} · Up to 100 lines per page</span><button type="button" className="secondary" disabled={(page+1)*100>=visible.lines.length} onClick={()=>setPage(n=>n+1)}>Next page</button></nav><div className="pilot-table-wrap"><table className="pilot-table"><caption>Posted ledger lines</caption><thead><tr>{['Date','Journal','Account','Description','Debit','Credit','Source'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{visible.lines.slice(page*100,(page+1)*100).map(l=><tr key={l.journal_id+'/'+l.line_no}><td>{l.posting_date}</td><td>{businessDate?<button type="button" className="secondary" disabled={loading||!!error} onClick={()=>setSelectedJournal(l.journal_id)} aria-label={"Review journal "+l.journal_id+" line "+l.line_no}>{l.journal_id}</button>:l.journal_id} · {l.line_no}</td><td>{l.account_code} · {l.current_account_name}</td><td>{l.description}</td><td>{accountingUsd(l.debit_minor)}</td><td>{accountingUsd(l.credit_minor)}</td><td>{l.source_kind} · {l.source_id}</td></tr>)}</tbody></table>{!visible.lines.length&&<p>No posted journals in this date range.</p>}</div></>}{visible&&!loading&&!error&&businessDate&&selectedJournal&&visible.lines.some(line=>line.journal_id===selectedJournal)&&<><button type="button" className="secondary" onClick={()=>setSelectedJournal(null)}>Close journal review</button><AccountingAdjustments key={tenant_id+'/'+property_id+'/'+selectedJournal} membership={membership} businessDate={businessDate} journalId={selectedJournal}/></>}</section>;

}

