'use client';
import {CashierDirectDeposit} from './cashier-direct-deposit';
import {CashierBankDeposits} from './cashier-bank-deposits';
import {useEffect, useRef, useState} from 'react';
import {hotelClient, hotelRpc, type Membership} from '@/lib/pilot';
import {cashierClosingView} from '@/lib/cashier-report-export';
import {CashierHandoffCreate} from '@/components/cashier-handoff-create';
import {CashierHandoffs} from '@/components/cashier-handoffs';
import {CashierVariance} from '@/components/cashier-variance';
import {afterDays} from '@/lib/rates';

export function CashierClosingReport(props: {membership: Membership; businessDate: string}) {
  return <Report key={JSON.stringify(props.membership)} {...props}/>;
}
function Report({membership, businessDate}: {membership: Membership; businessDate: string}) {
  const [directSession,setDirectSession]=useState<string|null>(null);
  const [handoffSession,setHandoffSession]=useState<string|null>(null);
  const [selectedSession,setSelectedSession]=useState<string|null>(null);
  const [start, setStart] = useState(businessDate), [end, setEnd] = useState(afterDays(businessDate, 1));
  const [loaded, setLoaded] = useState<(ReturnType<typeof cashierClosingView> & {actor: string; count: number}) | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(false), lock = useRef(false);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function run(download: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    if (!download) setLoaded(null);
    try {
      const user = await hotelClient().auth.getUser();
      if (user.error || !user.data.user) throw Error('Sign in to view cashier reports.');
      const actor = user.data.user.id;
      if (download) {
        if (!loaded || loaded.actor !== actor) throw Error('Sign-in changed. Load the report again.');
        if (!alive.current) return;
        const url = URL.createObjectURL(new Blob([loaded.csv], {type: 'text/csv;charset=utf-8'}));
        const link = document.createElement('a'); link.href = url; link.download = `cashier-closings-${start}-${end}.csv`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const span = Date.parse(end) - Date.parse(start);
        if (!Number.isFinite(span) || span < 86400000 || span > 366 * 86400000) throw Error('Choose a range of 1 to 366 days.');
        const report = await hotelRpc<unknown>('cashier_closing_report', {p_tenant: membership.tenant_id, p_property: membership.property_id, p_start: start, p_end: end});
        const view = cashierClosingView(report, membership.tenant_id, membership.property_id, actor);
        const dates = report as {starts_on: string; ends_before: string; session_count: number};
        if (dates.starts_on !== start || dates.ends_before !== end) throw Error('Report dates changed. Load again.');
        const again = await hotelClient().auth.getUser();
        if (again.error || again.data.user?.id !== actor) throw Error('Sign-in changed. Load the report again.');
        if (alive.current) setLoaded({...view, actor, count: dates.session_count});
      }
    } catch (cause) {
      if (alive.current) {setLoaded(null); setError(cause instanceof Error ? cause.message : 'Unable to load cashier closings.');}
    } finally {if (alive.current) {lock.current = false; setBusy(false);}}
  }
  return <section className="card pilot-reports"><h2>Cashier closing report</h2>
    <p>Closing dates use each drawer session’s recorded time zone. Staff see their own sessions; owners and managers see the property.</p>
    <form onSubmit={event => {event.preventDefault(); void run(false);}}>
      <label className="field">Closed from<input type="date" value={start} disabled={busy} onChange={event => {setLoaded(null); setStart(event.target.value);}}/></label>
      <label className="field">Closed before<input type="date" value={end} disabled={busy} onChange={event => {setLoaded(null); setEnd(event.target.value);}}/></label>
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : 'Load cashier closings'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {loaded && <><p>{loaded.count} closed drawer sessions. The export includes expected cash, counted cash, variance and closing explanations.</p><button disabled={busy} onClick={() => void run(true)}>Download closing report CSV</button></>}
    {loaded && <><dl className="detail-grid"><div><dt>Expected cash (USD)</dt><dd>{loaded.expected}</dd></div><div><dt>Counted cash (USD)</dt><dd>{loaded.counted}</dd></div><div><dt>Over / short (USD)</dt><dd>{loaded.variance}</dd></div></dl>{loaded.sessions.length > 0 && <div className="pilot-table-wrap"><table className="pilot-table"><caption>Closed drawers · USD</caption><thead><tr><th>Drawer</th><th>Cashier</th><th>Closing date</th><th>Expected</th><th>Counted</th><th>Over / short</th><th>Explanation</th><th>Variance review</th></tr></thead><tbody>{loaded.sessions.map(session => <tr key={session.id}><td>{session.drawer}</td><td>{session.cashier === loaded.actor ? 'You' : session.cashier}</td><td>{session.date}<small>{session.zone}</small></td><td>{session.expected}</td><td>{session.counted}</td><td>{session.variance}</td><td>{session.reason}{["owner","manager"].includes(membership.role)&&<button onClick={()=>setSelectedSession(session.id)}>Review variance</button>}</td><td>{session.varianceOutcome}{session.cashier===loaded.actor&&<><button onClick={()=>{setHandoffSession(session.id);setDirectSession(null)}}>Hand off cash</button><button onClick={()=>{setDirectSession(session.id);setHandoffSession(null)}}>Deposit drawer cash</button></>}</td></tr>)}</tbody></table></div>}</>}
    <>{selectedSession&&<CashierVariance membership={membership} session={selectedSession} onReviewSaved={()=>void run(false)}/>}</>{handoffSession&&loaded&&<CashierHandoffCreate key={loaded.actor+":"+handoffSession} scope={{tenant:membership.tenant_id,property:membership.property_id,actor:loaded.actor}} session={handoffSession} onSaved={()=>void run(false)}/>}{directSession&&loaded&&<CashierDirectDeposit key={loaded.actor+":"+directSession} scope={{tenant:membership.tenant_id,property:membership.property_id,actor:loaded.actor}} session={directSession} onSaved={()=>void run(false)}/>}<CashierHandoffs membership={membership}/><CashierBankDeposits membership={membership}/><p>Cash declarations do not verify bank deposits or resolve cash variances.</p>
  </section>;
}
