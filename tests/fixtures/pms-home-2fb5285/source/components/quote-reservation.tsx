'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc,formText,usd,type Booking,type RoomType} from '@/lib/pilot';
import {afterDays,type RateBook,type RateQuote} from '@/lib/rates';
import {useClientReady} from '@/lib/client-ready';
import {ChargeBreakdown} from '@/components/charge-breakdown';
type PendingBooking={quote:RateQuote;requestId:string;guestName:string};
function restoreBooking(key:string):{pending:PendingBooking|null;error:string}{
 try{const raw=sessionStorage.getItem(key);if(raw===null)return {pending:null,error:''};const data=JSON.parse(raw);
  const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
  if(!data||!uuid(data.quote?.id)||!uuid(data.requestId)||typeof data.guestName!=='string'||!data.guestName.trim()||!Array.isArray(data.quote.nights)||!data.quote.nights.length)throw Error();
  return {pending:data,error:''};
 }catch{return {pending:null,error:'The saved booking request cannot be read. Review the reservation list with a manager before preparing another booking. Do not clear this browser’s saved request until its result is reconciled.'}}
}

type QuoteReservationProps={beforeBook?:()=>string;initialGuestName?:string;bookingKind?:'front_desk'|'walk_in';onManual?:()=>void;onConfigureInventory?:(roomType:string,missingDate:string)=>void;tenant:string;property:string;actor:string;types:RoomType[];businessDate:string;onBusyChange:(busy:boolean)=>void;onSaved:(booking:Booking)=>Promise<void>};
export function QuoteReservation(props:QuoteReservationProps){return useClientReady()?<QuoteReservationForm key={props.actor+':'+props.tenant+':'+props.property} {...props}/>:<p>Loading saved booking…</p>;}
function QuoteReservationForm({tenant,property,actor,types,businessDate,onBusyChange,onSaved,onManual,onConfigureInventory,beforeBook,initialGuestName='',bookingKind='front_desk'}:QuoteReservationProps){
 const errorRef=useRef<HTMLDivElement>(null);
 const storageKey='iratepilot-pms-pending-quote:'+actor+':'+tenant+':'+property;
 const [initial]=useState(()=>restoreBooking(storageKey));
 const [pending,setPending]=useState<PendingBooking|null>(initial.pending);
 const [plans,setPlans]=useState<RateBook['plans']>([]),[quote,setQuote]=useState<RateQuote|null>(initial.pending?.quote??null),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false),alive=useRef(true),request=useRef<{key:string;id:string}|null>(null),scope={p_tenant:tenant,p_property:property};
 const [roomType,setRoomType]=useState(types[0]?.id??''),[planId,setPlanId]=useState(''),[arrival,setArrival]=useState(businessDate),[departure,setDeparture]=useState(afterDays(businessDate,1)),[guests,setGuests]=useState(2),[pricing,setPricing]=useState(false),[quoteKey,setQuoteKey]=useState(''),[refresh,setRefresh]=useState(0),[plansLoaded,setPlansLoaded]=useState(false);
 const [planError,setPlanError]=useState(''),[planRefresh,setPlanRefresh]=useState(0);
 const matchingPlans=plans.filter(p=>p.room_type_id===roomType),selectedPlan=matchingPlans.find(p=>p.id===planId)??matchingPlans[0];
 const pricingKey=JSON.stringify([tenant,property,selectedPlan?.id,arrival,departure,guests]);
 const visibleQuote=pending?quote:quoteKey===pricingKey?quote:null;
 useEffect(()=>{
  let live=true;let deadline:ReturnType<typeof setTimeout>|undefined;if(initial.error||pending||!selectedPlan||!arrival||!departure||departure<=arrival||!Number.isInteger(guests)||guests<1||guests>20){queueMicrotask(()=>{if(live)setPricing(false)});return()=>{live=false}}
  queueMicrotask(()=>{if(live){setPricing(true)}});
  const timer=setTimeout(()=>{const args={p_plan:selectedPlan.id,p_arrival:arrival,p_departure:departure,p_guests:guests};if(request.current?.key!==pricingKey)request.current={key:pricingKey,id:crypto.randomUUID()};
   deadline=setTimeout(()=>{if(live){live=false;setPricing(false);setQuote(null);setError('Loading the saved price took too long. Check your connection and select Refresh price.')}},15000);
   void hotelRpc<RateQuote>('quote_rate',{p_tenant:tenant,p_property:property,...args,p_request:request.current.id}).then(value=>{if(live){setQuote(value);setQuoteKey(pricingKey)}}).catch(e=>{if(live){setQuote(null);setError(e instanceof Error?e.message:'The saved rate could not load. Try Refresh price.')}}).finally(()=>{clearTimeout(deadline);if(live)setPricing(false)});
  },350);
  return()=>{live=false;clearTimeout(timer);clearTimeout(deadline)};
 },[tenant,property,selectedPlan,arrival,departure,guests,pricingKey,refresh,pending]);
 useEffect(()=>{
  if(initial.error)return;let live=true;setPlansLoaded(false);setPlanError('');setPlans([]);
  const timer=setTimeout(()=>{if(live){live=false;setPlanError('Loading rate plans took too long. Check your connection and retry.')}},15000);
  hotelRpc<RateBook>('rates',{p_tenant:tenant,p_property:property,p_start:businessDate,p_end:afterDays(businessDate,1)}).then(d=>{if(live){setPlans(d.plans.filter(p=>p.active));setPlansLoaded(true)}}).catch(()=>{if(live)setPlanError('Rate plans could not load. Check your connection and retry.')}).finally(()=>clearTimeout(timer));
  return()=>{live=false;clearTimeout(timer)};
 },[tenant,property,businessDate,planRefresh]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(lock.current)onBusyChange(false)}},[onBusyChange]);
 useEffect(()=>{if(error){errorRef.current?.scrollIntoView?.({block:'nearest'});errorRef.current?.focus()}},[error]);
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);onBusyChange(true);setError('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Unable to complete quoted booking.')}finally{lock.current=false;if(alive.current){setBusy(false);onBusyChange(false)}}}
 async function book(command:PendingBooking){
  let result:{reservation:Booking;quote_id:string;request_id:string;currency:string;quoted_total_minor:number};
  try{result=await hotelRpc<typeof result>(bookingKind==='walk_in'?'book_walk_in_quote':'book_quote',{...scope,p_quote:command.quote.id,p_request:command.requestId,p_guest_name:command.guestName})}
  catch(e){const code=e&&typeof e==='object'&&'code' in e?String(e.code):'';if(!pending&&/^(22[A-Z0-9]{3}|23[A-Z0-9]{3}|42[A-Z0-9]{3}|P0001|PT409|PT412|40001|40P01)$/.test(code)){sessionStorage.removeItem(storageKey);if(alive.current)setPending(null);throw e}throw Error('The booking result is uncertain. Retry the exact saved request; do not create another quote for this guest yet.')}
  if(!result||result.quote_id!==command.quote.id||result.request_id!==command.requestId||result.currency!=='USD'||result.quoted_total_minor!==command.quote.total_minor||!result.reservation||typeof result.reservation.id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.reservation.id))throw Error('The booking confirmation could not be verified. Retry the exact saved request; do not create another booking.');
  const booked=result.reservation,q=command.quote;
  if(booked.guest_name!==command.guestName.trim()||booked.room_type_id!==q.room_type_id||booked.arrival!==q.arrival||booked.departure!==q.departure||booked.guests!==q.guests||booked.accommodation_minor!==q.accommodation_minor||booked.taxes_minor!==q.taxes_minor||booked.hotel_fees_minor!==q.hotel_fees_minor||booked.guest_total_minor!==q.total_minor||(booked.package_description??'')!==(q.package_description??''))throw Error('The confirmed stay does not match the saved booking. Keep this request and review it with a manager before continuing.');
  if(alive.current){sessionStorage.removeItem(storageKey);setPending(null);try{await onSaved(result.reservation)}catch{throw Error('The reservation was saved, but the next screen could not load. Refresh the reservation list before continuing.')}}
 }
 if(initial.error)return <div className="pilot-error" role="alert">{initial.error}</div>;
 const missingCapacityDate=/Capacity is not configured on (\d{4}-\d{2}-\d{2})/i.exec(error)?.[1];
 return <><p>Select a room type and stay dates. Saved nightly rates, taxes and fees load automatically. Quotes do not hold inventory and expire after 15 minutes.</p>{error&&<div ref={errorRef} tabIndex={-1} className="pilot-error" role="alert">{error}</div>}{missingCapacityDate&&onConfigureInventory&&<button type="button" className="secondary" disabled={busy} onClick={()=>onConfigureInventory(roomType,missingCapacityDate)}>Set inventory for {missingCapacityDate}</button>}
  {!pending&&<div onChange={()=>setQuote(null)}><label className="field">Room type<select value={roomType} disabled={busy} onChange={e=>{setRoomType(e.target.value);setPlanId('')}}>{types.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label className="field">Active rate plan<select value={selectedPlan?.id??''} disabled={busy||!matchingPlans.length} onChange={e=>setPlanId(e.target.value)}>{!matchingPlans.length&&<option value="">{planError?'Rate plans unavailable':plansLoaded?'No active plan':'Loading rate plans…'}</option>}{matchingPlans.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div className="form-grid"><label className="field">Arrival<input type="date" required value={arrival} disabled={busy} onChange={e=>setArrival(e.target.value)}/></label><label className="field">Departure<input type="date" required value={departure} disabled={busy} onChange={e=>setDeparture(e.target.value)}/></label></div><label className="field">Guests<input type="number" min="1" max="20" value={guests} required disabled={busy} onChange={e=>setGuests(Number(e.target.value))}/></label>{departure&&departure<=arrival&&<p role="alert">Departure must be after arrival.</p>}{pricing&&<output>Loading saved nightly rate…</output>}<button type="button" className="secondary" disabled={busy||pricing||!selectedPlan} onClick={()=>{request.current=null;setQuote(null);setError('');setRefresh(n=>n+1)}}>Refresh price</button>{onManual&&<button type="button" className="text-button" disabled={busy} onClick={onManual}>Enter a manual reservation instead</button>}</div>}
  {!pending&&planError&&<div role="alert"><p>{planError}</p><button type="button" className="secondary" disabled={busy} onClick={()=>setPlanRefresh(n=>n+1)}>Retry rate plans</button></div>}
  {!pending&&plansLoaded&&!matchingPlans.length&&<p>No active rate plan for this room type. In Rates &amp; plans, activate its plan and set prices for every stay night, then reopen this form.</p>}
  {visibleQuote&&<section className="pilot-settings"><h3>Review this stay</h3><p>{types.find(t=>t.id===visibleQuote.room_type_id)?.name} · {visibleQuote.guests} guests · expires {new Date(visibleQuote.expires_at).toLocaleTimeString()}</p>{visibleQuote.package_description?.trim()&&<div className="pilot-notice"><strong>Included with this rate</strong><p>{visibleQuote.package_description}</p></div>}<div className="pilot-table-wrap"><table className="pilot-table"><thead><tr><th>Night</th><th>Room</th><th>Hotel fees</th><th>Tax</th><th>Total</th></tr></thead><tbody>{visibleQuote.nights.map(n=><tr key={n.date}><td>{n.date}</td><td>{usd(n.accommodation_minor)}</td><td>{usd(n.hotel_fees_minor)}</td><td>{usd(n.taxes_minor)}</td><td>{usd(n.total_minor)}</td></tr>)}</tbody></table></div>{visibleQuote.charge_breakdown?<ChargeBreakdown value={visibleQuote.charge_breakdown}/>:<h3>Total stay value: {usd(visibleQuote.total_minor)}</h3>}{pending?<div><p>Saved booking request for {pending.guestName}. Its dates and price are preserved until the database confirms the result.</p><button className="primary" disabled={busy} onClick={()=>void run(()=>book(pending))}>Retry this exact booking request</button></div>:<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{const command={quote:visibleQuote,requestId:crypto.randomUUID(),guestName:beforeBook?beforeBook():formText(f,'name').trim()};sessionStorage.setItem(storageKey,JSON.stringify(command));setPending(command);await book(command)})}}>{!beforeBook&&<label className="field">Guest name<input name="name" defaultValue={initialGuestName} required maxLength={200} disabled={busy}/></label>}<label className="pilot-check"><input type="checkbox" required disabled={busy}/>I reviewed these stay dates and charges.</label><p>Saving rechecks pricing and inventory. No payment is collected.</p><button className="primary" disabled={busy}>{busy?'Saving…':'Book this quoted stay'}</button></form>}{!pending&&<button className="text-button" disabled={busy} onClick={()=>{request.current=null;setQuote(null);setError('');setRefresh(n=>n+1)}}>Refresh current pricing</button>}</section>}
 </>;
}

