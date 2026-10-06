'use client';
import {useState,type ReactNode} from 'react';
import type {Room} from '@/lib/pilot';
export function RoomReadinessGrid({rooms,businessDate,typeName,renderRoom,disabled}:{rooms:Room[];businessDate:string;typeName:(id:string)=>string;renderRoom:(room:Room)=>ReactNode;disabled:boolean}){
 const [search,setSearch]=useState(''),[status,setStatus]=useState('');
 const query=search.trim().toLocaleLowerCase();
 const matches=(room:Room)=>(!query||(room.label+' '+typeName(room.room_type_id)).toLocaleLowerCase().includes(query))&&(!status||(status==='maintenance'?room.maintenance_intervals?.some(i=>i.start<=businessDate&&businessDate<i.end):room.status===status));
 const count=rooms.filter(matches).length;
 return <div><div className="readiness-filters"><label className="field">Find room or room type<input type="search" value={search} disabled={disabled} onChange={e=>setSearch(e.target.value)}/></label><label className="field">Room filter<select value={status} disabled={disabled} onChange={e=>setStatus(e.target.value)}><option value="">All rooms</option><option value="Dirty">Dirty</option><option value="Inspect">Inspect</option><option value="Clean">Clean</option><option value="maintenance">Active maintenance</option></select></label><button className="secondary" disabled={disabled||(!search&&!status)} onClick={()=>{setSearch('');setStatus('')}}>Clear filters</button></div>
 <p role="status">{count} of {rooms.length} rooms shown</p>
 <div className="pilot-room-grid">{rooms.map(room=><div key={room.id} hidden={!matches(room)} style={!matches(room)?{display:'none'}:undefined}>{renderRoom(room)}</div>)}</div>
 {!rooms.length?<section className="card pilot-empty">Add physical rooms in Property settings to start housekeeping.</section>:!count&&<p>No rooms match these filters.</p>}
 </div>;
}
