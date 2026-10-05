'use client';
import {useState,useRef} from 'react';
import {hotelRpc,type Booking,type HotelWorkspace} from '@/lib/pilot';
import {definitiveBookingRejection} from '@/lib/pending-booking';
export function AdvanceRoomAssignment({booking,workspace,tenant,property,actor,busy,onBusyChange,onSaved}:{booking:Booking;workspace:HotelWorkspace;tenant:string;property:string;actor:string;busy:boolean;onBusyChange:(v:boolean)=>void;onSaved:()=>Promise<void>}){
 const [room,setRoom]=useState(booking.physical_room_id??''),[error,setError]=useState('');const lock=useRef(false);
 const rooms=workspace.rooms.filter(r=>r.room_type_id===booking.room_type_id&&!r.maintenance_intervals?.some(m=>m.start<booking.departure!&&m.end>booking.arrival!)&&!workspace.reservations.some(b=>b.id!==booking.id&&b.physical_room_id===r.id&&['Confirmed','In house'].includes(b.status)&&((b.arrival!<booking.departure!&&b.departure!>booking.arrival!)||(b.status==='In house'&&b.departure!<=workspace.business_date)))).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
 const key='irp-advance-room:'+actor+':'+tenant+':'+property+':'+booking.id;
 async function save(){
  if(busy||lock.current)return;lock.current=true;onBusyChange(true);setError('');
  try{
   const raw=sessionStorage.getItem(key);const chosen=rooms.find(r=>r.id===room);
   const command=raw?JSON.parse(raw):{p_tenant:tenant,p_property:property,p_reservation:booking.id,p_request:crypto.randomUUID(),p_expected_source_version:booking.source_version,p_from_room:booking.physical_room_id,p_to_room:room,p_expected_room_version:chosen?.state_version};
   if(!command||command.p_tenant!==tenant||command.p_property!==property||command.p_reservation!==booking.id||typeof command.p_request!=='string'||typeof command.p_to_room!=='string'||!Number.isSafeInteger(command.p_expected_source_version)||!Number.isSafeInteger(command.p_expected_room_version))throw Error('Choose a room, or refresh to review the saved assignment request.');
   if(raw&&command.p_to_room!==room)throw Error('An earlier assignment needs recovery. Select its room and retry, or use Retry saved assignment.');
   sessionStorage.setItem(key,JSON.stringify(command));
   const result=await hotelRpc<{request_id:string;replayed:boolean;reservation:Booking}>('assign_room',command);
   if(result.request_id!==command.p_request||result.reservation?.id!==booking.id||result.reservation.physical_room_id!==command.p_to_room||result.reservation.status!=='Confirmed'||typeof result.replayed!=='boolean')throw Error('Assignment result could not be confirmed. Retry the saved assignment.');
   sessionStorage.removeItem(key);await onSaved();
  }catch(e){if(definitiveBookingRejection(e))sessionStorage.removeItem(key);setError(e instanceof Error?e.message:'Could not assign room. Retry.');}
  finally{lock.current=false;onBusyChange(false);}
 }
 function recover(){try{const raw=sessionStorage.getItem(key);if(!raw){setError('No saved request. Select a room and save.');return;}const c=JSON.parse(raw);setRoom(c.p_to_room);setError('Saved room selected. Click Assign room to retry the exact request.');}catch{setError('Saved request needs review.');}}
 return <section className="card"><h3>Assign room before arrival</h3><p>Reserve a room number for {booking.arrival} to {booking.departure}. The stay remains Confirmed; readiness is checked at check-in.</p><p>Current room: <b>{workspace.rooms.find(r=>r.id===booking.physical_room_id)?.label??'Unassigned'}</b></p><label className="field">Room number<select value={room} disabled={busy} onChange={e=>setRoom(e.target.value)}><option value="">Select a room</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.label} · {r.status}</option>)}{room&&!rooms.some(r=>r.id===room)&&<option value={room}>Previously selected room — recheck required</option>}</select></label>{!rooms.length&&<p>No rooms of this type are available for the full stay.</p>}<div className="pilot-actions"><button type="button" className="primary" disabled={busy||!room} onClick={()=>void save()}>Assign room</button><button type="button" className="text-button" disabled={busy} onClick={recover}>Retry saved assignment</button></div>{error&&<p role="alert">{error}</p>}</section>;
}
