'use client';

import {useEffect, useRef, useState} from 'react';
import {hotelRpc, type HotelWorkspace} from '@/lib/pilot';
import {useClientReady} from '@/lib/client-ready';
import {definitiveBookingRejection} from '@/lib/pending-booking';
import {reportMoney} from '@/lib/report-export';
import {cleaningTaxKeys, propertyFeeKey, readCleaningFee, validPropertyFeeCommand, validatePropertyFees, validatePropertyFeeStatus, type PropertyFees, type PropertyFeeCommand, type PropertyFeeResult} from '@/lib/property-fees';

type Props = {actor: string; tenant: string; property: string; role: string; onBusyChange: (busy: boolean) => void; onSaved: () => Promise<void>};
const taxLabels = {city: 'City', state: 'State', lodging: 'Lodging'};

export function PropertyFeesPanel(props: Props) {
  return useClientReady() ? <PropertyFeesForm key={props.actor + ':' + props.tenant + ':' + props.property} {...props}/> : <section className="card pilot-settings"><p>Loading cleaning-fee settings…</p></section>;
}

function PropertyFeesForm({actor, tenant, property, role, onBusyChange, onSaved}: Props) {
  const key = propertyFeeKey(actor, tenant, property);
  const [initial] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return {pending: null, error: ''};
      const value: unknown = JSON.parse(raw);
      if (!validPropertyFeeCommand(value)) throw Error();
      return {pending: value, error: ''};
    } catch {
      return {pending: null, error: 'The saved cleaning-fee request cannot be read. Reconcile it before preparing another change.'};
    }
  });
  const [pending, setPending] = useState<PropertyFeeCommand | null>(initial.pending);
  const [data, setData] = useState<PropertyFees | null>(null);
  const [readRole, setReadRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.error);
  const [readError, setReadError] = useState('');
  const [notice, setNotice] = useState('');
  const alive = useRef(true), sequence = useRef(0), lock = useRef(false);
  const callbacks = useRef({onBusyChange, onSaved});
  useEffect(() => {callbacks.current = {onBusyChange, onSaved};}, [onBusyChange, onSaved]);

  async function readCurrent() {
    const [fees, workspace] = await Promise.all([
      hotelRpc<unknown>('property_fees', {p_tenant: tenant, p_property: property}),
      hotelRpc<HotelWorkspace>('workspace', {p_tenant: tenant, p_property: property}),
    ]);
    if (workspace.property.id !== property || !['owner', 'manager', 'staff', 'member'].includes(workspace.role)) throw Error('The current property access could not be verified.');
    return {fees: validatePropertyFees(fees, tenant, property), role: workspace.role};
  }

  async function reloadCurrent() {
    const seq = ++sequence.current;
    setData(null); setReadRole(''); setLoading(true); setReadError('');
    try {
      const current = await readCurrent();
      if (alive.current && sequence.current === seq) {setData(current.fees); setReadRole(current.role);}
      return true;
    } catch (cause) {
      if (alive.current && sequence.current === seq) setReadError(cause instanceof Error ? cause.message : 'Unable to load cleaning-fee settings.');
      return false;
    } finally {
      if (alive.current && sequence.current === seq) setLoading(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    const seq = ++sequence.current;
    const cleanup = () => {alive.current = false; ++sequence.current; if (lock.current) callbacks.current.onBusyChange(false);};
    Promise.all([
      hotelRpc<unknown>('property_fees', {p_tenant: tenant, p_property: property}),
      hotelRpc<HotelWorkspace>('workspace', {p_tenant: tenant, p_property: property}),
    ]).then(([fees, workspace]) => {
      if (!alive.current || sequence.current !== seq) return;
      if (workspace.property.id !== property || !['owner', 'manager', 'staff', 'member'].includes(workspace.role)) throw Error('The current property access could not be verified.');
      setData(validatePropertyFees(fees, tenant, property)); setReadRole(workspace.role);
    }).catch(cause => {
      if (alive.current && sequence.current === seq) setReadError(cause instanceof Error ? cause.message : 'Unable to load cleaning-fee settings.');
    }).finally(() => {if (alive.current && sequence.current === seq) setLoading(false);});
    return () => cleanup();
  }, [tenant, property]);

  async function task(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); callbacks.current.onBusyChange(true); setError(initial.error); setNotice('');
    try {await work();}
    catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'Unable to confirm cleaning-fee settings.');}
    finally {lock.current = false; if (alive.current) {setBusy(false); callbacks.current.onBusyChange(false);}}
  }

  async function accepted(status: unknown, command: PropertyFeeCommand) {
    const result = validatePropertyFeeStatus(status, command, tenant, property);
    if (!result) throw Error('No matching receipt was returned. Keep the saved request and check again.');
    if (!alive.current) return;
    sessionStorage.removeItem(key); setPending(null); setData(null); setReadRole('');
    setNotice('Cleaning-fee request confirmed. Saved bookings retain their original charges.');
    // A receipt can describe an older configuration. Only a new read supplies the form.
    const refreshed = await reloadCurrent();
    if (!alive.current) return;
    try {await callbacks.current.onSaved();}
    catch {if (alive.current) setError('The cleaning-fee request was saved, but the workspace could not refresh. Refresh the workspace before continuing.');}
    if (alive.current && !refreshed) setNotice('Cleaning-fee request confirmed, but current settings could not reload. Refresh settings before another change.');
  }

  async function check() {
    if (!pending || initial.error) return;
    const command = pending;
    await task(async () => {
      const status = await hotelRpc<unknown>('property_fee_request_status', {p_tenant: tenant, p_property: property, p_request: command.p_request});
      if (validatePropertyFeeStatus(status, command, tenant, property)) await accepted(status, command);
      else if (alive.current) setNotice('No receipt was found. The earlier request may still complete. Keep this exact request and check again, or retry when authorized.');
    });
  }

  async function save(command: PropertyFeeCommand) {
    const recovering = pending !== null;
    if (initial.error || !manager || !data) return;
    await task(async () => {
      if (!validPropertyFeeCommand(command)) throw Error('Review the current fee version, amount and tax categories before saving.');
      sessionStorage.setItem(key, JSON.stringify(command)); setPending(command);
      let result: PropertyFeeResult;
      try {
        result = await hotelRpc<PropertyFeeResult>('save_property_fees', {p_tenant: tenant, p_property: property, ...command});
      } catch (cause) {
        if (!alive.current) return;
        if (!definitiveBookingRejection(cause)) throw Error('The cleaning-fee result is uncertain. Check the saved receipt or retry this exact request.');
        const status = await hotelRpc<unknown>('property_fee_request_status', {p_tenant: tenant, p_property: property, p_request: command.p_request});
        if (validatePropertyFeeStatus(status, command, tenant, property)) {await accepted(status, command); return;}
        if (!alive.current) return;
        const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
        // In 168, PT409 fences a monotonic fee/model version; after absent receipt,
        // this exact stale version cannot become admissible again, even on recovery.
        if (!recovering || code === 'PT409') {
          sessionStorage.removeItem(key); setPending(null); await reloadCurrent();
        } else setNotice('The earlier request remains unresolved. Keep its exact values and check the receipt before preparing another change.');
        throw cause;
      }
      await accepted({found: true, action: 'save_property_fees', result}, command);
    });
  }

  const manager = ['owner', 'manager'].includes(role) && ['owner', 'manager'].includes(readRole);
  const disabled = busy || loading || !!initial.error || !manager;
  return <section className="card pilot-settings">
    <div className="section-top"><h2>Whole-home cleaning fee</h2><button className="text-button" disabled={busy || loading} onClick={() => void task(async () => {await reloadCurrent();})}>Refresh cleaning-fee settings</button></div>
    <p>This property setting adds one Cleaning fee per stay to new rate-plan quotes for the entire home. It does not automatically reprice manual, imported or OTA reservations. Saved bookings retain their original fees.</p>
    <p>Selected City, State or Lodging tax applies to Cleaning only when that named tax is enabled in the chosen rate plan. The existing combined tax does not automatically apply to Cleaning.</p>
    {(error || readError) && <div className="pilot-error" role="alert">{error || readError}</div>}
    {notice && <output className="pilot-notice">{notice}</output>}
    {pending ? <section className="pilot-notice">
      <h3>Recover saved cleaning-fee request</h3>
      <p>{pending.p_cleaning.enabled ? 'Enabled' : 'Disabled'} · ${reportMoney(pending.p_cleaning.amount_minor)} USD per stay · reviewed fee version {pending.p_expected_version}</p>
      <p>Selected tax categories: {pending.p_cleaning.taxes.length ? pending.p_cleaning.taxes.map(tax => taxLabels[tax]).join(', ') : 'None'}</p>
      <div className="pilot-actions"><button className="secondary" disabled={busy} onClick={() => void check()}>Check saved cleaning-fee request</button>{manager && data && <button className="primary" disabled={busy || loading} onClick={() => void save(pending)}>Retry exact cleaning-fee request</button>}</div>
      {!manager && <p>An owner or manager can retry. Your current property access can check your original receipt.</p>}
    </section> : !data ? <p>{loading ? 'Loading current cleaning-fee settings…' : 'Load the current settings before preparing a change.'}</p> : <form key={data.version} onSubmit={event => {
      event.preventDefault();
      if (disabled) return;
      try {void save({p_request: crypto.randomUUID(), p_expected_version: data.version, p_cleaning: readCleaningFee(new FormData(event.currentTarget))});}
      catch (cause) {setError(cause instanceof Error ? cause.message : 'Review the cleaning-fee amount.');}
    }}>
      <p>Current property model: {data.operating_model === 'whole_home' ? 'Whole-home vacation rental' : 'Hotel'}. Fee settings version: {data.version}.</p>
      <label className="pilot-check"><input type="checkbox" name="cleaning_enabled" defaultChecked={data.cleaning.enabled} disabled={disabled || data.operating_model !== 'whole_home'}/>Enable Cleaning fee</label>
      {data.operating_model !== 'whole_home' && <p>Only a whole-home property can enable Cleaning. You may prepare a disabled setting here.</p>}
      <label className="field">Cleaning fee amount (USD)<input name="cleaning_amount" type="text" inputMode="decimal" required maxLength={13} defaultValue={reportMoney(data.cleaning.amount_minor)} disabled={disabled}/></label>
      <p>Frequency: once per stay. Disabled settings retain their amount and tax selections. Disable Cleaning before converting this property to a hotel.</p>
      <fieldset disabled={disabled}><legend>Taxes selected for Cleaning</legend>{cleaningTaxKeys.map(tax => <label className="pilot-check" key={tax}><input type="checkbox" name={'cleaning_tax_' + tax} defaultChecked={data.cleaning.taxes.includes(tax)}/>Apply {taxLabels[tax]} tax to Cleaning fee</label>)}</fieldset>
      {manager ? <button className="primary" disabled={disabled}>Save cleaning-fee settings</button> : <p>Only an owner or manager can change these settings.</p>}
    </form>}
  </section>;
}
