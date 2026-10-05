'use client';
import {AccountingPeriodCloseAction} from '@/components/accounting-period-close-action';
import {useEffect,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {accountingUsd} from '@/lib/accounting';
import {readPeriodReview,type PeriodReview} from '@/lib/accounting-period';
export function AccountingPeriodReview({membership,period}:{membership:Membership;period:string}){
 const {tenant_id,property_id,role}=membership;
 const [data,setData]=useState<PeriodReview|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{let current=true;setData(null);setError('');setLoading(true);if(role!=='owner'&&role!=='manager'){setLoading(false);return;}hotelRpc<unknown>('gl_period_review',{p_tenant:tenant_id,p_property:property_id,p_period:period}).then(value=>{const parsed=readPeriodReview(value,tenant_id,property_id,period);if(current)setData(parsed);}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to review period.');}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[tenant_id,property_id,role,period,revision]);
 if(role!=='owner'&&role!=='manager')return <p>Period review requires manager access.</p>;
 const visible=data?.tenant_id===tenant_id&&data.property_id===property_id&&data.period_id===period?data:null;
 return <section aria-label="Accounting period review" aria-busy={loading}><h3>Period review</h3><button className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh period review</button>{loading&&<p role="status">Loading period review…</p>}{error&&<p className="pilot-error" role="alert">{error}</p>}{visible&&<><p>{visible.start_date} through {visible.end_date_exclusive} (end excluded) · {visible.closed?'Closed':'Open'}</p><dl><dt>Posted journals</dt><dd>{visible.journal_count}</dd><dt>Debits</dt><dd>{accountingUsd(visible.debit_minor)}</dd><dt>Credits</dt><dd>{accountingUsd(visible.credit_minor)}</dd><dt>Unposted nightly charges</dt><dd>{visible.pending_service_count}</dd><dt>Unposted corrections</dt><dd>{visible.pending_correction_count}</dd><dt>Unposted payment records</dt><dd>{visible.pending_payment_count}</dd></dl>{visible.debit_minor!==visible.credit_minor&&<p role="alert">Debits and credits do not balance. Resolve the difference before closing.</p>}{visible.pending_service_count+visible.pending_correction_count+visible.pending_payment_count>0&&<p>Post the remaining saved charges, corrections and payment records before closing this period.</p>}<p>This review covers recorded journals, saved service entries and recorded payment sources. Confirm operational days and any external records are complete separately.</p></>}<AccountingPeriodCloseAction membership={membership} preview={loading?null:visible}/></section>;
}

