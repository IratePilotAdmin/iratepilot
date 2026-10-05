'use client';
import {cashierResponse} from '@/lib/cashier-response';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, hotelRpc, type Membership} from '@/lib/pilot';
import {acknowledgeCashierOpen, acknowledgeCancelledCashierOpen, readCashierOpen, loadCashierOpen, retainCashierOpen, type CashierOpenRequest} from '@/lib/cashier-open-request';
import {reportUsd} from '@/lib/report-export';

export function CashierOpen({membership}: {membership: Membership}) {return <Opening key={JSON.stringify(membership)} membership={membership}/>;}
function Opening({membership}: {membership: Membership}) {
  const [actor, setActor] = useState(''), [pending, setPending] = useState<CashierOpenRequest | null>(null);
  const [drawer, setDrawer] = useState(''), [amount, setAmount] = useState('0.00'), [confirmed, setConfirmed] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function action(kind: 'load' | 'prepare' | 'submit' | 'recover' | 'cancel') {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const user = await cashierResponse(hotelClient().auth.getUser());
      if (user.error || !user.data.user) throw Error('Sign in before opening a drawer.');
      const current = user.data.user.id;
      if (!alive.current) return;
      if (kind !== 'load' && actor !== current) {setActor(''); setPending(null); throw Error('Sign-in changed. Load your opening workspace again.');}
      const scope = {actor: current, tenant: membership.tenant_id, property: membership.property_id};
      const saved = loadCashierOpen(sessionStorage, scope);
      if (kind === 'load') {setActor(current); setPending(saved); setConfirmed(false); setCancelConfirmed(false); return;}
      if (kind === 'prepare') {
        if (saved) {setPending(saved); throw Error('Resolve your saved opening first.');}
        if (!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(amount)) throw Error('Enter opening cash in dollars, with at most two decimal places.');
        const [dollars, cents = ''] = amount.split('.');
        const request: CashierOpenRequest = {...scope, version: 1, request: crypto.randomUUID(), drawer: drawer.trim(), opening_minor: (BigInt(dollars) * BigInt(100) + BigInt(cents.padEnd(2, '0'))).toString()};
        retainCashierOpen(sessionStorage, request); setPending(request); setConfirmed(false); setCancelConfirmed(false); return;
      }
      if (!pending || !saved || JSON.stringify(saved) !== JSON.stringify(readCashierOpen(pending, scope))) throw Error('Saved opening changed. Load your opening workspace again.');
      if (kind === 'cancel') {
        if (!cancelConfirmed) throw Error('Confirm cancellation of this saved opening.');
        const cancelled = await cashierResponse(hotelRpc<unknown>('retire_cashier_open', {p_tenant: scope.tenant, p_property: scope.property, p_request: pending.request, p_drawer: pending.drawer, p_opening_minor: pending.opening_minor, p_confirmed: true}));
        const again = await cashierResponse(hotelClient().auth.getUser());
        if (again.error || again.data.user?.id !== current) throw Error('Sign-in changed. Retry cancellation after signing in again.');
        if (!alive.current) return;
        acknowledgeCancelledCashierOpen(sessionStorage, pending, cancelled); setPending(null); setCancelConfirmed(false); setConfirmed(false); setMessage('Saved opening cancelled. You can prepare a new opening.'); return;
      }
      let receipt: unknown;
      if (kind === 'submit') {
        if (!confirmed) throw Error('Confirm the drawer and opening cash first.');
        receipt = await cashierResponse(hotelRpc<unknown>('open_cashier_session', {p_tenant: scope.tenant, p_property: scope.property, p_request: pending.request, p_drawer: pending.drawer, p_opening_minor: pending.opening_minor, p_confirmed: true}));
      } else {
        const status = await cashierResponse(hotelRpc<Record<string, unknown>>('cashier_session_open_status', {p_tenant: scope.tenant, p_property: scope.property, p_request: pending.request}));
        if (status.schema_version !== 1 || status.actor_id !== current || status.tenant_id !== scope.tenant || status.property_id !== scope.property || status.request_id !== pending.request || typeof status.found !== 'boolean') throw Error('Opening recovery response did not match.');
        if (!status.found) {if (alive.current) setMessage('No completed opening found. The saved request remains available to retry.'); return;}
        receipt = status.result;
      }
      const again = await cashierResponse(hotelClient().auth.getUser());
      if (again.error || again.data.user?.id !== current) throw Error('Sign-in changed. Recover the saved opening after signing in again.');
      if (!alive.current) return;
      acknowledgeCashierOpen(sessionStorage, pending, receipt); setPending(null); setConfirmed(false); setMessage('Drawer opening confirmed. Reload active drawers to view the session.');
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to complete opening. Your saved request remains available.');}
    finally {if (alive.current) {lock.current = false; setBusy(false);}}
  }
  return <section className="card"><h2>Open your cashier drawer</h2>
    <button disabled={busy} onClick={() => void action('load')}>Load opening workspace</button>
    {actor && !pending && <form onSubmit={event => {event.preventDefault(); void action('prepare');}}><label className="field">Drawer name<input disabled={busy} value={drawer} onChange={event => setDrawer(event.target.value)} maxLength={80}/></label><label className="field">Opening cash (USD)<input disabled={busy} value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal"/></label><button disabled={busy}>Review opening</button></form>}
    {pending && <><p>{pending.drawer} · Opening cash {reportUsd(Number(pending.opening_minor))}</p><label><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> I counted this opening cash and confirm this drawer.</label><button disabled={busy || !confirmed} onClick={() => void action('submit')}>Confirm opening / retry</button><button disabled={busy} onClick={() => void action('recover')}>Check opening result</button><label><input type="checkbox" disabled={busy} checked={cancelConfirmed} onChange={event => setCancelConfirmed(event.target.checked)}/> Cancel this saved opening attempt.</label><button disabled={busy || !cancelConfirmed} onClick={() => void action('cancel')}>Cancel saved opening</button></>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
