'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, hotelRpc, type Membership} from '@/lib/pilot';
import {readCashierReview, type CashierReview as Review} from '@/lib/cashier-review';
import {CashierClose} from '@/components/cashier-close';
import {reportUsd} from '@/lib/report-export';

export function CashierReview({membership, session}: {membership: Membership; session: string}) {
  return <Count key={JSON.stringify([membership, session])} membership={membership} session={session}/>;
}
function Count({membership, session}: {membership: Membership; session: string}) {
  const [amount, setAmount] = useState('0.00'), [review, setReview] = useState<Review | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function load(event: React.FormEvent) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(''); setReview(null);
    try {
      if (!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(amount)) throw Error('Enter counted cash with at most two decimal places.');
      const [dollars, cents = ''] = amount.split('.'), counted = (BigInt(dollars) * BigInt(100) + BigInt(cents.padEnd(2, '0'))).toString();
      const user = await hotelClient().auth.getUser(); if (user.error || !user.data.user) throw Error('Sign in to review cash.');
      const actor = user.data.user.id;
      const result = await hotelRpc<unknown>('review_cashier', {p_tenant: membership.tenant_id, p_property: membership.property_id, p_session: session, p_counted_minor: counted});
      const parsed = readCashierReview(result, {tenant: membership.tenant_id, property: membership.property_id, actor, session}, counted);
      const again = await hotelClient().auth.getUser(); if (again.error || again.data.user?.id !== actor) throw Error('Sign-in changed. Review cash again.');
      if (alive.current) setReview(parsed);
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to review cash.');}
    finally {if (alive.current) {lock.current = false; setBusy(false);}}
  }
  return <section className="card"><h3>Review drawer cash</h3><form onSubmit={load}><label className="field">Counted cash (USD)<input inputMode="decimal" disabled={busy} value={amount} onChange={event => {setReview(null); setAmount(event.target.value);}}/></label><button disabled={busy}>{busy ? 'Reviewing…' : 'Review cash count'}</button></form>
    {error && <p role="alert">{error}</p>}
    {review && <><h4>{review.drawer}</h4><dl>{[
      ['Opening cash', review.opening_minor], ['Guest cash receipts', review.receipts_minor], ['Guest cash refunds', review.refunds_minor], ['Cash added', review.cash_in_minor], ['Cash removed', review.cash_out_minor], ['Expected cash', review.expected_minor], ['Counted cash', review.counted_minor], ['Over / short', review.variance_minor],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{reportUsd(Number(value))}</dd></div>)}</dl><p>{review.variance === 'balanced' ? 'Cash balances.' : review.variance === 'short' ? 'Cash is short. Record an explanation when closing.' : 'Cash is over. Record an explanation when closing.'}</p><p>{review.active ? 'Session is active. This review does not close the drawer.' : 'Session is no longer active.'}</p><CashierClose membership={membership} review={review}/></>}
  </section>;
}
