'use client';
import {useEffect,useRef,useState} from 'react';
import {formText,hotelRpc,usd} from '@/lib/pilot';

type Entry={id:string;folio_account_id:string;request_id:string;kind:string;amount_minor:number;reference:string;reason:string;target_entry_id:string|null;created_at:string};
type Account={id:string;reservation_id:string;name:string;account_type:string;create_request_id:string|null;is_primary:boolean;totals:{charges_minor:number;paid_minor:number;balance_minor:number};entries:Entry[]};
type RouteReceipt={request_id:string;source_entry_id:string;destination_folio_id:string;amount_minor:number;reversal_entry_id:string;charge_entry_id:string};
type Snapshot={reservation_id:string;available:boolean;accounts:Account[];routing_requests:RouteReceipt[]};
type Pending=
 |{id:string;operation:'create';name:string;accountType:string}
 |{id:string;operation:'post';account:string;kind:string;amount:number;reference:string;reason:string;target:string|null}
 |{id:string;operation:'route';source:string;destination:string;amount:number;reason:string};
const entryLabels:Record<string,string>={charge:'Charge',charge_reversal:'Charge reversal',external_payment:'External payment record',external_refund:'External refund record',payment_correction:'Payment record reduction'};
function restore(key:string):{pending:Pending|null;corrupt:boolean}{
 try{const raw=sessionStorage.getItem(key);if(!raw)return {pending:null,corrupt:false};const value=JSON.parse(raw);if(!value||typeof value.id!=='string')return {pending:null,corrupt:true};if(value.operation==='create'&&typeof value.name==='string'&&typeof value.accountType==='string')return {pending:value as Pending,corrupt:false};if(value.operation==='post'&&typeof value.account==='string'&&typeof value.kind==='string'&&Number.isSafeInteger(value.amount)&&value.amount>0&&typeof value.reference==='string'&&typeof value.reason==='string'&&(value.target===null||typeof value.target==='string'))return {pending:value as Pending,corrupt:false};if(value.operation==='route'&&typeof value.source==='string'&&typeof value.destination==='string'&&Number.isSafeInteger(value.amount)&&value.amount>0&&typeof value.reason==='string')return {pending:value as Pending,corrupt:false};return {pending:null,corrupt:true}}
 catch{return {pending:null,corrupt:true}}
}
function validateSnapshot(value:Snapshot,reservation:string):Snapshot{
 if(!value||value.reservation_id!==reservation||!Array.isArray(value.accounts)||!Array.isArray(value.routing_requests))throw Error('The split-folio response did not match this reservation. Refresh before using it.');
 for(const account of value.accounts){
  if(!account||account.reservation_id!==reservation||typeof account.id!=='string'||typeof account.name!=='string'||!account.totals||!Array.isArray(account.entries)||!Number.isSafeInteger(account.totals.balance_minor))throw Error('The split-folio response was incomplete. Refresh before using it.');
  for(const entry of account.entries)if(!entry||entry.folio_account_id!==account.id||!Number.isSafeInteger(entry.amount_minor))throw Error('A folio entry did not match its account. Refresh before using it.');
 }
 return value;
}
function hasReceipt(data:Snapshot,command:Pending):boolean{
 if(command.operation==='create')return data.accounts.some(account=>account.create_request_id===command.id);
 if(command.operation==='post')return data.accounts.some(account=>account.entries.some(entry=>entry.request_id===command.id));
 return data.routing_requests.some(route=>route.request_id===command.id);
}

export function SplitFolioWorkspace({tenant,property,reservation,actor,role,disabled,onBusyChange}:{tenant:string;property:string;reservation:string;actor:string;role:string;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
 const storageKey='irp-split-folio:'+actor+':'+tenant+':'+property+':'+reservation;
 const [initialRecovery]=useState(()=>typeof window==='undefined'?{pending:null,corrupt:false}:restore(storageKey));
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[pending,setPending]=useState<Pending|null>(initialRecovery.pending),[corrupt,setCorrupt]=useState(initialRecovery.corrupt),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [kind,setKind]=useState('charge');
 const [selectedAccount,setSelectedAccount]=useState('');
 const [routeSource,setRouteSource]=useState('');
 const busyRef=useRef(false),alive=useRef(true),sequence=useRef(0);
 const canWrite=['owner','manager'].includes(role);
 const accounts=snapshot?.accounts??[];
 const pendingDescription=pending?.operation==='create'?'Create '+pending.name:pending?.operation==='post'?entryLabels[pending.kind]+' · '+usd(pending.amount):pending?.operation==='route'?'Route charge · '+usd(pending.amount):'';
 function begin(){if(busyRef.current||disabled)return false;busyRef.current=true;setBusy(true);onBusyChange(true);setError('');setNotice('');return true}
 function finish(){busyRef.current=false;if(alive.current){setBusy(false);onBusyChange(false)}}
 function clearPending(){if(!alive.current)return;sessionStorage.removeItem(storageKey);setPending(null);setCorrupt(false)}
 async function fetchSnapshot(){
  const version=++sequence.current;
  const value=validateSnapshot(await hotelRpc<Snapshot>('folio_accounts',{p_tenant:tenant,p_property:property,p_reservation:reservation}),reservation);
  if(alive.current&&version===sequence.current){setSnapshot(value);setSelectedAccount(current=>value.accounts.some(a=>a.id===current)?current:(value.accounts.find(a=>a.is_primary)?.id??value.accounts[0]?.id??''));}
  return value;
 }
 useEffect(()=>{
  alive.current=true;let live=true;const version=++sequence.current;const recovery=initialRecovery;
  hotelRpc<Snapshot>('folio_accounts',{p_tenant:tenant,p_property:property,p_reservation:reservation}).then(raw=>{
   if(!live||!alive.current||version!==sequence.current)return;
   const value=validateSnapshot(raw,reservation);setSnapshot(value);setSelectedAccount(value.accounts.find(a=>a.is_primary)?.id??value.accounts[0]?.id??'');
   if(recovery.pending&&hasReceipt(value,recovery.pending)){sessionStorage.removeItem(storageKey);setPending(null);setNotice('The saved split-folio request is recorded. Its receipt has been restored.')}
  }).catch(cause=>{if(live&&alive.current&&version===sequence.current)setError(cause instanceof Error?cause.message:'Unable to load split folios.')});
  return()=>{live=false;alive.current=false;if(busyRef.current)onBusyChange(false)};
 },[tenant,property,reservation,actor,onBusyChange,initialRecovery,storageKey]);

 async function refresh(){if(!begin())return;try{const value=await fetchSnapshot();if(pending&&hasReceipt(value,pending)){clearPending();setNotice('The saved split-folio request is recorded. Its receipt has been restored.')}}catch(cause){setError(cause instanceof Error?cause.message:'Unable to refresh split folios.')}finally{finish()}}
 async function submit(command:Pending){
  if(!canWrite||corrupt||pending||busyRef.current)return;
  try{sessionStorage.setItem(storageKey,JSON.stringify(command));setPending(command)}catch{setError('The browser could not preserve this request. Nothing was submitted.');return}
  await send(command);
 }
 async function send(command:Pending){
  if(!canWrite||corrupt||!begin())return;
  try{
   if(command.operation==='create')await hotelRpc('create_folio_account',{p_tenant:tenant,p_property:property,p_reservation:reservation,p_request:command.id,p_name:command.name,p_account_type:command.accountType});
   else if(command.operation==='post')await hotelRpc('post_folio_to_account',{p_tenant:tenant,p_property:property,p_reservation:reservation,p_folio_account:command.account,p_request:command.id,p_kind:command.kind,p_amount_minor:command.amount,p_reference:command.reference,p_reason:command.reason,p_target:command.target});
   else await hotelRpc('route_folio_charge',{p_tenant:tenant,p_property:property,p_reservation:reservation,p_request:command.id,p_source_entry:command.source,p_destination_folio:command.destination,p_amount_minor:command.amount,p_reason:command.reason});
   clearPending();setNotice('Saved to the reservation ledger.');
   try{await fetchSnapshot()}catch(cause){setError(cause instanceof Error?cause.message:'The save succeeded, but the folio could not refresh. Refresh before another change.')}
  }catch(cause){
   const code=cause&&typeof cause==='object'&&'code' in cause?String(cause.code):'';
   if(/^(22[A-Z0-9]{3}|23[A-Z0-9]{3}|42[A-Z0-9]{3}|P0001|PT409|PT412|40001|40P01)$/.test(code)){clearPending();setError(cause instanceof Error?cause.message:'The database rejected this folio request.')}
   else setError('The result is uncertain. Refresh to check for its receipt, or retry the exact saved request.');
  }finally{finish()}
 }
 function createAccount(form:HTMLFormElement){
  if(!canWrite||corrupt||pending||busy)return;
  try{const fields=new FormData(form),name=formText(fields,'name').trim(),accountType=formText(fields,'accountType');if(name.length<2||name.length>80)throw Error('Enter a folio name between 2 and 80 characters.');void submit({id:crypto.randomUUID(),operation:'create',name,accountType})}catch(cause){setError(cause instanceof Error?cause.message:'Check the folio details.')}
 }
 function postEntry(form:HTMLFormElement){
  if(!canWrite||corrupt||pending||busy||!selectedAccount)return;
  try{const fields=new FormData(form),amount=Number(formText(fields,'amount'));if(!Number.isSafeInteger(amount*100)||amount<=0)throw Error('Enter a valid positive amount.');const target=formText(fields,'target')||null;void submit({id:crypto.randomUUID(),operation:'post',account:selectedAccount,kind,amount:Math.round(amount*100),reference:formText(fields,'reference').trim(),reason:formText(fields,'reason').trim(),target})}catch(cause){setError(cause instanceof Error?cause.message:'Check the folio entry.')}
 }
 function routeEntry(form:HTMLFormElement){
  if(!canWrite||corrupt||pending||busy)return;
  try{const fields=new FormData(form),amount=Number(formText(fields,'amount')),source=formText(fields,'source'),destination=formText(fields,'destination');if(!Number.isSafeInteger(amount*100)||amount<=0||!source||!destination||source===destination)throw Error('Choose a charge, a different destination folio, and a positive amount.');void submit({id:crypto.randomUUID(),operation:'route',source,destination,amount:Math.round(amount*100),reason:formText(fields,'reason').trim()})}catch(cause){setError(cause instanceof Error?cause.message:'Check the routing details.')}
 }
 const allEntries=accounts.flatMap(a=>a.entries);
 const routable=allEntries.filter(entry=>entry.kind==='charge'&&entry.amount_minor>allEntries.filter(x=>x.kind==='charge_reversal'&&x.target_entry_id===entry.id).reduce((sum,x)=>sum+x.amount_minor,0));
 return <section className="pilot-settings split-folio-workspace">
  <h3>Split folios</h3><p>Separate guest and company charges and payment records for this stay. The reservation balance stays combined. Payment records are external only; this does not collect or move money.</p>
  {error&&<div className="pilot-error" role="alert">{error}</div>}{notice&&<output className="pilot-notice">{notice}</output>}
  {corrupt&&<div className="pilot-error" role="alert">A saved split-folio recovery request could not be read. Do not start another financial change in this browser; contact an owner or manager to reconcile it.</div>}
  {pending&&<div><strong>Resolve saved request</strong><p>{pendingDescription}</p><p>Refresh checks for its receipt. Retry sends the exact saved request identity.</p><button type="button" className="secondary" disabled={busy||disabled||!snapshot} onClick={()=>void refresh()}>Check saved request</button> <button type="button" className="secondary" disabled={busy||disabled} onClick={()=>void send(pending)}>Retry exact request</button></div>}
  {!snapshot?<p>{error?'Split-folio balances are unavailable until refresh succeeds.':'Loading folio accounts…'}</p>:!snapshot.available?<p>Reservation charges are unavailable. Reconcile the reservation before using split folios.</p>:<>
   <div className="detail-grid">{accounts.map(account=><div key={account.id}>{account.name}<b>Balance {usd(account.totals.balance_minor)}</b><small>{usd(account.totals.charges_minor)} charges · {usd(account.totals.paid_minor)} recorded net payments</small></div>)}</div>
   <button type="button" className="text-button" disabled={busy||disabled} onClick={()=>void refresh()}>Refresh split folios</button>
   {canWrite&&<>
    <form className="split-folio-form" onSubmit={event=>{event.preventDefault();createAccount(event.currentTarget)}}>
     <h4>Add a folio</h4><div className="form-grid"><label className="field">Folio name<input name="name" minLength={2} maxLength={80} placeholder="Company or group" required disabled={busy||disabled||!!pending}/></label><label className="field">Type<select name="accountType" defaultValue="company" disabled={busy||disabled||!!pending}><option value="company">Company</option><option value="group">Group</option><option value="other">Other</option></select></label></div><button className="secondary" disabled={busy||disabled||!!pending}>Add folio</button>
    </form>
    {accounts.length>0&&<form className="split-folio-form" onSubmit={event=>{event.preventDefault();postEntry(event.currentTarget)}}>
     <h4>Record a folio entry</h4><label className="field">Folio<select value={selectedAccount} onChange={event=>setSelectedAccount(event.target.value)} disabled={busy||disabled||!!pending}>{accounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="field">Entry type<select value={kind} onChange={event=>setKind(event.target.value)} disabled={busy||disabled||!!pending}><option value="charge">Charge</option><option value="external_payment">Payment received (record only)</option><option value="charge_reversal">Charge reversal</option><option value="external_refund">Refund issued (record only)</option><option value="payment_correction">Payment record reduction</option></select></label>
     {['charge_reversal','external_refund','payment_correction'].includes(kind)&&<label className="field">Apply against<select name="target" required disabled={busy||disabled||!!pending}>{accounts.find(account=>account.id===selectedAccount)?.entries.filter(entry=>entry.kind===(kind==='charge_reversal'?'charge':'external_payment')).map(entry=><option key={entry.id} value={entry.id}>{entry.reference} · {usd(entry.amount_minor)}</option>)}</select></label>}
     <div className="form-grid"><label className="field">Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" required disabled={busy||disabled||!!pending}/></label><label className="field">Reference<input name="reference" minLength={4} maxLength={200} required disabled={busy||disabled||!!pending}/></label></div><label className="field">Reason<input name="reason" minLength={4} maxLength={500} required disabled={busy||disabled||!!pending}/></label><label className="pilot-check"><input type="checkbox" required disabled={busy||disabled||!!pending}/>{kind.startsWith('external_')?'I verified the payment or refund with the external processor.':'I reviewed the amount, reference and reason.'}</label><button className="primary" disabled={busy||disabled||!!pending}>{busy?'Saving…':'Record '+(entryLabels[kind]??'entry').toLowerCase()}</button>
    </form>}
    {routable.length>0&&accounts.length>1&&<form className="split-folio-form" onSubmit={event=>{event.preventDefault();routeEntry(event.currentTarget)}}>
     <h4>Route a charge</h4><p className="muted">Routing creates a reversal on the source folio and an equal charge on the destination. Reservation totals do not change.</p><label className="field">Charge<select name="source" value={routeSource||routable[0]?.id||''} onChange={event=>setRouteSource(event.target.value)} required disabled={busy||disabled||!!pending}>{routable.map(entry=>{const account=accounts.find(a=>a.id===entry.folio_account_id);const used=allEntries.filter(x=>x.kind==='charge_reversal'&&x.target_entry_id===entry.id).reduce((sum,x)=>sum+x.amount_minor,0);return <option key={entry.id} value={entry.id}>{account?.name??'Folio'} · {entry.reference} · remaining {usd(entry.amount_minor-used)}</option>})}</select></label><label className="field">Destination folio<select name="destination" required disabled={busy||disabled||!!pending}>{accounts.filter(account=>account.id!==allEntries.find(entry=>entry.id===(routeSource||routable[0]?.id))?.folio_account_id).map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label><div className="form-grid"><label className="field">Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" required disabled={busy||disabled||!!pending}/></label><label className="field">Reason<input name="reason" minLength={4} maxLength={500} required disabled={busy||disabled||!!pending}/></label></div><button className="secondary" disabled={busy||disabled||!!pending}>Route charge</button>
    </form>}
   </>}
   <details><summary>Folio entry history</summary><div className="pilot-table-wrap"><table className="pilot-table"><thead><tr><th>Folio</th><th>Entry / reference</th><th>Amount</th><th>Reason</th></tr></thead><tbody>{accounts.flatMap(account=>account.entries.map(entry=><tr key={entry.id}><td>{account.name}</td><td>{entryLabels[entry.kind]??entry.kind}<small>{entry.reference}</small></td><td>{usd(entry.amount_minor)}</td><td>{entry.reason}</td></tr>))}</tbody></table></div>{allEntries.length===0&&<p>No split-folio entries recorded.</p>}</details>
  </>}
 </section>;
}
