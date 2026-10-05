'use client';
import {InvoiceCreditPreview} from '@/components/invoice-credit-preview';
import {InvoicePaymentReview} from '@/components/invoice-payment-review';
import {InvoiceRecovery} from '@/components/invoice-recovery';
import {InvoiceSourcePreview} from '@/components/invoice-source-preview';
import {InvoiceCredits} from '@/components/invoice-credits';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,usd} from '@/lib/pilot';
import {readInvoiceDocument,invoicePrintModel} from '@/lib/invoice-document';
import {printGuestDocument} from '@/components/guest-document-view';
type Props={tenant:string;property:string;reservation:string;actor:string;disabled:boolean};
type Row={invoice_id:string;number:string};
export function ReservationInvoices(props:Props){return <Invoices key={[props.tenant,props.property,props.reservation,props.actor].join(':')} {...props}/>;}
function Invoices({tenant,property,reservation,actor,disabled}:Props){
 const [rows,setRows]=useState<Row[]|null>(null),[document,setDocument]=useState<ReturnType<typeof readInvoiceDocument>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const printing=useRef<(()=>void)|null>(null);
 const alive=useRef(false),lock=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;printing.current?.();};},[]);
 async function run(invoice?:string,print=false){
  if(disabled||lock.current)return;lock.current=true;printing.current?.();printing.current=null;setBusy(true);setError('');setDocument(null);if(!invoice)setRows(null);
  try{
   const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');if(!alive.current)return;
   const result=await hotelRpc<unknown>(invoice?'invoice_document':'reservation_invoices',invoice?{p_tenant:tenant,p_property:property,p_invoice:invoice}:{p_tenant:tenant,p_property:property,p_reservation:reservation});
   const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');if(!alive.current)return;
   if(invoice){if((result as {reservation_id?:string})?.reservation_id!==reservation)throw Error('Invoice belongs to a different stay.');const verified=readInvoiceDocument(result,{tenant,property,actor,invoice});setDocument(verified);if(print)printing.current=printGuestDocument(invoicePrintModel(verified));}
   else{
    const r=result as Record<string,unknown>;
    if(!r||r.schema_version!==1||r.tenant_id!==tenant||r.property_id!==property||r.reservation_id!==reservation||r.actor_id!==actor||r.currency!=='USD'||r.complete!==true||!Array.isArray(r.invoices)||r.invoices.length>1000)throw Error('Invoice list scope changed.');
    const seen=new Set<string>();setRows(r.invoices.map(value=>{const row=value as Row;if(!row||typeof row.invoice_id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.invoice_id)||seen.has(row.invoice_id)||typeof row.number!=='string'||!/^[1-9][0-9]{0,11}$/.test(row.number))throw Error('Invalid invoice list.');seen.add(row.invoice_id);return {invoice_id:row.invoice_id,number:row.number};}));
   }
  }catch(cause){if(alive.current){setRows(null);setDocument(null);setError(cause instanceof Error?cause.message:'Unable to load invoices.');}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <section className="pilot-settings"><InvoiceRecovery tenant={tenant} property={property} reservation={reservation} actor={actor} disabled={busy||disabled}/><InvoiceSourcePreview tenant={tenant} property={property} reservation={reservation} actor={actor} disabled={busy||disabled}/><h3>Issued invoices</h3><button disabled={busy||disabled} onClick={()=>void run()}>Load issued invoices</button>{rows?.length===0&&<p>No invoices issued for this stay.</p>}{rows?.map(row=><button key={row.invoice_id} disabled={busy||disabled} onClick={()=>void run(row.invoice_id)}>Open invoice {row.number}</button>)}{error&&<p role="alert">{error}</p>}
  {document&&<article aria-label={'Invoice '+document.number}><h3>Invoice {document.number}</h3><p>Issued {document.issued_on} · Due {document.due_on} · USD</p><div className="detail-grid"><section><h4>From</h4><p>{document.issuer.name}</p>{document.issuer.address.map((line,index)=><p key={index}>{line}</p>)}</section><section><h4>Bill to</h4><p>{document.recipient.name}</p>{document.recipient.address.map((line,index)=><p key={index}>{line}</p>)}</section></div><table className="pilot-table"><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>{document.lines.map(line=><tr key={line.number}><td>{line.description}</td><td>{usd(Number(line.amount_minor))}</td></tr>)}</tbody></table><dl><dt>Issued total</dt><dd>{usd(Number(document.issued_minor))}</dd><dt>Applied payments</dt><dd>{usd(Number(document.allocated_minor))}</dd><dt>Credit notes</dt><dd>{usd(Number(document.credited_minor))}</dd><dt>Outstanding as of {document.balance_as_of}</dt><dd>{usd(Number(document.outstanding_minor))}</dd></dl></article>}
 {document&&<button disabled={busy||disabled} onClick={()=>void run(document.id,true)}>Print invoice / Save as PDF</button>}
 {document&&<InvoicePaymentReview tenant={tenant} property={property} invoice={document.id} actor={actor} disabled={busy||disabled}/>}
 {document&&<InvoiceCreditPreview tenant={tenant} property={property} invoice={document.id} actor={actor} disabled={busy||disabled}/>}
 {document&&<InvoiceCredits tenant={tenant} property={property} invoice={document.id} actor={actor} disabled={busy||disabled}/>}
 </section>;
}
