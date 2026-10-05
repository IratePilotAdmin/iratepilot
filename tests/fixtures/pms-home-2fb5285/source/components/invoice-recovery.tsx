'use client';
import {invoiceResponse} from '@/lib/invoice-response';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import {loadPendingInvoice,clearPendingInvoice,readPendingInvoiceStatus} from '@/lib/invoice-pending';
type Props={tenant:string;property:string;reservation:string;actor:string;disabled:boolean};
export function InvoiceRecovery(props:Props){return <Recovery key={[props.tenant,props.property,props.reservation,props.actor].join(':')} {...props}/>;}
function Recovery({disabled,...scope}:Props){
 const [pending,setPending]=useState<ReturnType<typeof loadPendingInvoice>>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;try{setPending(loadPendingInvoice(sessionStorage,scope));}catch(cause){setError(cause instanceof Error?cause.message:'Unable to read pending invoice.');}return()=>{alive.current=false;};},[scope.tenant,scope.property,scope.reservation,scope.actor]);
 async function recover(cancel=false){if(lock.current||disabled||!pending||(cancel&&!confirmed))return;lock.current=true;setBusy(true);setError('');setMessage('');try{
  const user=await invoiceResponse(hotelClient().auth.getUser());if(user.error||user.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen this stay.');if(!alive.current)return;
  const result=await invoiceResponse(hotelRpc<unknown>(cancel?'cancel_invoice_request':'invoice_issue_status',{p_tenant:scope.tenant,p_property:scope.property,p_request:pending.request,...(cancel?{p_confirmed:true}:{})}));
  const again=await invoiceResponse(hotelClient().auth.getUser());if(again.error||again.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen this stay.');if(!alive.current)return;
  if(cancel){const r=result as Record<string,unknown>;if(!r||r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||r.request_id!==pending.request||r.cancelled!==true||typeof r.replayed!=='boolean')throw Error('Cancellation receipt does not match the pending request.');clearPendingInvoice(sessionStorage,scope,pending.request);setPending(null);setConfirmed(false);setMessage('Unrecorded invoice request cancelled. Review current charges before issuing a new invoice.');return;}
  const receipt=readPendingInvoiceStatus(result,pending);
  if(receipt){clearPendingInvoice(sessionStorage,scope,pending.request);setPending(null);setMessage('Invoice '+receipt.number+' was issued. Load issued invoices to open it.');}
  else setMessage('No issued invoice was found yet. Keep this request and check again before creating another invoice.');
 }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Unable to recover invoice.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 if(!pending&&!error&&!message)return null;
 return <section className="pilot-settings"><h3>Pending invoice recovery</h3>{pending&&<><p>An invoice request needs its saved result checked.</p><button disabled={busy||disabled} onClick={()=>void recover()}>Check invoice result</button><label><input type="checkbox" checked={confirmed} disabled={busy||disabled} onChange={e=>setConfirmed(e.target.checked)}/>Cancel this request only if no invoice was issued</label><button disabled={busy||disabled||!confirmed} onClick={()=>void recover(true)}>Cancel unrecorded invoice request</button></>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
