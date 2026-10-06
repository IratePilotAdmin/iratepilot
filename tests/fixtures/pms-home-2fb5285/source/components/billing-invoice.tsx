'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {billingInvoicePrintModel} from '@/lib/billing-invoice-document';
import type {GuestDocumentModel} from '@/lib/guest-documents';
import {GuestDocumentView, guestDocumentStyles, printGuestDocument} from './guest-document-view';

import {BillingCreditNote} from './billing-credit-note';

type Props = {tenant: string; property: string; account: string; invoice: string; number?: string};
export function BillingInvoice(props: Props) {
  return <Invoice key={[props.tenant, props.property, props.account, props.invoice].join(':')} {...props}/>;
}
function Invoice({tenant, property, account, invoice, number}: Props) {
  const [model, setModel] = useState<GuestDocumentModel | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [credits,setCredits]=useState<Array<{id:string;number:string}>>([]);
  const generation = useRef(0), printCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => {generation.current += 1;printCleanup.current?.();}, []);
  async function load(print: boolean) {
    const request = ++generation.current;setBusy(true);setError('');setModel(null);setCredits([]);printCleanup.current?.();
    try {
      const data = await hotelRpc<unknown>('billing_invoice', {p_tenant: tenant, p_property: property, p_account: account, p_invoice: invoice});
      if (generation.current !== request) return;
      const prepared = billingInvoicePrintModel(data, {tenant, property, account, invoice});
      const notes=(data as {credit_notes?:unknown}).credit_notes;
      if(!Array.isArray(notes) || notes.some(n=>!n || typeof n.id!=='string' || typeof n.number!=='string' || !/^CN-[1-9][0-9]*$/.test(n.number))) throw Error('Credit note references unavailable.');
      setCredits(notes);setModel(prepared);
      if (print) printCleanup.current = printGuestDocument(prepared);
    } catch (failure) {if (generation.current === request) setError(failure instanceof Error ? failure.message : 'Unable to prepare invoice.');}
    finally {if (generation.current === request) setBusy(false);}
  }
  return <section className="pilot-settings" aria-busy={busy}>
    <button className="secondary" disabled={busy} onClick={() => void load(false)}>Preview {number ?? 'invoice'}</button>
    {busy && <p role="status">Preparing invoice…</p>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
    {model && <><style>{guestDocumentStyles}</style><GuestDocumentView model={model}/><button className="secondary" disabled={busy} onClick={() => void load(true)}>Print invoice / Save as PDF</button><button className="secondary" disabled={busy} onClick={() => {printCleanup.current?.();setModel(null);}}>Close invoice preview</button></>}
  {model && credits.map(note=><BillingCreditNote key={note.id} tenant={tenant} property={property} account={account} credit={note.id} number={note.number}/>)}
  </section>;
}
