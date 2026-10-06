'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, type Membership} from '@/lib/pilot';
import {pendingCashierCloses, type CashierCloseRequest} from '@/lib/cashier-close-request';
import {pendingCustody, type CustodyRequest} from '@/lib/cashier-custody-request';
import {CashierCustody} from '@/components/cashier-custody';
import {CashierClose} from '@/components/cashier-close';
import {pendingCashPayments, type CashPaymentRequest} from '@/lib/cashier-payment-request';
import {CashierPayment} from '@/components/cashier-payment';
export function CashierCloseRecovery({membership}: {membership: Membership}) {return <Recovery key={JSON.stringify(membership)} membership={membership}/>;}
function Recovery({membership}: {membership: Membership}) {
  const [requests, setRequests] = useState<CashierCloseRequest[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [movements, setMovements] = useState<CustodyRequest[]>([]);
  const [payments, setPayments] = useState<CashPaymentRequest[]>([]);
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function load() {
    if (lock.current) return; lock.current = true; setBusy(true); setRequests(null); setMovements([]); setPayments([]); setError('');
    try {
      const user = await hotelClient().auth.getUser(); if (user.error || !user.data.user) throw Error('Sign in to recover drawer closes.');
      if (!alive.current) return;
      setPayments(pendingCashPayments(sessionStorage, {actor: user.data.user.id, tenant: membership.tenant_id, property: membership.property_id}));
      setMovements(pendingCustody(sessionStorage, {actor: user.data.user.id, tenant: membership.tenant_id, property: membership.property_id}));
      setRequests(pendingCashierCloses(sessionStorage, {actor: user.data.user.id, tenant: membership.tenant_id, property: membership.property_id}));
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to read closing recovery data.');}
    finally {if (alive.current) {lock.current = false; setBusy(false);}}
  }
  return <section className="card"><h2>Recover cashier activity</h2><p>Find closing attempts, guest cash requests, and cash movements saved in this browser, including drawers that are no longer active.</p><button disabled={busy} onClick={() => void load()}>Find saved cashier activity</button>{error && <p role="alert">{error}</p>}{requests?.length === 0 && <p>No saved drawer closes for this signed-in property.</p>}{requests?.map(request => <div key={request.request}><h3>{request.review.drawer}</h3><CashierClose membership={membership} review={request.review} recoveryOnly/></div>)}{movements.map(request => <div key={request.request}><h3>Saved cash movement</h3><CashierCustody membership={membership} session={request.session} recoveryOnly/></div>)}{payments.map(request => <div key={request.request}><h3>Saved guest cash request</h3><p>{request.reference}</p><CashierPayment tenant={request.tenant} property={request.property} reservation={request.reservation} actor={request.actor} role={membership.role} disabled={busy} onBusyChange={value => {lock.current = value; setBusy(value);}} onRecorded={async () => {}} recoveryOnly/></div>)}</section>;
}
