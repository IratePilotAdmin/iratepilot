'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, hotelRpc, type Membership} from '@/lib/pilot';
import {acknowledgeCustody, acknowledgeCancelledCustody, loadCustody, retainCustody, type CustodyRequest} from '@/lib/cashier-custody-request';
import {reportUsd} from '@/lib/report-export';
export function CashierCustody({membership, session, recoveryOnly = false}: {membership: Membership; session: string; recoveryOnly?: boolean}) {return <Movement key={JSON.stringify([membership, session])} membership={membership} session={session} recoveryOnly={recoveryOnly}/>;}
function Movement({membership, session, recoveryOnly}: {membership: Membership; session: string; recoveryOnly: boolean}) {
  const [actor, setActor] = useState(''), [pending, setPending] = useState<CustodyRequest | null>(null), [kind, setKind] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function run(action: 'load' | 'prepare' | 'submit' | 'recover' | 'cancel') {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const user = await hotelClient().auth.getUser(); if (user.error || !user.data.user) throw Error('Sign in to record drawer cash.');
      if (!alive.current) return;
      const current = user.data.user.id, scope = {actor: current, tenant: membership.tenant_id, property: membership.property_id, session};
      if (action !== 'load' && actor !== current) {setActor(''); setPending(null); throw Error('Sign-in changed. Load cash movements again.');}
      const saved = loadCustody(sessionStorage, scope);
      if (action === 'load') {setActor(current); setPending(saved); setConfirmed(false); setCancelConfirmed(false); return;}
      if (action === 'prepare') {
        if (recoveryOnly) throw Error('Select your active drawer to record a new movement.');
        if (saved) {setPending(saved); throw Error('Resolve the saved movement first.');}
        if (!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(amount)) throw Error('Enter a positive cash amount with at most two decimal places.');
        const [dollars, cents = ''] = amount.split('.');
        const request: CustodyRequest = {...scope, version: 1, request: crypto.randomUUID(), kind, amount_minor: (BigInt(dollars) * BigInt(100) + BigInt(cents.padEnd(2, '0'))).toString(), reason: reason.trim()};
        retainCustody(sessionStorage, request); setPending(request); setConfirmed(false); setCancelConfirmed(false); return;
      }
      if (!pending || !saved || saved.request !== pending.request) throw Error('Reload the saved movement.');
      retainCustody(sessionStorage, pending);
      if (action === 'cancel') {
        if (!cancelConfirmed) throw Error('Confirm cancellation of this saved movement.');
        const receipt = await hotelRpc<unknown>('retire_cashier_custody', {p_tenant: scope.tenant, p_property: scope.property, p_session: session, p_request: pending.request, p_confirmed: true});
        const again = await hotelClient().auth.getUser(); if (again.error || again.data.user?.id !== current) throw Error('Sign-in changed. Retry cancellation after signing in.');
        if (!alive.current) return;
        acknowledgeCancelledCustody(sessionStorage, pending, receipt); setPending(null); setConfirmed(false); setCancelConfirmed(false); setMessage('Saved cash movement cancelled.'); return;
      }
      let receipt: unknown;
      if (action === 'submit') {
        if (!confirmed) throw Error('Confirm this physical cash movement.');
        receipt = await hotelRpc<unknown>('post_cashier_custody', {p_tenant: scope.tenant, p_property: scope.property, p_session: session, p_request: pending.request, p_kind: pending.kind, p_amount_minor: pending.amount_minor, p_reason: pending.reason, p_confirmed: true});
      } else {
        const status = await hotelRpc<Record<string, unknown>>('cashier_custody_status', {p_tenant: scope.tenant, p_property: scope.property, p_request: pending.request});
        if (status.schema_version !== 1 || status.tenant_id !== scope.tenant || status.property_id !== scope.property || status.actor_id !== current || status.request_id !== pending.request || typeof status.found !== 'boolean') throw Error('Cash movement recovery did not match.');
        if (!status.found) {if (alive.current) setMessage('No recorded movement found. The saved request remains available.'); return;}
        receipt = status.result;
      }
      const again = await hotelClient().auth.getUser(); if (again.error || again.data.user?.id !== current) throw Error('Sign-in changed. Recover after signing in again.');
      if (!alive.current) return;
      acknowledgeCustody(sessionStorage, pending, receipt); setPending(null); setConfirmed(false); setAmount(''); setReason(''); setMessage('Cash movement recorded. Refresh the drawer cash review before closing.');
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to record cash. Recover the saved request.');}
    finally {if (alive.current) {lock.current = false; setBusy(false);}}
  }
  return <section className="card"><h3>Cash added or removed</h3><p>Record physical drawer cash movements. Record guest payments against the guest’s stay.</p><button disabled={busy} onClick={() => void run('load')}>Load cash movements</button>
    {actor && !pending && !recoveryOnly && <><label className="field">Movement<select disabled={busy} value={kind} onChange={event => setKind(event.target.value as 'cash_in' | 'cash_out')}><option value="cash_in">Cash added</option><option value="cash_out">Cash removed</option></select></label><label className="field">Cash amount (USD)<input disabled={busy} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)}/></label><label className="field">Movement reason<input disabled={busy} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></label><button disabled={busy} onClick={() => void run('prepare')}>Review cash movement</button></>}
    {pending && <><p>{pending.kind === 'cash_in' ? 'Cash added' : 'Cash removed'}: {reportUsd(Number(pending.amount_minor))} · {pending.reason}</p><label><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> I confirm this physical cash movement.</label><button disabled={busy || !confirmed} onClick={() => void run('submit')}>Record cash movement / retry</button><button disabled={busy} onClick={() => void run('recover')}>Check cash movement result</button><label><input type="checkbox" disabled={busy} checked={cancelConfirmed} onChange={event => setCancelConfirmed(event.target.checked)}/> Cancel this saved cash movement.</label><button disabled={busy || !cancelConfirmed} onClick={() => void run('cancel')}>Cancel saved cash movement</button></>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
