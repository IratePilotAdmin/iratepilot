'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import type {PaymentScope} from '@/lib/billing-payment-entry';
import {billingDollars} from './billing-accounts';
type Row={allocation_id:string;invoice_id:string;payment_id:string;amount_minor:string;payment_reference:string;cancelled:boolean;cancellation_reason:string|null;cancelled_at:string|null};
type Undo=PaymentScope&{version:1;request:string;allocation:string;reason:string};
type Props=PaymentScope&{invoices:{invoice_id:string;invoice_number?:string}[];onSaved:()=>void;onBusyChange?:(busy:boolean)=>void};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
function verifyUndo(value:unknown,scope:PaymentScope):Undo{const r=value as Undo;if(!r||r.version!==1||(['actor','tenant','property','account'] as const).some(k=>r[k]!==scope[k])||!uuid(r.request)||!uuid(r.allocation)||typeof r.reason!=='string'||r.reason!==r.reason.trim()||r.reason.length<4||r.reason.length>500)throw Error('Saved undo request could not be verified.');return r}
export function BillingMatchHistory(props:Props){return <History key={[props.actor,props.tenant,props.property,props.account].join('/')} {...props}/>}
function History(props:Props){
 const key=['irp-unmatch',props.actor,props.tenant,props.property,props.account].join('/');
 const [initial]=useState(()=>{try{const raw=sessionStorage.getItem(key);return {pending:raw?verifyUndo(JSON.parse(raw),props):null,error:''}}catch{return {pending:null,error:'Saved undo request could not be read. Restore browser storage before continuing.'}}});
 const [pending,setPending]=useState<Undo|null>(initial.pending),[rows,setRows]=useState<Row[]|null>(null),[selected,setSelected]=useState<Row|null>(null),[reason,setReason]=useState(''),[error,setError]=useState(initial.error),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false),alive=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);useEffect(()=>{props.onBusyChange?.(busy);return()=>props.onBusyChange?.(false)},[busy,props.onBusyChange]);
 async function run(action:()=>Promise<void>){if(lock.current||initial.error)return;lock.current=true;setBusy(true);setError('');try{await action()}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to update invoice match.')}finally{lock.current=false;if(alive.current)setBusy(false)}}
 async function load(){setRows(null);setSelected(null);const v=await hotelRpc<{schema_version:number;tenant_id:string;property_id:string;account_id:string;currency:string;complete:boolean;money_moved:boolean;matches:Row[]}>('billing_matches',{p_tenant:props.tenant,p_property:props.property,p_account:props.account});
  if(!v||v.schema_version!==1||v.tenant_id!==props.tenant||v.property_id!==props.property||v.account_id!==props.account||v.currency!=='USD'||v.complete!==true||v.money_moved!==false||!Array.isArray(v.matches)||v.matches.length>10000)throw Error('Match history could not be verified.');const seen=new Set<string>();
  for(const r of v.matches){if(!r||!uuid(r.allocation_id)||!uuid(r.invoice_id)||!uuid(r.payment_id)||seen.has(r.allocation_id)||typeof r.amount_minor!=='string'||!/^[1-9][0-9]{0,11}$/.test(r.amount_minor)||typeof r.payment_reference!=='string'||typeof r.cancelled!=='boolean'||(r.cancelled?(typeof r.cancellation_reason!=='string'||typeof r.cancelled_at!=='string'||!Number.isFinite(Date.parse(r.cancelled_at))):(r.cancellation_reason!==null||r.cancelled_at!==null)))throw Error('Match history contains invalid details.');seen.add(r.allocation_id)}if(alive.current)setRows(v.matches);
 }
 async function undo(){const r=verifyUndo(pending??{version:1,actor:props.actor,tenant:props.tenant,property:props.property,account:props.account,request:crypto.randomUUID(),allocation:selected?.allocation_id,reason:reason.trim()},props);sessionStorage.setItem(key,JSON.stringify(r));setPending(r);
  const v=await hotelRpc<Record<string,unknown>>('unmatch_billing_payment',{p_tenant:r.tenant,p_property:r.property,p_account:r.account,p_request:r.request,p_allocation:r.allocation,p_reason:r.reason,p_confirmed:true});
  if(v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.account_id!==r.account||v.request_id!==r.request||v.allocation_id!==r.allocation||v.actor_id!==r.actor||v.reason!==r.reason||v.cancelled!==true||v.money_moved!==false)throw Error('Undo could not be verified. Retry the saved request.');
  if(!alive.current)return;sessionStorage.removeItem(key);setPending(null);setSelected(null);setRows(null);setNotice('Match undone. The receipt remains recorded; no refund was sent.');props.onSaved();
 }
 return <section className="pilot-settings" aria-label="Invoice match history"><h3>Invoice match history</h3>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<fieldset disabled={busy||!!initial.error} style={{border:0,padding:0,margin:0}}>
 {!pending&&<button className="secondary" onClick={()=>void run(load)}>Load match history</button>}
 {!pending&&rows?.map(r=><div key={r.allocation_id}><p>{props.invoices.find(i=>i.invoice_id===r.invoice_id)?.invoice_number??r.invoice_id} · {r.payment_reference} · {billingDollars(r.amount_minor)} · {r.cancelled?'Undone':'Active'}</p>{r.cancelled?<p>Reason: {r.cancellation_reason}</p>:<button className="secondary" onClick={()=>{setSelected(r);setReason('')}}>Undo match</button>}</div>)}{rows?.length===0&&<p>No invoice matches recorded.</p>}
 {(selected||pending)&&<><p>Undoing restores the invoice’s outstanding amount and makes the receipt available to match again.</p><label className="field">Reason for undoing match<textarea maxLength={500} disabled={!!pending} value={pending?.reason??reason} onChange={e=>setReason(e.target.value)}/></label><button className="primary" onClick={()=>void run(undo)}>{pending?'Retry saved undo':'Confirm undo match'}</button>{!pending&&<button className="secondary" onClick={()=>setSelected(null)}>Keep match</button>}</>}
 </fieldset>{busy&&<p role="status">Updating match history…</p>}</section>;
}
