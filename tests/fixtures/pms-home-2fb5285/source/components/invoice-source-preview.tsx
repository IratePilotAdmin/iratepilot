'use client';
import {OpeningReversalReview} from './invoice-opening-review';
import {InvoiceIssueForm} from '@/components/invoice-issue-form';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,usd} from '@/lib/pilot';
import {readInvoiceSources} from '@/lib/invoice-sources';
type Props={tenant:string;property:string;reservation:string;actor:string;disabled:boolean};
export function InvoiceSourcePreview(props:Props){return <Preview key={[props.tenant,props.property,props.reservation,props.actor].join(':')} {...props}/>;}
function Preview({tenant,property,reservation,actor,disabled}:Props){
 const [preview,setPreview]=useState<ReturnType<typeof readInvoiceSources>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function load(){if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');setPreview(null);try{
  const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');if(!alive.current)return;
  const result=await hotelRpc<unknown>('invoice_sources',{p_tenant:tenant,p_property:property,p_reservation:reservation});
  const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');if(alive.current)setPreview(readInvoiceSources(result,{tenant,property,reservation,actor}));
 }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Unable to preview charges.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 return <section className="pilot-settings"><h3>Billable charge preview</h3><p>Owners and managers can review charges available for an invoice. This preview does not issue an invoice.</p><button disabled={busy||disabled} onClick={()=>void load()}>Preview billable charges</button>{error&&<p role="alert">{error}</p>}{preview&&<><p>Available to invoice: {usd(Number(preview.available_minor))}</p><table className="pilot-table"><thead><tr><th>Charge</th><th>Recorded</th><th>Already invoiced, after credits</th><th>Transferred to billing accounts</th><th>Available</th></tr></thead><tbody>{preview.lines.map(line=><tr key={line.source_key}><td>{line.description}</td><td>{usd(Number(line.amount_minor))}</td><td>{usd(Number(line.invoiced_minor))}</td><td>{usd(Number(line.routed_minor))}</td><td>{usd(Number(line.available_minor))}</td></tr>)}</tbody></table>{preview.available_minor!=='0'&&<InvoiceIssueForm tenant={tenant} property={property} reservation={reservation} actor={actor} disabled={busy||disabled} preview={preview}/>}</>}<OpeningReversalReview tenant={tenant} property={property} reservation={reservation} actor={actor} disabled={disabled||busy}/></section>;
}
