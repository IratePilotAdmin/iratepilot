'use client';
import {useState} from 'react';
import type {Booking,HotelWorkspace} from '@/lib/pilot';
export function timelineDate(start:string,offset:number){const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
export function timelineOccupies(stay:Booking,date:string){return ['Confirmed','In house'].includes(stay.status)&&!!stay.arrival&&stay.arrival<=date&&!!stay.departure&&(stay.departure>date||!!stay.inventory_overdue)}
export function ReservationTimeline({workspace,onStay}:{workspace:HotelWorkspace;onStay:(stay:Booking)=>void}){
 const [offset,setOffset]=useState(0);
 const dates=Array.from({length:7},(_,i)=>timelineDate(workspace.business_date,offset+i));
 function jumpToDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<workspace.business_date)return;
  const selected=Date.parse(value+'T12:00:00Z'),start=Date.parse(workspace.business_date+'T12:00:00Z');
  if(!Number.isFinite(selected)||new Date(selected).toISOString().slice(0,10)!==value)return;
  setOffset(Math.round((selected-start)/86400000));
 }
 const active=workspace.reservations.filter(s=>dates.some(d=>timelineOccupies(s,d)));
 const roomIds=new Set(workspace.rooms.map(r=>r.id));
 const byRoom=new Map<string,Booking[]>(),unassigned:Booking[]=[];
 for(const stay of active){
  if(!stay.physical_room_id||!roomIds.has(stay.physical_room_id)){unassigned.push(stay);continue;}
  const assigned=byRoom.get(stay.physical_room_id);
  if(assigned)assigned.push(stay);else byRoom.set(stay.physical_room_id,[stay]);
 }
 function stays(rows:Booking[],date:string){return rows.filter(s=>timelineOccupies(s,date)).map(s=><button className={'timeline-stay '+(s.status==='In house'?'in-house':'')} key={s.id} onClick={()=>onStay(s)} aria-label={`${s.guest_name||'Guest'} · ${date} · ${s.status}`}><strong>{s.guest_name||'Guest'}</strong><small>{s.inventory_overdue?'Overdue — room held':s.status}</small></button>)}
 return <section className="card reservation-timeline"><div className="section-top"><h2>Reservation timeline</h2><div className="pilot-actions"><label className="field">Start date<input type="date" min={workspace.business_date} value={dates[0]} onInput={e=>jumpToDate(e.currentTarget.value)} onChange={e=>jumpToDate(e.target.value)}/></label><button className="secondary" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-7))}>Previous week</button><button className="secondary" onClick={()=>setOffset(0)}>Current week</button><button className="secondary" onClick={()=>setOffset(offset+7)}>Next week</button></div></div><p>Current room assignments, starting {dates[0]}. Select a stay to manage it. Empty cells do not confirm bookable inventory; rates, capacity and room readiness are checked when booking. Use Refresh workspace for the latest changes.</p><div className="pilot-table-wrap" tabIndex={0} role="region" aria-label="Reservation timeline dates"><table className="pilot-table"><caption>Stay nights · departure dates are excluded · current housekeeping shown beside rooms</caption><thead><tr><th scope="col">Room</th>{dates.map(d=><th key={d} scope="col">{d}</th>)}</tr></thead><tbody>{[...workspace.rooms].sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true})).map(room=><tr key={room.id}><th scope="row">{room.label}<small>{room.status}</small></th>{dates.map(d=><td key={d}>{stays(byRoom.get(room.id)??[],d)}{room.maintenance_intervals?.some(m=>m.start<=d&&m.end>d)&&<span className="timeline-maintenance">Maintenance</span>}</td>)}</tr>)}<tr><th scope="row">Unassigned</th>{dates.map(d=><td key={d}>{stays(unassigned,d)}</td>)}</tr></tbody></table></div></section>
}
