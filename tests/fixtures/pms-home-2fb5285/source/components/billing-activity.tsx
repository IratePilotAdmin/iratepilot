'use client';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {billingDollars} from './billing-accounts';
type Report = {tenant_id: string; property_id: string; start: string; end_exclusive: string; time_zone: string; received_minor: string; refunded_minor: string; corrected_minor: string; rows: {payment_id: string; account_name: string; local_date: string; kind: string; amount_minor: string; method: string}[]};
export function BillingActivity(props: {tenant: string; property: string}) {return <ScopedActivity key={`${props.tenant}:${props.property}`} {...props}/>;}
function ScopedActivity({tenant, property}: {tenant: string; property: string}) {
  const [report, setReport] = useState<Report | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => {generation.current += 1;}, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const start = String(form.get("start") ?? ""), end = String(form.get("end") ?? "");
    if (!start || !end || end <= start) {setError('Choose a start date and a later end date.'); return;}
    const request = ++generation.current;setBusy(true);setError('');setReport(null);
    try {
      const data = await hotelRpc<Report>('billing_payment_activity', {p_tenant: tenant, p_property: property, p_start: start, p_end: end});
      if (request !== generation.current) return;
      if (data.tenant_id !== tenant || data.property_id !== property || data.start !== start || data.end_exclusive !== end) throw Error('Report did not match your selection. Please retry.');
      setReport(data);
    } catch (failure) {if (request === generation.current) setError(failure instanceof Error ? failure.message : 'Unable to load activity.');}
    finally {if (request === generation.current) setBusy(false);}
  }
  return <section className="card" aria-busy={busy}>
    <h2>Account payment activity</h2>
    <p>Recorded company and group payments. Dates use the property’s time zone; the end date is excluded.</p>
    <form className="pilot-actions" onSubmit={event => void submit(event)}>
      <label>Start date<input type="date" required disabled={busy} name="start"/></label>
      <label>End date (excluded)<input type="date" required disabled={busy} name="end"/></label>
      <button className="secondary" disabled={busy} type="submit">Show activity</button>
    </form>
    {busy && <p role="status">Loading payment activity…</p>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
    {report && <>
      <p>{report.start} to before {report.end_exclusive} · {report.time_zone}</p>
      <dl><dt>Receipts</dt><dd>{billingDollars(report.received_minor)}</dd><dt>Refunds</dt><dd>{billingDollars(report.refunded_minor)}</dd><dt>Record corrections</dt><dd>{billingDollars(report.corrected_minor)}</dd></dl>
      <p>Corrections adjust records; they do not move money. Unclassified entries have no confirmed payment method.</p>
      {report.rows.length === 0 && <p>No account payment activity in this period.</p>}
      {report.rows.map(row => <p key={row.payment_id}>{row.local_date} · {row.account_name} · {row.kind === 'external_payment' ? 'Receipt' : row.kind === 'external_refund' ? 'Refund' : 'Correction'} · {billingDollars(row.amount_minor)} · {row.method === 'cash' ? 'Cash' : row.method === 'not_money_movement' ? 'Record adjustment' : 'Unclassified method'}</p>)}
    </>}
  </section>;
}
