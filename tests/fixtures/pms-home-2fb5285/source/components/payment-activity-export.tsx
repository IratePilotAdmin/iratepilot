'use client';
import {useState} from 'react';
import type {PaymentSources} from '@/lib/payment-accounting';
import {paymentActivityRows,paymentActivityTotals} from '@/lib/payment-activity';
import {balanceDecimal} from '@/lib/guest-balance-register';
import {downloadReport} from '@/lib/report-export';
import {ReportCsvCopy} from '@/components/report-csv-copy';
export function PaymentActivityExport({sources}:{sources:PaymentSources}){
 const [error,setError]=useState('');const totals=paymentActivityTotals(sources);
 function download(){try{setError('');downloadReport('recorded-payment-activity-'+sources.property_id+'-'+sources.start_date,paymentActivityRows(sources));}catch(cause){setError(cause instanceof Error?cause.message:'Unable to export payment activity.');}}
 return <section aria-label="Recorded payment activity export"><h3>Recorded payment activity</h3><p>{totals.count} records / {totals.posted} accounting posted / {totals.unposted} unposted</p><p>Payments ${balanceDecimal(totals.payments)} / Refunds ${balanceDecimal(totals.refunds)} / Corrections ${balanceDecimal(totals.corrections)} / Net recorded movement ${balanceDecimal(totals.net)}</p><p>These totals use recording dates, not settlement or journal dates. Accounting status reflects the loaded records; reload after posting.</p><button className="secondary" onClick={download}>Export payment activity CSV</button><ReportCsvCopy rows={()=>paymentActivityRows(sources)}/>{error&&<p role="alert" className="pilot-error">{error}</p>}</section>;
}
