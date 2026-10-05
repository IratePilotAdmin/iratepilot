'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, hotelRpc, usd} from '@/lib/pilot';
import {readActiveCashiers, type ActiveCashier} from '@/lib/cashier-active';
import {readGuestCashReceipts, type GuestCashReceipt} from '@/lib/cashier-payment-sources';
import {loadCashPayment, retainCashPayment, acknowledgeCashPayment, acknowledgeCancelledCashPayment, type CashPaymentRequest} from '@/lib/cashier-payment-request';
type Props = {tenant: string; property: string; reservation: string; actor: string; role: string; disabled: boolean; onBusyChange: (busy: boolean) => void; onRecorded: () => Promise<unknown>; recoveryOnly?: boolean};
export function CashierPayment(props: Props) {return <Payment key={[props.tenant, props.property, props.reservation, props.actor, props.role].join(':')} {...props}/>;}
function Payment({tenant, property, reservation, actor, role, disabled, onBusyChange, onRecorded, recoveryOnly = false}: Props) {
  const [loaded, setLoaded] = useState(false), [drawer, setDrawer] = useState<ActiveCashier | null>(null), [sources, setSources] = useState<GuestCashReceipt[]>([]), [pending, setPending] = useState<CashPaymentRequest | null>(null);
  const [kind, setKind] = useState<'external_payment' | 'external_refund'>('external_payment'), [amount, setAmount] = useState(''), [reference, setReference] = useState(''), [reason, setReason] = useState(''), [target, setTarget] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const alive = useRef(false), lock = useRef(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  const scope = {tenant, property, reservation, actor};
  async function verifyActor() {const user = await hotelClient().auth.getUser(); if (user.error || user.data.user?.id !== actor) throw Error('Sign-in changed. Reopen this stay.');}
  async function run(action: 'load' | 'prepare' | 'submit' | 'recover' | 'cancel') {
    if (lock.current || disabled || !['owner', 'manager'].includes(role)) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try {
      await verifyActor(); if (!alive.current) return;
      const saved = loadCashPayment(sessionStorage, scope);
      if (action === 'load') {
        setLoaded(false); setPending(saved); setConfirmed(false); setCancelConfirmed(false);
        if (saved) {setLoaded(true); return;}
        if (recoveryOnly) {setMessage('No saved cash request remains. Refresh the folio before starting another cash transaction.'); return;}
        const active = await hotelRpc<unknown>('active_cashiers', {p_tenant: tenant, p_property: property});
        const receipts = await hotelRpc<unknown>('guest_cash_receipts', {p_tenant: tenant, p_property: property, p_reservation: reservation});
        await verifyActor(); if (!alive.current) return;
        setDrawer(readActiveCashiers(active, tenant, property, actor, role).sessions.find(row => row.is_mine) || null);
        setSources(readGuestCashReceipts(receipts, scope)); setLoaded(true); return;
      }
      if (action === 'prepare') {
        if (recoveryOnly) throw Error('Open the guest folio to record a new cash transaction.');
        if (saved) {setPending(saved); throw Error('Resolve the saved cash transaction first.');}
        if (!loaded || !drawer) throw Error('Open your cashier drawer and load cash payments first.');
        if (!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(amount)) throw Error('Enter a positive amount with at most two decimal places.');
        const [whole, fraction = ''] = amount.split('.'), minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
        if (kind === 'external_refund') {const source = sources.find(row => row.entry_id === target); if (!source || minor > BigInt(source.remaining_minor)) throw Error('Select a cash receipt with enough refundable balance.');}
        const request: CashPaymentRequest = {...scope, version: 1, session: drawer.session_id, request: crypto.randomUUID(), kind, amount_minor: minor.toString(), reference: reference.trim(), reason: reason.trim(), target: kind === 'external_refund' ? target : null};
        retainCashPayment(sessionStorage, request); setPending(request); setConfirmed(false); setCancelConfirmed(false); return;
      }
      if (!pending || !saved || pending.request !== saved.request) throw Error('Load the saved cash transaction again.');
      retainCashPayment(sessionStorage, pending);
      if (action === 'cancel') {
        if (!cancelConfirmed) throw Error('Confirm cancellation of this saved request.');
        const result = await hotelRpc<unknown>('retire_cashier_payment', {p_tenant: tenant, p_property: property, p_session: pending.session, p_reservation: reservation, p_request: pending.request, p_confirmed: true});
        await verifyActor(); if (!alive.current) return;
        acknowledgeCancelledCashPayment(sessionStorage, pending, result); setPending(null); setLoaded(false); setConfirmed(false); setCancelConfirmed(false); setMessage('Unrecorded cash request cancelled. No recorded payment was reversed.'); return;
      }
      let receipt: unknown;
      if (action === 'submit') {
        if (!confirmed) throw Error('Confirm the actual cash exchange.');
        receipt = await hotelRpc<unknown>('record_cashier_payment', {p_tenant: tenant, p_property: property, p_reservation: reservation, p_session: pending.session, p_request: pending.request, p_kind: pending.kind, p_amount_minor: pending.amount_minor, p_reference: pending.reference, p_reason: pending.reason, p_target: pending.target, p_confirmed: true});
      } else {
        const status = await hotelRpc<Record<string, unknown>>('cashier_payment_status', {p_tenant: tenant, p_property: property, p_request: pending.request});
        await verifyActor(); if (!alive.current) return;
        if (status.schema_version !== 1 || status.tenant_id !== tenant || status.property_id !== property || status.actor_id !== actor || status.request_id !== pending.request || typeof status.found !== 'boolean') throw Error('Cash transaction recovery did not match.');
        if (!status.found) {setMessage('No receipt found. Keep this saved request and retry only the same cash exchange.'); return;}
        receipt = status.result;
      }
      await verifyActor(); if (!alive.current) return;
      acknowledgeCashPayment(sessionStorage, pending, receipt); setPending(null); setLoaded(false); setConfirmed(false); setAmount(''); setReference(''); setReason(''); setTarget('');
      setMessage('Cash transaction recorded. Load cash payments before another transaction.');
      await onRecorded();
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to verify the cash transaction. Keep the saved request.');}
    finally {lock.current = false; onBusyChange(false); if (alive.current) setBusy(false);}
  }
  const unavailable = busy || disabled;
  return <section className="pilot-settings"><h3>Guest cash payments</h3><p>Record cash physically received or returned through your own open drawer. This does not process a card payment.</p>
    <button disabled={unavailable} onClick={() => void run('load')}>Load cash payments</button>
    {loaded && !pending && !drawer && <p>Open your cashier drawer before recording guest cash.</p>}
    {loaded && drawer && !pending && !recoveryOnly && <><p>Drawer: {drawer.drawer}</p><label className="field">Cash transaction<select disabled={unavailable} value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="external_payment">Cash received</option><option value="external_refund">Cash refunded</option></select></label>
      {kind === 'external_refund' && <label className="field">Original cash receipt<select disabled={unavailable} value={target} onChange={e => setTarget(e.target.value)}><option value="">Select receipt</option>{sources.filter(row => row.remaining_minor !== '0').map(row => <option key={row.entry_id} value={row.entry_id}>{row.reference} · {usd(Number(row.remaining_minor))} available</option>)}</select></label>}
      <label className="field">Cash amount (USD)<input disabled={unavailable} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label><label className="field">Cash receipt reference<input disabled={unavailable} maxLength={200} value={reference} onChange={e => setReference(e.target.value)}/></label><label className="field">Cash transaction reason<input disabled={unavailable} maxLength={500} value={reason} onChange={e => setReason(e.target.value)}/></label><button disabled={unavailable} onClick={() => void run('prepare')}>Review cash transaction</button></>}
    {pending && <><p>{pending.kind === 'external_payment' ? 'Cash received' : 'Cash refunded'} · {usd(Number(pending.amount_minor))} · {pending.reference}</p><p>{pending.reason}</p><label><input type="checkbox" disabled={unavailable} checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> I verified this actual cash exchange.</label><button disabled={unavailable || !confirmed} onClick={() => void run('submit')}>Record cash transaction / retry</button><button disabled={unavailable} onClick={() => void run('recover')}>Check cash transaction result</button></>}
    {pending && <><label><input type="checkbox" disabled={unavailable} checked={cancelConfirmed} onChange={e => setCancelConfirmed(e.target.checked)}/> Cancel this unrecorded cash request.</label><button disabled={unavailable || !cancelConfirmed} onClick={() => void run('cancel')}>Cancel saved cash request</button></>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
