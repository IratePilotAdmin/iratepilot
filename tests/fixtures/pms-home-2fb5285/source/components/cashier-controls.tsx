'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, hotelRpc, type Membership} from '@/lib/pilot';
type Control = {actor: string; revision: string; paused: boolean; reason: string | null; canChange: boolean};
export function CashierControls({membership}: {membership: Membership}) {return <Controls key={JSON.stringify(membership)} membership={membership}/>;}
function Controls({membership}: {membership: Membership}) {
  const [control, setControl] = useState<Control | null>(null), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function run(change: boolean) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const user = await hotelClient().auth.getUser(); if (user.error || !user.data.user) throw Error('Sign in to view cashier controls.');
      const actor = user.data.user.id;
      if (!alive.current) return;
      if (change) {
        if (!control || control.actor !== actor || !control.canChange || membership.role !== 'owner' || !confirmed || !reason.trim()) throw Error('Load current controls and confirm a reason first.');
        // Clear the old decision before sending; ambiguous responses require a fresh read.
        setControl(null); setConfirmed(false);
        await hotelRpc<unknown>('set_cashier_pause', {p_tenant: membership.tenant_id, p_property: membership.property_id, p_paused: !control.paused, p_reason: reason.trim(), p_expected_revision: control.revision});
      } else {setControl(null); setConfirmed(false);}
      const result = await hotelRpc<Record<string, unknown>>('cashier_control', {p_tenant: membership.tenant_id, p_property: membership.property_id});
      const again = await hotelClient().auth.getUser(); if (again.error || again.data.user?.id !== actor) throw Error('Sign-in changed. Reload cashier controls.');
      if (result.schema_version !== 1 || result.tenant_id !== membership.tenant_id || result.property_id !== membership.property_id || result.actor_id !== actor || typeof result.paused !== 'boolean' || typeof result.revision !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(result.revision) || result.can_change !== (membership.role === 'owner') || (result.reason !== null && typeof result.reason !== 'string')) throw Error('Cashier controls did not match the selected workspace.');
      if (alive.current) {setControl({actor, revision: result.revision, paused: result.paused, reason: result.reason as string | null, canChange: result.can_change as boolean}); setReason('');}
    } catch (cause) {if (alive.current) {setControl(null); setConfirmed(false); setError((cause instanceof Error ? cause.message : 'Unable to update cashier controls.') + ' Reload the status before another decision.');}}
    finally {if (alive.current) {lock.current = false; setBusy(false);}}
  }
  return <section className="card"><h2>Cashier activity controls</h2><button disabled={busy} onClick={() => void run(false)}>Load cashier status</button>{error && <p role="alert">{error}</p>}{control && <><p>{control.paused ? 'New cashier activity is paused.' : 'New cashier activity is enabled.'}</p>{control.reason && <p>Last explanation: {control.reason}</p>}{control.canChange && <><label className="field">Reason for change<input disabled={busy} maxLength={500} value={reason} onChange={event => {setConfirmed(false); setReason(event.target.value);}}/></label><label><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> {control.paused ? 'Resume' : 'Pause'} new cashier activity.</label><button disabled={busy || !confirmed || !reason.trim()} onClick={() => void run(true)}>Confirm {control.paused ? 'resume' : 'pause'}</button></>}</>}<p>Receipt recovery and drawer closing remain available while activity is paused.</p></section>;
}
