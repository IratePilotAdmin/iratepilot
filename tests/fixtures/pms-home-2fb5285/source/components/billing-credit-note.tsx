'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {billingCreditPrintModel} from '@/lib/billing-credit-document';
import type {GuestDocumentModel} from '@/lib/guest-documents';
import {GuestDocumentView, guestDocumentStyles, printGuestDocument} from './guest-document-view';

type Props = {tenant: string; property: string; account: string; credit: string; number?: string};
export function BillingCreditNote(props: Props) {
  return <CreditNote key={[props.tenant, props.property, props.account, props.credit].join(':')} {...props}/>;
}
function CreditNote({tenant, property, account, credit, number}: Props) {
  const [model, setModel] = useState<GuestDocumentModel | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), printCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => {generation.current += 1;printCleanup.current?.();}, []);
  async function load(print: boolean) {
    const request = ++generation.current;setBusy(true);setError('');setModel(null);printCleanup.current?.();
    try {
      const data = await hotelRpc<unknown>('billing_credit_note', {p_tenant: tenant, p_property: property, p_account: account, p_credit: credit});
      if (generation.current !== request) return;
      const prepared = billingCreditPrintModel(data, {tenant, property, account, credit});
      setModel(prepared);
      if (print) printCleanup.current = printGuestDocument(prepared);
    } catch (failure) {if (generation.current === request) setError(failure instanceof Error ? failure.message : 'Unable to prepare credit.');}
    finally {if (generation.current === request) setBusy(false);}
  }
  return <section className="pilot-settings" aria-busy={busy}>
    <button className="secondary" disabled={busy} onClick={() => void load(false)}>Preview {number ?? 'credit'}</button>
    {busy && <p role="status">Preparing credit…</p>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
    {model && <><style>{guestDocumentStyles}</style><GuestDocumentView model={model}/><button className="secondary" disabled={busy} onClick={() => void load(true)}>Print credit / Save as PDF</button><button className="secondary" disabled={busy} onClick={() => {printCleanup.current?.();setModel(null);}}>Close credit preview</button></>}
  </section>;
}
