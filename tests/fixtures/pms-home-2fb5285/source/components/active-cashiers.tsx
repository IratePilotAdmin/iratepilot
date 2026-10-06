'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, hotelRpc, type Membership} from '@/lib/pilot';
import {readActiveCashiers, type ActiveCashiers as Cashiers} from '@/lib/cashier-active';
import {reportUsd} from '@/lib/report-export';
import {CashierCustody} from '@/components/cashier-custody';
import {CashierReview} from '@/components/cashier-review';
import {CashierCloseRecovery} from '@/components/cashier-close-recovery';
import {CashierControls} from '@/components/cashier-controls';
import {CashierOpen} from '@/components/cashier-open';

export function ActiveCashiers({membership}: {membership: Membership}) {
  return <><CashierControls membership={membership}/><CashierOpen membership={membership}/><CashierCloseRecovery membership={membership}/><Drawers key={JSON.stringify(membership)} membership={membership}/></>;
}
function Drawers({membership}: {membership: Membership}) {
  const [data, setData] = useState<Cashiers | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function load() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setData(null); setSelected(''); setError('');
    try {
      const user = await hotelClient().auth.getUser();
      if (user.error || !user.data.user) throw Error('Sign in to load active drawers.');
      const actor = user.data.user.id;
      const result = await hotelRpc<unknown>('active_cashiers', {p_tenant: membership.tenant_id, p_property: membership.property_id});
      const parsed = readActiveCashiers(result, membership.tenant_id, membership.property_id, actor, membership.role);
      const again = await hotelClient().auth.getUser();
      if (again.error || again.data.user?.id !== actor) throw Error('Sign-in changed. Load active drawers again.');
      if (alive.current) setData(parsed);
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to load active drawers.');}
    finally {if (alive.current) {lock.current = false; setBusy(false);}}
  }
  return <section className="card pilot-reports"><h2>Active cashier drawers</h2>
    <p>Staff see their own drawer. Owners and managers see active drawers at this property.</p>
    <button className="primary" disabled={busy} onClick={() => void load()}>{busy ? 'Loading drawers…' : 'Load active drawers'}</button>
    {error && <p role="alert">{error}</p>}
    {data && (data.sessions.length ? <table><thead><tr><th>Drawer</th><th>Cashier</th><th>Opening cash</th><th>Opened</th><th>Review</th></tr></thead><tbody>{data.sessions.map(session => <tr key={session.session_id}><td>{session.drawer}</td><td>{session.is_mine ? 'Your session' : session.cashier_id}</td><td>{reportUsd(Number(session.opening_minor))}</td><td>{session.business_date} · {session.time_zone}</td><td><button onClick={() => setSelected(session.session_id)}>Review {session.drawer}</button></td></tr>)}</tbody></table> : <p>No active drawers in your view.</p>)}
    {selected && data?.sessions.find(session => session.session_id === selected)?.is_mine && <CashierCustody membership={membership} session={selected}/>}
    {selected && <CashierReview membership={membership} session={selected}/>}
  </section>;
}
