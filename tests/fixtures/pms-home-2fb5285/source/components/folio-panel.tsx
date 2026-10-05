'use client';
import {useEffect,useRef,useState} from 'react';
import {cents,formText,hotelRpc,usd} from '@/lib/pilot';
import {guestBillingBalance,type GuestBillingBalance} from '@/lib/guest-billing-balance';
import {ChargeBreakdown} from '@/components/charge-breakdown';
import {CashierPayment} from '@/components/cashier-payment';
import {ReservationInvoices} from '@/components/reservation-invoices';
import {SplitFolioWorkspace} from '@/components/split-folio-workspace';
import type {ChargeBreakdown as Breakdown} from '@/lib/rates';
type Entry={id:string;request_id:string;kind:string;amount_minor:number;reference:string;reason:string;target_entry_id:string|null;created_at:string};
type Folio={available:boolean;opening_mode:string;reservation_amounts_changed:boolean;opening:{accommodation_minor:number;taxes_minor:number;fees_minor:number;hotel_fees_minor?:number;charge_breakdown?:Breakdown|null;total_minor:number};totals:{charges_minor:number;paid_minor:number;balance_minor:number;external_payments_minor:number;external_refunds_minor:number;corrected_payments_minor:number};entries:Entry[]};
type Command={id:string;args:{p_kind:string;p_amount_minor:number;p_reference:string;p_reason:string;p_target:string|null}};
const labels:Record<string,string>={charge:'Additional charge',charge_reversal:'Charge reversal',external_payment:'External payment record',external_refund:'External refund record',payment_correction:'Payment record reduction'};
function readFailure(cause:unknown,fallback:string,canCorrect:boolean){
 const message=cause instanceof Error?cause.message:'';
 return message==='Opening charge reversals require itemized invoice reconciliation'
  ?canCorrect?'An opening charge reversal needs its category breakdown. Select Review opening corrections below, enter the room, tax or fee amounts, and confirm the correction split. Then refresh this folio. Do not record the reversal again.':'An opening charge reversal needs review by an owner or manager. Ask them to reconcile its categories, then refresh this folio.'
  :message||fallback;
}
function restore(key:string):Command|null{try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return value&&typeof value.id==='string'&&value.args&&typeof value.args.p_kind==='string'?value:null}catch{return null}}
export function FolioPanel({tenant,property,reservation,actor,role,timeZone,onBusyChange,disabled=false,onReview,paymentOnly=false,billingEnabled=false,billingReadApi="billing_folio"}:{billingReadApi?:"billing_folio"|"guest_folio";billingEnabled?:boolean;paymentOnly?:boolean;tenant:string;property:string;reservation:string;actor:string;role:string;timeZone:string;onBusyChange:(busy:boolean)=>void;disabled?:boolean;onReview?:(entry:string)=>void}){
 const recordedTime=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone});
 const storageKey='iratepilot-pms-pending-folio:'+actor+':'+tenant+':'+property+':'+reservation;
 const [folio,setFolio]=useState<Folio|null>(null),[kind,setKind]=useState(paymentOnly?'external_payment':'charge'),[busy,setBusy]=useState(false),[fresh,setFresh]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<Command|null>(()=>restore(storageKey));
 const [guestBalance,setGuestBalance]=useState<GuestBillingBalance|null>(null);
 const lock=useRef(false),alive=useRef(true),sequence=useRef(0),scope={p_tenant:tenant,p_property:property,p_reservation:reservation};
 function clearPending(){if(!alive.current)return;sessionStorage.removeItem(storageKey);setPending(null)}
 async function read(){
  if(!billingEnabled)return {folio:await hotelRpc<Folio>('folio',scope),balance:null};
  const snapshot=await hotelRpc<{folio:Folio}>(billingReadApi,scope);
  return {folio:snapshot.folio,balance:guestBillingBalance(snapshot,{tenant,property,reservation})};
 }
 useEffect(()=>{alive.current=true;let live=true;const version=++sequence.current;setFresh(false);setFolio(null);setGuestBalance(null);setError('');read().then(d=>{if(live&&version===sequence.current){setFolio(d.folio);setGuestBalance(d.balance);setFresh(true)}}).catch(e=>live&&setError(readFailure(e,'Unable to load folio.',postingAllowed)));return()=>{live=false;alive.current=false;sequence.current++;if(lock.current)onBusyChange(false)}},[tenant,property,reservation,billingEnabled,billingReadApi,onBusyChange]);
 async function load(){const version=++sequence.current;const data=await read();if(alive.current&&version===sequence.current){setFolio(data.folio);setGuestBalance(data.balance);setFresh(true)}return data.folio}
 function start(){if(lock.current||disabled)return false;lock.current=true;setBusy(true);onBusyChange(true);setError('');setNotice('');return true}
 function finish(){lock.current=false;if(alive.current){setBusy(false);onBusyChange(false)}}
 async function refresh(){
  if(!start())return;
  try{const data=await load();if(pending&&data.entries.some(e=>e.request_id===pending.id)){clearPending();setNotice('The pending entry is recorded. Its receipt has been restored.')}}catch(e){setFresh(false);setError(readFailure(e,'Unable to refresh folio.',postingAllowed))}finally{finish()}
 }
 async function execute(command:Command){
  if(!start())return;
  try{
   const result=await hotelRpc<{replayed:boolean}>('post_folio',{...scope,...command.args,p_request:command.id});
   clearPending();setNotice(result.replayed?'The existing entry was restored. No duplicate was posted.':'Folio entry recorded.');
   try{await load()}catch(e){setFresh(false);setError(readFailure(e,'The entry was recorded, but the folio could not refresh. Refresh before posting another entry.',postingAllowed))}
  }catch(e){
   const code=e&&typeof e==='object'&&'code' in e?String(e.code):'';
   if(/^(22[A-Z0-9]{3}|23[A-Z0-9]{3}|42[A-Z0-9]{3}|P0001|PT409|PT412|40001|40P01)$/.test(code)){clearPending();setError(e instanceof Error?e.message:'The database rejected this entry.');setFresh(false)}
   else{setError('The result is uncertain. Refresh to find its receipt or retry the exact saved request below.');setFresh(false)}
  }finally{finish()}
 }
 function post(form:HTMLFormElement){
  if(lock.current||disabled||pending||!fresh)return;
  try{
   const fields=new FormData(form),command={id:crypto.randomUUID(),args:{p_kind:kind,p_amount_minor:cents(fields.get('amount')),p_reference:formText(fields,'reference').trim(),p_reason:formText(fields,'reason').trim(),p_target:formText(fields,'target')||null}};
   sessionStorage.setItem(storageKey,JSON.stringify(command));setPending(command);void execute(command);
  }catch(e){setError(e instanceof Error?e.message:'The browser could not preserve this request. No entry was submitted.')}
 }
 const currentBalance=billingEnabled?(guestBalance?.available?Number(guestBalance.guestMinor):null):folio?.totals?.balance_minor;
 const suggestion=billingEnabled?(guestBalance?.available?guestBalance.paymentSuggestion:undefined):(currentBalance!=null&&currentBalance>0?(currentBalance/100).toFixed(2):undefined);
 const postingAllowed=['owner','manager'].includes(role);
 async function cashRecorded(){setFresh(false);try{await load()}catch{setError('Cash was recorded. Refresh the folio before posting another entry.')}}
 return <section className="pilot-folio">
  <p>USD · Payment and refund records describe transactions completed outside iRatePilot PMS. This form does not move money.</p>
  {error&&<div className="pilot-error" role="alert">{error}</div>}{notice&&<output className="pilot-notice">{notice}</output>}
  <button className="text-button" disabled={busy||disabled} onClick={()=>void refresh()}>Refresh folio</button>
  {!paymentOnly&&postingAllowed&&<ReservationInvoices tenant={tenant} property={property} reservation={reservation} actor={actor} disabled={busy||disabled}/>}
  {pending&&<div className="pilot-settings"><h3>Resolve the saved request</h3><p>{labels[pending.args.p_kind]} · {usd(pending.args.p_amount_minor)} · {pending.args.p_reference}</p><p>{pending.args.p_reason}</p><p>Its fields are preserved until the database confirms the result. Refresh checks for a receipt; retry uses the same request identity.</p><button className="secondary" disabled={busy||disabled||!postingAllowed} onClick={()=>void execute(pending)}>Retry this exact request</button></div>}
  {!folio?<p>{error?'Folio amounts are unavailable until the review or refresh succeeds.':'Loading folio…'}</p>:!folio.available?<p>Reservation charges are unavailable. Reconcile the source reservation before opening a folio.</p>:<>
   {!fresh&&<p role="status">These are the last loaded amounts. Complete the review and refresh before relying on this balance or posting another entry.</p>}
   {folio.reservation_amounts_changed&&<div className="pilot-error">The reservation’s amounts changed after this folio opened. Review the difference and post a documented adjustment.</div>}
   <div className="detail-grid"><div>Charges<b>{usd(folio.totals.charges_minor)}</b></div><div>Recorded net payments<b>{usd(folio.totals.paid_minor)}</b></div><div>{currentBalance!=null&&currentBalance<0?'Recorded credit':billingEnabled?'Guest balance':'Current balance'}<b>{currentBalance==null?'Unavailable':usd(Math.abs(currentBalance))}</b></div><div>Opening stay value<b>{usd(folio.opening.total_minor)}</b></div></div>
   {billingEnabled&&guestBalance?.available&&<p>Transferred to billing accounts: {usd(Number(guestBalance.transferredMinor))}. Original balance: {usd(Number(guestBalance.originalMinor))}.</p>}
   <SplitFolioWorkspace key={tenant+'/'+property+'/'+reservation+'/'+actor} tenant={tenant} property={property} reservation={reservation} actor={actor} role={role} disabled={busy||disabled} onBusyChange={onBusyChange}/>
   {!paymentOnly&&<><p className="muted">Opening: accommodation {usd(folio.opening.accommodation_minor)}, taxes {usd(folio.opening.taxes_minor)}, hotel fees {usd(folio.opening.hotel_fees_minor)}, OTA fees {usd(folio.opening.fees_minor)}. {folio.opening_mode==='reservation_preview'?'The first posted entry fixes these opening amounts.':'Opening amounts are preserved for the audit history.'}</p>
   {folio.opening.charge_breakdown&&<ChargeBreakdown value={folio.opening.charge_breakdown}/>}
   <p className="muted">Recorded payments {usd(folio.totals.external_payments_minor)} − actual refunds {usd(folio.totals.external_refunds_minor)} − record corrections {usd(folio.totals.corrected_payments_minor)}.</p>
   <h3>Entry history</h3><p className="muted">Recorded times use {timeZone}.</p><div className="pilot-table-wrap"><table className="pilot-table"><thead><tr><th>Entry / reference</th><th>Amount</th><th>Reason</th>{onReview&&<th>Review</th>}</tr></thead><tbody>{folio.entries.map(e=><tr key={e.id}><td>{labels[e.kind]}<small>{e.reference} · <time dateTime={e.created_at}>{recordedTime.format(new Date(e.created_at))}</time></small></td><td>{usd(e.amount_minor)}</td><td>{e.reason}</td>{onReview&&<td>{['external_payment','external_refund'].includes(e.kind)&&<button className="text-button" disabled={busy||disabled||!fresh||!!pending} onClick={()=>{if(!busy&&!disabled&&fresh&&!pending)onReview(e.id)}}>Payment record review</button>}</td>}</tr>)}</tbody></table></div>{!folio.entries.length&&<p>No additional entries recorded.</p>}</>}
   {postingAllowed&&<CashierPayment recoveryOnly={!fresh} tenant={tenant} property={property} reservation={reservation} actor={actor} role={role} disabled={busy||disabled||!!pending} onBusyChange={value=>{lock.current=value;setBusy(value);onBusyChange(value)}} onRecorded={cashRecorded}/>}
   {postingAllowed&&!pending&&<form key={paymentOnly?kind+':'+currentBalance:kind} onSubmit={e=>{e.preventDefault();post(e.currentTarget)}}>
    <h3>{paymentOnly?'Record payment received':'Record an entry'}</h3><label className="field">Entry type<select value={kind} disabled={busy||disabled||!fresh} onChange={e=>{setKind(e.target.value);setNotice('')}}>{Object.entries(labels).filter(([value])=>!paymentOnly||value==='external_payment').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    {['charge_reversal','external_refund','payment_correction'].includes(kind)&&<label className="field">Apply against<select name="target" required={kind!=='charge_reversal'} disabled={busy||disabled||!fresh}>{kind==='charge_reversal'?<option value="">Opening stay charges</option>:<option value="">Select the recorded payment</option>}{folio.entries.filter(e=>e.kind===(kind==='charge_reversal'?'charge':'external_payment')).map(e=><option value={e.id} key={e.id}>{e.reference} · {usd(e.amount_minor)}</option>)}</select></label>}
    <div className="form-grid"><label className="field">Amount (USD)<input name="amount" defaultValue={paymentOnly?suggestion??undefined:undefined} type="number" min="0.01" step="0.01" required disabled={busy||disabled||!fresh}/></label><label className="field">Transaction / document reference<input name="reference" required minLength={4} maxLength={200} disabled={busy||disabled||!fresh}/></label></div>
    <label className="field">Reason<input name="reason" required minLength={4} maxLength={500} disabled={busy||disabled||!fresh}/></label>
    <p className="muted">Use a distinct transaction or accounting reference. Do not enter card numbers or security codes. Charge errors use reversals; overstated payment records use reductions. A refund record requires an actual external refund.</p>
    <label className="pilot-check"><input type="checkbox" required disabled={busy||disabled||!fresh}/>{kind.startsWith('external_')?'I verified this transaction in the external payment record.':kind==='payment_correction'?'This reduces an incorrect payment record; no external refund occurred.':'I reviewed the amount, reference, and reason.'}</label>
    <button className="primary" disabled={busy||disabled||!fresh}>{busy?'Recording…':'Record '+labels[kind].toLowerCase()}</button>
   </form>}
  </>}
 </section>;
}

