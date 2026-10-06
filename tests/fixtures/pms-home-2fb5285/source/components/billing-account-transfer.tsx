'use client';
import {useCallback,useState} from 'react';
import {BillingTransfer} from './billing-transfer';
export type TransferReservation={id:string;guest_name?:string|null;source_booking_id:string;arrival:string|null;departure:string|null};
type Props={actor:string;tenant:string;property:string;account:string;reservations:TransferReservation[];onSaved:()=>void;onBusyChange:(busy:boolean)=>void};
export function BillingAccountTransfer(props:Props){return <TransferSelection key={[props.actor,props.tenant,props.property,props.account].join('/')} {...props}/>}
function TransferSelection(props:Props){
 const [reservation,setReservation]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(false);
 const busyChanged=useCallback((value:boolean)=>{setBusy(value);props.onBusyChange(value)},[props.onBusyChange]);
 return <section aria-label="Select stay to transfer"><h3>Transfer charges from a stay</h3><p>Select a reservation, then review the charge and amount. Transfers change who owes the charge; they do not collect payment.</p>
 <label className="field">Reservation for charge transfer<select value={reservation} disabled={busy||pending} onChange={e=>setReservation(e.target.value)}><option value="">Select a reservation</option>{props.reservations.map(stay=><option key={stay.id} value={stay.id}>{stay.guest_name||stay.source_booking_id} · {stay.arrival??'Unknown arrival'} to {stay.departure??'Unknown departure'}</option>)}</select></label>
 {!props.reservations.length&&<p>No reservations are loaded for this property.</p>}{pending&&<p>Resolve the saved transfer before choosing another reservation.</p>}
 {reservation&&<BillingTransfer actor={props.actor} tenant={props.tenant} property={props.property} account={props.account} reservation={reservation} onSaved={props.onSaved} onBusyChange={busyChanged} onPendingChange={setPending}/>}
 </section>;
}
