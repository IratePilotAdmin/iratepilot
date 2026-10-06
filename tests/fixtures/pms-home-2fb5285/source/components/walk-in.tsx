'use client';
import {useRef,useState} from 'react';
import {DocumentScan} from '@/components/document-scan';
import {GuestFields} from '@/components/guest-fields';
import {QuoteReservation} from '@/components/quote-reservation';
import {ReservationGuestPanel} from '@/components/reservation-guest-panel';
import {guestFormData,type GuestData,type BillingData} from '@/lib/guests';
import type {Booking,HotelWorkspace,Room} from '@/lib/pilot';
export function WalkIn({actor,tenant,property,workspace,room,onBusyChange,onReady,onConfigureInventory}:{actor:string;tenant:string;property:string;workspace:HotelWorkspace;room:Room;onBusyChange:(busy:boolean)=>void;onReady:(booking:Booking)=>Promise<void>;onConfigureInventory?:(roomType:string,missingDate:string)=>void}){
 const form=useRef<HTMLFormElement|null>(null);
 const [detailsReviewed,setDetailsReviewed]=useState(false);
 const [contact,setContact]=useState<Partial<GuestData>>({}),[billing,setBilling]=useState<BillingData|undefined>(),[sameGuest,setSameGuest]=useState(true),[revision,setRevision]=useState(0),[booking,setBooking]=useState<Booking|null>(null),[busy,setBusy]=useState(false);
 function beforeBook(){
  if(!form.current?.reportValidity())throw Error('Complete the guest details and confirm you reviewed them before booking.');
  const values=new FormData(form.current),reviewed=guestFormData(values,'walk_') as GuestData;
  if(!reviewed.display_name)throw Error('Enter the guest name.');
  setContact(reviewed);setBilling(sameGuest?undefined:guestFormData(values,'bill_',true) as BillingData);
  return reviewed.display_name;
 }
 return <><h3>Walk-in · Room {room.label}</h3><p>Guest details → Room and rate → Payment → Check-in</p>{room.status!=='Clean'&&<p className="pilot-notice">Room {room.label} is {room.status.toLowerCase()}. You can save this stay now. Before check-in, prepare the room or have an owner or manager approve a dirty-room override with a reason. An override does not mark the room clean.</p>}
 {!booking?<><h3>Guest details</h3><DocumentScan disabled={busy} onRead={values=>{setDetailsReviewed(false);const previous=form.current?guestFormData(new FormData(form.current),'walk_'):contact;setContact({...previous,...values});setRevision(n=>n+1)}}/><form ref={form} onChange={e=>{if(e.target instanceof HTMLInputElement&&e.target.name.startsWith('walk_'))setDetailsReviewed(false)}} onSubmit={e=>e.preventDefault()}><GuestFields key={revision} prefix="walk_" data={contact} compact requiredName disabled={busy}/><label className="pilot-check"><input type="checkbox" required checked={detailsReviewed} onChange={e=>setDetailsReviewed(e.target.checked)} disabled={busy}/>I checked these guest details.</label><h3>Billing</h3><label className="pilot-check"><input type="checkbox" checked={sameGuest} disabled={busy} onChange={e=>setSameGuest(e.target.checked)}/>Same as guest</label>{!sameGuest&&<><p>Bill another person or company</p><GuestFields prefix="bill_" data={{}} billing disabled={busy}/></>}</form><h3>Stay and price</h3><QuoteReservation bookingKind="walk_in" actor={actor} tenant={tenant} property={property} types={workspace.room_types.filter(t=>t.id===room.room_type_id)} businessDate={workspace.business_date} beforeBook={beforeBook} onConfigureInventory={onConfigureInventory} onBusyChange={value=>{setBusy(value);onBusyChange(value)}} onSaved={async value=>{setBooking(value)}}/></>:<><p>Reservation saved. Saving your reviewed guest and billing details before check-in. No payment has been collected.</p><ReservationGuestPanel actor={actor} tenant={tenant} property={property} reservation={booking.id} initialContact={contact} initialBilling={billing} autoSave onBusyChange={onBusyChange} onSaved={()=>onReady(booking)}/></>}
 </>;
}
