'use client';
import {useEffect,useRef,useState} from 'react';
import {cents,formText,hotelRpc,usd,type Booking,type RoomType,type HotelWorkspace} from '@/lib/pilot';
import {OtaStayChangeRequest} from '@/components/ota-stay-change-request';
export type AmendmentResult={reservation:Booking;replayed:boolean;folio_opening_retained:boolean;financial_reconciliation_required:boolean;pricing_reconciliation_required?:boolean;hotel_fees_retained?:boolean};
export function AmendReservation({tenant,property,actor,role,businessDate,booking,types,onBusyChange,onSaved,onOtaSynced}:{tenant:string;property:string;actor:string;role:string;businessDate:string;booking:Booking;types:RoomType[];onBusyChange:(busy:boolean)=>void;onSaved:(result:AmendmentResult)=>Promise<void>;onOtaSynced:(status:{found:boolean;request_id?:string;arrival?:string;departure?:string})=>Promise<void>}){
 const [current,setCurrent]=useState(booking),[formRevision,setFormRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');const request=useRef<string|null>(null),lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(lock.current)onBusyChange(false)}},[onBusyChange]);
 function begin(){if(lock.current)return false;lock.current=true;setBusy(true);onBusyChange(true);setError('');return true}
 function finish(){lock.current=false;if(alive.current){setBusy(false);onBusyChange(false)}}
 async function refresh(){if(!begin())return;try{const workspace=await hotelRpc<HotelWorkspace>('workspace',{p_tenant:tenant,p_property:property});const latest=workspace.reservations.find(r=>r.id===booking.id);if(!latest)throw Error('The reservation is no longer available in this workspace.');setCurrent(latest);setFormRevision(v=>v+1);request.current=null}catch(e){setError(e instanceof Error?e.message:'Unable to refresh reservation.')}finally{finish()}}
 async function save(form:FormData){
  if(!begin())return;
  try{request.current??=crypto.randomUUID();const result=await hotelRpc<AmendmentResult>('amend_reservation',{p_tenant:tenant,p_property:property,p_reservation:current.id,p_request:request.current,p_expected_version:current.source_version,p_guest_name:formText(form,'name'),p_room_type:formText(form,'type'),p_arrival:formText(form,'arrival'),p_departure:formText(form,'departure'),p_guests:Number(form.get('guests')),p_accommodation_minor:cents(form.get('amount')),p_taxes_minor:cents(form.get('taxes'))});setCurrent(result.reservation);request.current=null;if(alive.current)await onSaved(result)}catch(e){setError(e instanceof Error?e.message:'Unable to amend reservation.')}finally{finish()}
 }
 if(current.source==='iratepilot-ota')return <OtaStayChangeRequest key={`${actor}:${tenant}:${property}:${current.id}:${current.source_version}`} actor={actor} tenant={tenant} property={property} role={role} booking={current} businessDate={businessDate} disabled={busy} onBusyChange={onBusyChange} onSaved={onOtaSynced}/>;
 return <><p>Every stay night is checked again before saving. Source identifiers stay unchanged. Opened folios retain their original charges and may need a manager’s adjustment.</p>{error&&<div className="pilot-error" role="alert">{error}</div>}<button className="text-button" disabled={busy} onClick={()=>void refresh()}>Reload latest reservation and discard these edits</button>
  {current.status!=='Confirmed'||current.source==='iratepilot-ota'?<p>This reservation cannot be edited here in its current state.</p>:<form key={current.id+'/'+current.source_version+'/'+formRevision} onSubmit={e=>{e.preventDefault();void save(new FormData(e.currentTarget))}}>
   <label className="field">Guest name<input name="name" required maxLength={200} defaultValue={current.guest_name??''} disabled={busy}/></label>
   <label className="field">Room type<select name="type" required defaultValue={current.room_type_id??''} disabled={busy}>{types.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
   <div className="form-grid"><label className="field">Arrival<input name="arrival" type="date" required defaultValue={current.arrival??''} disabled={busy}/></label><label className="field">Departure<input name="departure" type="date" required defaultValue={current.departure??''} disabled={busy}/></label></div>
   <label className="field">Guests<input name="guests" type="number" min="1" max="20" required defaultValue={current.guests??1} disabled={busy}/></label>
   <div className="form-grid"><label className="field">Accommodation (USD)<input name="amount" type="number" min="0" step="0.01" required defaultValue={((current.accommodation_minor??0)/100).toFixed(2)} disabled={busy}/></label><label className="field">Taxes (USD)<input name="taxes" type="number" min="0" step="0.01" required defaultValue={((current.taxes_minor??0)/100).toFixed(2)} disabled={busy}/></label></div>
   {(current.hotel_fees_minor??0)>0&&<p className="pilot-notice">Hotel fees of {usd(current.hotel_fees_minor)} are retained in addition to the accommodation and taxes entered here. Date changes do not recalculate these fees; review the folio and record any needed adjustment.</p>}
   <p className="muted">A manager must approve changes to amounts once the folio has opened. No payment is captured or refunded by this action.</p><button className="primary" disabled={busy}>{busy?'Saving…':'Save reservation changes'}</button>
  </form>}
 </>;
}
