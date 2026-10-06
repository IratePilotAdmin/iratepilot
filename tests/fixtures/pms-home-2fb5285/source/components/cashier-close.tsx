'use client';
import {cashierResponse} from '@/lib/cashier-response';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, hotelRpc, type Membership} from '@/lib/pilot';
import type {CashierReview} from '@/lib/cashier-review';
import {acknowledgeCashierClose, acknowledgeCancelledCashierClose, loadCashierClose, retainCashierClose, type CashierCloseRequest} from '@/lib/cashier-close-request';
import {reportUsd} from '@/lib/report-export';
export function CashierClose({membership, review, recoveryOnly = false}: {membership: Membership; review: CashierReview; recoveryOnly?: boolean}) {return <Close key={JSON.stringify([membership, review])} membership={membership} review={review} recoveryOnly={recoveryOnly}/>;}
function Close({membership, review, recoveryOnly}: {membership: Membership; review: CashierReview; recoveryOnly: boolean}) {
  const [pending, setPending] = useState<CashierCloseRequest | null>(null), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false), [resolved, setResolved] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function run(kind: 'prepare' | 'load' | 'submit' | 'recover' | 'cancel') {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const user = await cashierResponse(hotelClient().auth.getUser());
      if (user.error || !user.data.user || user.data.user.id !== review.actor_id) throw Error('Sign-in changed. Load a fresh cash review.');
      if (!alive.current) return;
      const scope = {actor: user.data.user.id, tenant: membership.tenant_id, property: membership.property_id, session: review.session_id};
      const saved = loadCashierClose(sessionStorage, scope);
      if (kind === 'load') {setPending(saved); setConfirmed(false); if (!saved) setMessage('No saved closing request for this drawer.'); return;}
      if (kind === 'prepare') {
        if (recoveryOnly || resolved) throw Error('Load a fresh drawer review before preparing a close.');
        if (saved) {setPending(saved); setConfirmed(false); throw Error('Resolve the saved close request first.');}
        const request: CashierCloseRequest = {...scope, version: 1, request: crypto.randomUUID(), review, reason: reason.trim()};
        retainCashierClose(sessionStorage, request); setPending(request); setConfirmed(false); return;
      }
      if (!pending || !saved || pending.request !== saved.request) throw Error('Load the saved closing request first.');
      // Reject a changed saved payload before either retrying or acknowledging it.
      retainCashierClose(sessionStorage, pending);
      if (kind === 'cancel') {
        if (!cancelConfirmed) throw Error('Confirm cancellation of the saved closing attempt.');
        const receipt = await cashierResponse(hotelRpc<unknown>('retire_cashier_close', {p_tenant: scope.tenant, p_property: scope.property, p_session: scope.session, p_request: pending.request, p_confirmed: true}));
        const again = await cashierResponse(hotelClient().auth.getUser()); if (again.error || again.data.user?.id !== scope.actor) throw Error('Sign-in changed. Retry cancellation after signing in.');
        if (!alive.current) return;
        acknowledgeCancelledCashierClose(sessionStorage, pending, receipt); setResolved(true); setPending(null); setConfirmed(false); setCancelConfirmed(false); setMessage('Closing attempt cancelled. Load a fresh cash review before closing.'); return;
      }
      let receipt: unknown;
      if (kind === 'submit') {
        if (!confirmed) throw Error('Confirm the saved cash count and explanation.');
        receipt = await cashierResponse(hotelRpc<unknown>('close_cashier', {p_tenant: scope.tenant, p_property: scope.property, p_session: scope.session, p_request: pending.request, p_counted_minor: pending.review.counted_minor, p_review: pending.review, p_reason: pending.reason, p_confirmed: true}));
      } else {
        const status = await cashierResponse(hotelRpc<Record<string, unknown>>('cashier_close_status', {p_tenant: scope.tenant, p_property: scope.property, p_request: pending.request}));
        if (status.schema_version !== 1 || status.tenant_id !== scope.tenant || status.property_id !== scope.property || status.actor_id !== scope.actor || status.request_id !== pending.request || typeof status.found !== 'boolean') throw Error('Close recovery did not match this request.');
        if (!status.found) {if (alive.current) setMessage('No completed close found. Your saved request remains available.'); return;}
        receipt = status.result;
      }
      const again = await cashierResponse(hotelClient().auth.getUser()); if (again.error || again.data.user?.id !== scope.actor) throw Error('Sign-in changed. Recover this close after signing in again.');
      if (!alive.current) return;
      acknowledgeCashierClose(sessionStorage, pending, receipt); setResolved(true); setPending(null); setConfirmed(false); setMessage('Drawer close confirmed. Reload active drawers and closing reports.');
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to close. Keep the saved request for recovery.');}
    finally {if (alive.current) {lock.current = false; setBusy(false);}}
  }
  return <section><h4>Close this drawer</h4><button disabled={busy} onClick={() => void run('load')}>Load saved close</button>
    {!pending && !resolved && !recoveryOnly && review.can_close && <><label className="field">Closing explanation<input maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)}/></label><button disabled={busy} onClick={() => void run('prepare')}>Prepare closing confirmation</button></>}
    {pending && <><p>Saved count {reportUsd(Number(pending.review.counted_minor))} · Over / short {reportUsd(Number(pending.review.variance_minor))}</p><p>{pending.reason}</p><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/> I confirm this saved count and explanation.</label><button disabled={busy || !confirmed} onClick={() => void run('submit')}>Confirm drawer close / retry</button><button disabled={busy} onClick={() => void run('recover')}>Check closing result</button><label><input type="checkbox" disabled={busy} checked={cancelConfirmed} onChange={event => setCancelConfirmed(event.target.checked)}/> Cancel this saved closing attempt.</label><button disabled={busy || !cancelConfirmed} onClick={() => void run('cancel')}>Cancel saved close</button></>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
