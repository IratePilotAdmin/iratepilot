'use client';

import {useEffect, useRef, useState} from 'react';
import {hotelRpc, formText, type HotelWorkspace} from '@/lib/pilot';
import {useClientReady} from '@/lib/client-ready';
import {definitiveBookingRejection} from '@/lib/pending-booking';
import {folioMoney, balanceBasis} from '@/lib/folio-reports';
import {reservationStatus} from '@/lib/reservation-status';
import {cancellationKey, validCancellation, validateCancellationPreview, validateCancellationStatus, cancellationBlockers, type CancellationCommand, type CancellationPreview} from '@/lib/cancellations';

type Scope = {actor: string; tenant: string; property: string; reservation: string};
type ActionProps = Scope & {canReview: boolean; disabled: boolean; onOpen: () => void};
type PanelProps = Scope & {onBusyChange: (busy: boolean) => void; onSaved: () => Promise<void>; onReviewFolio: () => void; onReviewServiceDays: () => void};
const staffRoles = ['owner', 'manager', 'staff'];
const scopeKey = (props: Scope) => props.actor + ':' + props.tenant + ':' + props.property + ':' + props.reservation;

export function CancellationAction(props: ActionProps) {
  return useClientReady() ? <Action key={scopeKey(props)} {...props}/> : null;
}
function Action({actor, tenant, property, reservation, canReview, disabled, onOpen}: ActionProps) {
  const [pending] = useState(() => {try {return sessionStorage.getItem(cancellationKey(actor, tenant, property, reservation)) !== null;} catch {return true;}});
  return canReview || pending ? <button className="secondary" disabled={disabled} onClick={onOpen}>{pending ? 'Recover cancellation request' : 'Cancel reservation…'}</button> : null;
}

export function CancellationPanel(props: PanelProps) {
  return useClientReady() ? <CancellationForm key={scopeKey(props)} {...props}/> : <p>Loading cancellation recovery…</p>;
}

function CancellationForm({actor, tenant, property, reservation, onBusyChange, onSaved, onReviewFolio, onReviewServiceDays}: PanelProps) {
  const key = cancellationKey(actor, tenant, property, reservation);
  const [initial] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return {pending: null, error: ''};
      const command: unknown = JSON.parse(raw);
      if (!validCancellation(command, reservation)) throw Error();
      return {pending: command, error: ''};
    } catch {return {pending: null, error: 'The saved cancellation request cannot be read. Reconcile it before preparing another cancellation.'};}
  });
  const [pending, setPending] = useState<CancellationCommand | null>(initial.pending);
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.error), [readError, setReadError] = useState(''), [notice, setNotice] = useState('');
  const alive = useRef(true), sequence = useRef(0), lock = useRef(false), callbacks = useRef({onBusyChange, onSaved});
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {callbacks.current = {onBusyChange, onSaved};}, [onBusyChange, onSaved]);

  function checkedRead(value: unknown, workspace: HotelWorkspace) {
    if (workspace.property.id !== property || !staffRoles.includes(workspace.role)) throw Error('Current staff access to this property could not be verified.');
    return {preview: validateCancellationPreview(value, reservation), role: workspace.role};
  }
  async function refresh() {
    const seq = ++sequence.current;
    clearTimeout(readTimer.current);
    let timer: ReturnType<typeof setTimeout> | undefined;
    setPreview(null); setRole(''); setReadError(''); setLoading(true);
    try {
      const [value, workspace] = await Promise.race([Promise.all([
        hotelRpc<unknown>('cancellation_preview', {p_tenant: tenant, p_property: property, p_reservation: reservation}),
        hotelRpc<HotelWorkspace>('workspace', {p_tenant: tenant, p_property: property}),
      ]), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('Loading the cancellation review took too long. Check your connection and refresh the review.')), 15000);
        readTimer.current = timer;
      })]);
      const current = checkedRead(value, workspace);
      if (alive.current && sequence.current === seq) {setPreview(current.preview); setRole(current.role);}
    } catch (cause) {if (alive.current && sequence.current === seq) setReadError(cause instanceof Error ? cause.message : 'Unable to load the current cancellation review.');}
    finally {clearTimeout(timer); if (alive.current && sequence.current === seq) setLoading(false);}
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {alive.current = false; ++sequence.current; clearTimeout(readTimer.current); if (lock.current) callbacks.current.onBusyChange(false);};
  }, [tenant, property, reservation]);

  async function task(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); callbacks.current.onBusyChange(true); setError(initial.error); setNotice('');
    try {await work();}
    catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to confirm cancellation status.');}
    finally {lock.current = false; if (alive.current) {setBusy(false); callbacks.current.onBusyChange(false);}}
  }
  async function accepted(status: unknown, command: CancellationCommand) {
    if (!validateCancellationStatus(status, command)) throw Error('No matching cancellation receipt was returned. Keep the request and check again.');
    if (!alive.current) return;
    sessionStorage.removeItem(key); ++sequence.current; clearTimeout(readTimer.current); setLoading(false); setPending(null); setPreview(null); setRole('');
    setNotice('Cancellation confirmed. Review folio charges and service allocations separately.');
    // The receipt proves this command only. The parent reloads current workspace state.
    try {await callbacks.current.onSaved();}
    catch {if (alive.current) setError('Cancellation was confirmed, but the workspace could not refresh. Refresh before continuing.');}
  }
  async function check() {
    if (!pending || initial.error) return;
    const command = pending;
    await task(async () => {
      const status = await hotelRpc<unknown>('cancellation_request_status', {p_tenant: tenant, p_property: property, p_request: command.p_request});
      if (validateCancellationStatus(status, command)) await accepted(status, command);
      else if (alive.current) setNotice('No receipt was found. The earlier request may still complete. Keep this exact request and check again or retry it with current staff access.');
    });
  }
  async function cancel(command: CancellationCommand) {
    if (initial.error || !staffRoles.includes(role) || !preview) return;
    const recovering = pending !== null;
    await task(async () => {
      if (!validCancellation(command, reservation)) throw Error('Review the reservation version, property date and a 4–500 character reason before cancelling.');
      sessionStorage.setItem(key, JSON.stringify(command)); setPending(command);
      let result: unknown;
      try {result = await hotelRpc<unknown>('cancel_reservation', {p_tenant: tenant, p_property: property, ...command});}
      catch (cause) {
        if (!alive.current) return;
        if (!definitiveBookingRejection(cause)) throw Error('The cancellation result is uncertain. Check the saved receipt or retry this exact request.');
        const status = await hotelRpc<unknown>('cancellation_request_status', {p_tenant: tenant, p_property: property, p_request: command.p_request});
        if (validateCancellationStatus(status, command)) {await accepted(status, command); return;}
        if (!alive.current) return;
        const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
        // PT409 fences a monotonic source version. After an absent receipt, the
        // old command cannot become valid again. PT412 is a civil-date conflict;
        // dates can change back, and legacy/engine 40001 has no specific fence.
        if (!recovering || code === 'PT409') {sessionStorage.removeItem(key); setPending(null); await refresh();}
        else setNotice('The earlier cancellation remains unresolved. Check its receipt before preparing another request.');
        throw cause;
      }
      await accepted({found: true, action: 'cancel_reservation', result}, command);
    });
  }

  const staff = staffRoles.includes(role), disabled = busy || loading || !!initial.error;
  const amount = (value: number | null) => value === null ? 'Unknown' : folioMoney(value);
  return <>
    <p>Cancel a Confirmed direct or imported reservation that never started. This is an ordinary, terminal cancellation; it does not mark a no-show. A later stay requires a new capacity-checked reservation.</p>
    <button className="secondary" disabled={busy || loading} onClick={() => void task(refresh)}>Refresh cancellation review</button>
    {(error || readError) && <div className="pilot-error" role="alert">{error || readError}</div>}
    {notice && <output className="pilot-notice">{notice}</output>}
    {preview && <section className="pilot-no-show-review">
      <h3>Current cancellation review</h3>
      <p>{reservationStatus(preview)} · {preview.arrival ?? 'Unknown arrival'} to {preview.departure ?? 'Unknown departure'}</p>
      <p>Reviewed property date: {preview.business_date}. {preview.cancellation_policy}</p>
      <h3>Reservation inventory released</h3>
      <p>{preview.current_future_room_nights_released} current or future room-nights would be released.</p>
      {preview.release_start && preview.release_end && <p>{preview.release_start} through {preview.release_end} (departure excluded): one reservation commitment per night.</p>}
      {preview.scheduled_stay_elapsed && <p>The scheduled stay has elapsed. Cancelling it releases no current or future reservation nights.</p>}
      <p>{preview.inventory_definition}</p>
      <p>Amount basis: {balanceBasis(preview.opening_mode)}</p>
      <dl><div><dt>Charges</dt><dd>{amount(preview.charges_minor)}</dd></div><div><dt>Net externally recorded payments</dt><dd>{amount(preview.recorded_paid_minor)}</dd></div><div><dt>Balance</dt><dd>{amount(preview.balance_minor)}</dd></div></dl>
      <p className="pilot-service-blockers">{preview.financial_review_required ? 'Financial review is required. ' : ''}{preview.service_warning}</p>
      <p>Cancelling does not add cancellation fees, waive charges, refund payments, change housekeeping, or close a service day.</p>
      <div className="pilot-actions"><button className="secondary" disabled={busy} onClick={onReviewFolio}>Review reservation folio</button><button className="secondary" disabled={busy} onClick={onReviewServiceDays}>Review service-day allocations</button></div>
      {preview.blockers.length > 0 && <ul>{preview.blockers.map(blocker => <li key={blocker}>{cancellationBlockers[blocker] ?? blocker}</li>)}</ul>}
    </section>}
    {pending ? <section className="pilot-notice">
      <h3>Recover saved cancellation request</h3>
      <p>Reservation {pending.p_reservation} · reviewed property date {pending.p_expected_business_date} · source version {pending.p_expected_source_version}</p>
      <p>{pending.p_reason}</p>
      <div className="pilot-actions"><button className="secondary" disabled={busy} onClick={() => void check()}>Check saved cancellation request</button>{staff && preview && <button className="primary" disabled={busy || loading} onClick={() => void cancel(pending)}>Retry exact cancellation request</button>}</div>
      {!staff && <p>Current property access can check your original receipt. Reload the staff access review before retrying.</p>}
    </section> : !preview ? <p>{loading ? 'Loading the current cancellation review…' : 'Load the current reservation review before cancelling.'}</p> : !staff ? <p>Current staff access is required to cancel this reservation.</p> : preview.eligible && <form key={preview.source_version + '/' + preview.business_date + '/' + preview.generated_at} onSubmit={event => {
      event.preventDefault();
      if (disabled) return;
      const form = new FormData(event.currentTarget), command: CancellationCommand = {p_request: crypto.randomUUID(), p_reservation: reservation, p_expected_source_version: preview.source_version, p_expected_business_date: preview.business_date, p_reason: formText(form, 'reason').trim()};
      if (!validCancellation(command, reservation)) {setError('Enter a cancellation reason of 4–500 characters on one line.'); return;}
      void cancel(command);
    }}>
      <label className="field">Cancellation reason<input name="reason" required minLength={4} maxLength={500} disabled={disabled}/></label>
      <label className="pilot-check"><input type="checkbox" required disabled={disabled}/>I confirmed this stay never started and reviewed the released nights and separate financial and allocation decisions.</label>
      <button className="primary" disabled={disabled}>Confirm cancellation</button>
    </form>}
  </>;
}
