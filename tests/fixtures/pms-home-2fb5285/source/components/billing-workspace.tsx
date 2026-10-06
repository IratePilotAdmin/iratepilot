'use client';



import {useCallback, useEffect, useRef, useState} from 'react';

import {BillingAccountTransfer,type TransferReservation} from './billing-account-transfer';
import {hotelRpc} from '@/lib/pilot';

import {PostBillingPayment} from './post-billing-payment';
import {BillingMatchHistory} from './billing-match-history';
import {MatchBillingPayment} from './match-billing-payment';
import {RecordBillingPayment} from './record-billing-payment';
import {CreateBillingInvoice} from './create-billing-invoice';

import {CreateBillingAccount} from './create-billing-account';

import {BillingActivity} from './billing-activity';

import {BillingInvoice} from './billing-invoice';

import {BillingAccounts, billingDollars, type BillingAccountSummary} from './billing-accounts';



type Page = {tenant_id: string; property_id: string; accounts: BillingAccountSummary[]; next_cursor: string | null; has_more: boolean};

function validatePage(page:Page,tenant:string,property:string,cursor:string|null){

  if(!page || page.tenant_id!==tenant || page.property_id!==property || !Array.isArray(page.accounts) || page.accounts.length>25 || typeof page.has_more!=='boolean')throw Error('Billing account list could not be verified. Refresh to retry.');

  const seen=new Set<string>();

  for(const account of page.accounts){

    if(!account || typeof account.id!=='string' || !account.id || seen.has(account.id) || typeof account.name!=='string' || !account.name.trim() || !['company','group'].includes(account.kind) || !Number.isSafeInteger(account.unposted_payment_count) || account.unposted_payment_count<0)throw Error('Billing account list contains an invalid account.');

    seen.add(account.id);

    for(const key of ['balance_minor','open_invoice_minor','unbilled_charges_minor','unallocated_receipts_minor'] as const){

      const amount=account[key];

      if(typeof amount!=='string' || !/^-?(0|[1-9]\d{0,14})$/.test(amount) || key!=='balance_minor'&&BigInt(amount)<0n)throw Error('Billing account amount could not be verified.');

    }

  }

  if(page.has_more ? !page.accounts.length || typeof page.next_cursor!=='string' || page.next_cursor!==page.accounts.at(-1)?.id || page.next_cursor===cursor : page.next_cursor!==null)throw Error('Billing account pagination could not be verified.');

}

type Detail = {

  id: string; name: string;

  receivables: {account_id:string;currency:string;tenant_id: string; property_id: string; balance_minor: string; invoices: {invoice_id: string; invoice_number?: string; due_on: string; days_overdue: number; outstanding_minor: string}[]};

  ledger: {tenant_id:string;property_id:string;account_id:string;currency:string;payments: {payment_id: string; kind: string; amount_minor: string; status: string; posting_date: string | null}[]};

};

function validateDetail(value:Detail,tenant:string,property:string,id:string){

  const money=(v:unknown)=>typeof v==='string'&&/^-?(0|[1-9]\d{0,14})$/.test(v);

  const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;

  if(!value || value.id!==id || typeof value.name!=='string' || !value.name.trim() || value.receivables?.tenant_id!==tenant || value.receivables?.property_id!==property || !money(value.receivables.balance_minor) || !Array.isArray(value.receivables.invoices) || !Array.isArray(value.ledger?.payments))throw Error('Billing account details could not be verified.');

  if(value.receivables.account_id!==id||value.receivables.currency!=='USD'||value.ledger.tenant_id!==tenant||value.ledger.property_id!==property||value.ledger.account_id!==id||value.ledger.currency!=='USD')throw Error('Billing detail scope does not match the selected account.');
  const invoices=new Set<string>(),payments=new Set<string>();

  for(const row of value.receivables.invoices){

    if(!row || typeof row.invoice_id!=='string' || !row.invoice_id || invoices.has(row.invoice_id) || !date(row.due_on) || !Number.isSafeInteger(row.days_overdue) || row.days_overdue<0 || !money(row.outstanding_minor) || BigInt(row.outstanding_minor)<0n)throw Error('Billing invoice details could not be verified.');

    invoices.add(row.invoice_id);

  }

  for(const row of value.ledger.payments){

    if(!row || typeof row.payment_id!=='string' || !row.payment_id || payments.has(row.payment_id) || !['external_payment','external_refund','payment_correction'].includes(row.kind) || !money(row.amount_minor) || BigInt(row.amount_minor)<=0n || !['posted','unposted'].includes(row.status) || (row.status==='posted'?!date(row.posting_date):row.posting_date!==null))throw Error('Billing payment details could not be verified.');

    payments.add(row.payment_id);

  }

}



export function BillingWorkspace(props: {initialAccount?:string;actor?:string;tenant: string; property: string;transferReservations?:TransferReservation[];onBusyChange?:(busy:boolean)=>void}) {

  return <ScopedBillingWorkspace key={`${props.actor??""}:${props.tenant}:${props.property}:${props.initialAccount??""}`} {...props}/>;

}



function ScopedBillingWorkspace({initialAccount,actor,tenant, property,transferReservations,onBusyChange}: {initialAccount?:string;actor?:string;tenant: string; property: string;transferReservations?:TransferReservation[];onBusyChange?:(busy:boolean)=>void}) {

  const [transferBusy,setTransferBusy]=useState(false);
  const [invoiceBusy,setInvoiceBusy]=useState(false);
  const [paymentBusy,setPaymentBusy]=useState(false);
  const [matchBusy,setMatchBusy]=useState(false);
  const [undoBusy,setUndoBusy]=useState(false);
  const [postingBusy,setPostingBusy]=useState(false);
  const [postingPayment,setPostingPayment]=useState('');
  const [accountView,setAccountView]=useState<'invoices'|'payments'|'matching'|'charges'>('invoices');
  const [postingSaved,setPostingSaved]=useState(false);
  const [matchSaved,setMatchSaved]=useState('');
  const [paymentSaved,setPaymentSaved]=useState('');
  const transferBusyChanged=useCallback((value:boolean)=>{setTransferBusy(value);if(value)setTransferSaved(false)},[]);
  useEffect(()=>{onBusyChange?.(transferBusy||invoiceBusy||paymentBusy||matchBusy||undoBusy||postingBusy);return()=>onBusyChange?.(false)},[transferBusy,invoiceBusy,paymentBusy,matchBusy,undoBusy,postingBusy,onBusyChange]);
  const [accounts, setAccounts] = useState<BillingAccountSummary[]>([]);

  const [next, setNext] = useState<string | null>(null);

  const [busy, setBusy] = useState(true);

  const [error, setError] = useState('');

  const [transferSaved, setTransferSaved] = useState(false);
  const [invoiceSaved,setInvoiceSaved]=useState('');

  const [detail, setDetail] = useState<Detail | null>(null);

  const generation = useRef(0);
  function clearConfirmations(){
    setTransferSaved(false);setInvoiceSaved('');setPaymentSaved('');setMatchSaved('');setPostingSaved(false);
  }
  function selectAccount(id:string){
    clearConfirmations();setAccountView('invoices');void open(id);
  }



  const load = useCallback(async (cursor: string | null) => {

    const request = ++generation.current;

    setBusy(true); setError(''); setDetail(null);setPostingPayment('');

    try {

      const page = await hotelRpc<Page>('billing_accounts', {p_tenant: tenant, p_property: property, p_after: cursor, p_limit: 25});

      if (generation.current !== request) return;

      validatePage(page,tenant,property,cursor);

      setAccounts(previous => cursor ? [...previous, ...page.accounts.filter(account => !previous.some(existing => existing.id === account.id))] : page.accounts);

      setNext(page.has_more ? page.next_cursor : null);
      return true;

    } catch (failure) {

      if (generation.current === request) {

        setAccounts([]); setNext(null);

        setError(failure instanceof Error ? failure.message : 'Unable to load billing accounts.');

      }

    } finally {

      if (generation.current === request) setBusy(false);

    }

  }, [tenant, property]);



  const open = useCallback(async (id: string) => {

    const request = ++generation.current;

    setBusy(true); setError(''); setDetail(null);setPostingPayment('');

    try {

      const result = await hotelRpc<Detail>('billing_account', {p_tenant: tenant, p_property: property, p_account: id});

      if (generation.current !== request) return;

      validateDetail(result,tenant,property,id);

      setDetail(result);

    } catch (failure) {

      if (generation.current === request) setError(failure instanceof Error ? failure.message : 'Unable to open billing account.');

    } finally {

      if (generation.current === request) setBusy(false);

    }

  }, [tenant, property]);

  useEffect(() => {
    const timer = window.setTimeout(() => { if(initialAccount)void open(initialAccount);else void load(null); }, 0);
    return () => {window.clearTimeout(timer);generation.current += 1;};
  }, [load, open, initialAccount]);



  async function refreshAfterTransfer(id:string){
    setTransferSaved(true);
    await refreshAccountViews(id);
  }

  async function refreshAccountViews(id:string){
    if(initialAccount){await open(id);return}
    setAccounts([]);setNext(null);
    if(await load(null))await open(id);
  }

  return <>

    {transferSaved&&<output>Charge transferred successfully. {error?`The account view could not refresh. Select ${initialAccount?'Refresh billing account':'Refresh accounts'} to reload balances.`:''}</output>}

    {postingSaved&&<output>Payment posted to the ledger. No money moved.{error?' Refresh the account view to load current balances.':''}</output>}
    {matchSaved&&<output>{matchSaved}{error?' Refresh the account view to load current balances.':''}</output>}
    {paymentSaved&&<output>{paymentSaved}{error?' Refresh the account view to load current balances.':''}</output>}

    {invoiceSaved&&<output>Invoice {invoiceSaved} issued. No payment was collected.{error?' Refresh the account view to load current balances.':''}</output>}

    {actor&&!detail&&<CreateBillingAccount actor={actor} tenant={tenant} property={property} onCreated={()=>void load(null)}/>}

    {!initialAccount&&<BillingActivity tenant={tenant} property={property}/>}
    {initialAccount?<section className="card"><button className="secondary" disabled={busy||transferBusy||invoiceBusy||paymentBusy||matchBusy||undoBusy||postingBusy} onClick={()=>void open(initialAccount)}>Refresh billing account</button>{busy&&<output>Loading billing account…</output>}{error&&<p role="alert">{error}</p>}</section>:<BillingAccounts accounts={accounts} busy={busy||transferBusy||invoiceBusy||paymentBusy||matchBusy||undoBusy||postingBusy} error={error} hasMore={next !== null} onRefresh={() => {clearConfirmations();void load(null)}} onMore={() => {if (next) void load(next);}} onOpen={selectAccount}/>}

    {detail && <section className="card" aria-label="Billing account details">

      <div className="section-top"><h2>{detail.name}</h2><button className="secondary" disabled={transferBusy||invoiceBusy||paymentBusy||matchBusy||undoBusy||postingBusy} onClick={() => {clearConfirmations();setDetail(null);setPostingPayment('')}}>Close details</button></div>

      <p>Account balance: <strong>{billingDollars(detail.receivables.balance_minor)}</strong></p>

      <nav aria-label="Company account tasks" style={{display:'flex',flexWrap:'wrap',gap:8,margin:'16px 0'}}>
        {(['invoices','payments','matching','charges'] as const).filter(view=>view!=='charges'||actor&&transferReservations).map(view=><button key={view} type="button" className={accountView===view?'primary':'secondary'} aria-pressed={accountView===view} disabled={transferBusy||invoiceBusy||paymentBusy||matchBusy||undoBusy||postingBusy} onClick={()=>setAccountView(view)}>{view==='invoices'?'Invoices':view==='payments'?'Payments & refunds':view==='matching'?'Match payments':'Transfer charges'}</button>)}
      </nav>
      <div hidden={accountView!=='charges'}>
      {actor&&transferReservations&&<fieldset disabled={invoiceBusy||paymentBusy||matchBusy||undoBusy||postingBusy} style={{border:0,padding:0,margin:0}}><BillingAccountTransfer actor={actor} tenant={tenant} property={property} account={detail.id} reservations={transferReservations} onBusyChange={transferBusyChanged} onSaved={()=>void refreshAfterTransfer(detail.id)}/></fieldset>}
      </div>
      <div hidden={accountView!=='invoices'}>
      <h3>Invoices</h3>
      {actor&&<fieldset disabled={transferBusy||paymentBusy||matchBusy||undoBusy||postingBusy} style={{border:0,padding:0,margin:0}}><CreateBillingInvoice actor={actor} tenant={tenant} property={property} account={detail.id} onBusyChange={setInvoiceBusy} onSaved={number=>{setInvoiceSaved(number);void refreshAccountViews(detail.id)}}/></fieldset>}

      {detail.receivables.invoices.length === 0 && <p>No invoices issued.</p>}

      {detail.receivables.invoices.map(invoice => <section key={invoice.invoice_id}><p><strong>{invoice.invoice_number ?? "Invoice reference unavailable"}</strong> · Due {invoice.due_on} · {billingDollars(invoice.outstanding_minor)} outstanding{invoice.days_overdue > 0 && invoice.outstanding_minor !== '0' ? ` · ${invoice.days_overdue} days overdue` : ''}</p><BillingInvoice tenant={tenant} property={property} account={detail.id} invoice={invoice.invoice_id} number={invoice.invoice_number}/></section>)}

      </div>
      <div hidden={accountView!=='matching'}>
      {actor&&<fieldset disabled={transferBusy||invoiceBusy||paymentBusy||undoBusy||postingBusy} style={{border:0,padding:0,margin:0}}><MatchBillingPayment actor={actor} tenant={tenant} property={property} account={detail.id} invoices={detail.receivables.invoices} onBusyChange={setMatchBusy} onSaved={result=>{setMatchSaved(result==='cancelled'?'This invoice match was previously cancelled. No money moved.':'Invoice match saved. No money moved.');void refreshAccountViews(detail.id)}}/></fieldset>}
      {actor&&<fieldset disabled={transferBusy||invoiceBusy||paymentBusy||matchBusy||postingBusy} style={{border:0,padding:0,margin:0}}><BillingMatchHistory actor={actor} tenant={tenant} property={property} account={detail.id} invoices={detail.receivables.invoices} onBusyChange={setUndoBusy} onSaved={()=>{setMatchSaved('Match undone. No refund was sent.');void refreshAccountViews(detail.id)}}/></fieldset>}
      </div>
      <div hidden={accountView!=='payments'}>
      <h3>Recorded payments</h3>
      {actor&&<fieldset disabled={transferBusy||invoiceBusy||matchBusy||undoBusy||postingBusy} style={{border:0,padding:0,margin:0}}><RecordBillingPayment actor={actor} tenant={tenant} property={property} account={detail.id} onBusyChange={setPaymentBusy} onSaved={(_id,kind)=>{setPaymentSaved(kind==='external_refund'?'Refund recorded successfully. No bank refund was initiated.':'Payment recorded successfully. No card charge was initiated.');void refreshAccountViews(detail.id)}}/></fieldset>}

      <p>These are recorded payment entries, not confirmation of a new bank transaction.</p>

      {detail.ledger.payments.length === 0 && <p>No payments recorded.</p>}

      {detail.ledger.payments.map(payment => <div key={payment.payment_id}><p>{payment.kind === 'external_payment' ? 'Receipt' : payment.kind === 'external_refund' ? 'Refund' : 'Correction'} · {billingDollars(payment.amount_minor)} · {payment.status === 'posted' ? `Posted ${payment.posting_date ?? ''}` : 'Needs ledger posting'}</p>{actor&&<><button className="secondary" disabled={transferBusy||invoiceBusy||paymentBusy||matchBusy||undoBusy||postingBusy} onClick={()=>setPostingPayment(payment.payment_id)}>Posting / recovery</button>{postingPayment===payment.payment_id&&<fieldset disabled={transferBusy||invoiceBusy||paymentBusy||matchBusy||undoBusy} style={{border:0,padding:0,margin:0}}><PostBillingPayment actor={actor} tenant={tenant} property={property} account={detail.id} payment={payment} posted={payment.status==='posted'} onBusyChange={setPostingBusy} onSaved={()=>{setPostingSaved(true);void refreshAccountViews(detail.id)}}/></fieldset>}</>}</div>)}

      </div>
    </section>}

  </>;

}

