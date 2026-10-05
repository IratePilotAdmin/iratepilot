'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,usd} from '@/lib/pilot';
import {InvoiceCreditAction} from './invoice-credit-action';
import {readInvoiceCreditOptions} from '@/lib/invoice-credit-options';
type Props={tenant:string;property:string;invoice:string;actor:string;disabled:boolean};
export function InvoiceCreditPreview(props:Props){return <Preview key={[props.tenant,props.property,props.invoice,props.actor].join(':')} {...props}/>;}
function Preview({tenant,property,invoice,actor,disabled}:Props){
 const [options,setOptions]=useState<unknown>(null);
 const [preview,setPreview]=useState<ReturnType<typeof readInvoiceCreditOptions>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function load(){if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');setPreview(null);setOptions(null);try{
  const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');if(!alive.current)return;
  const result=await hotelRpc<unknown>('invoice_credit_options',{p_tenant:tenant,p_property:property,p_invoice:invoice});
  const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reopen this stay.');if(alive.current){setPreview(readInvoiceCreditOptions(result,{tenant,property,invoice,actor}));setOptions(result);}
 }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Unable to preview charges.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 return <section className="pilot-settings"><h3>Creditable charges</h3><p>Review original charges and prior credits. Total credits cannot exceed the unpaid invoice balance.</p><button disabled={busy||disabled} onClick={()=>void load()}>Preview creditable charges</button>{error&&<p role="alert">{error}</p>}{preview&&<><p>Unpaid invoice balance: {usd(Number(preview.outstanding_minor))}</p><table className="pilot-table"><thead><tr><th>Charge</th><th>Issued</th><th>Previously credited</th><th>Remaining on line</th></tr></thead><tbody>{preview.lines.map(line=><tr key={line.line_number}><td>{line.description}</td><td>{usd(Number(line.issued_minor))}</td><td>{usd(Number(line.credited_minor))}</td><td>{usd(Number(line.available_minor))}</td></tr>)}</tbody></table></>}<InvoiceCreditAction tenant={tenant} property={property} invoice={invoice} actor={actor} disabled={disabled||busy} options={options}/></section>;
}
