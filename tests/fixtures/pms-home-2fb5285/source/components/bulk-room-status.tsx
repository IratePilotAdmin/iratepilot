'use client';
import {useRef,useState} from 'react';
import {hotelRpc,type Room} from '@/lib/pilot';
import {definitiveBookingRejection} from '@/lib/pending-booking';

export function BulkRoomStatus({rooms,tenant,property,actor,businessDate,canManage,occupiedIds,disabled,onBusyChange,onSaved}:{rooms:Room[];tenant:string;property:string;actor:string;businessDate:string;canManage:boolean;occupiedIds:string[];disabled:boolean;onBusyChange:(v:boolean)=>void;onSaved:()=>Promise<void>}){
 const lock=useRef(false);const [working,setWorking]=useState(false),[results,setResults]=useState<string[]>([]);
 async function save(status:'Clean'|'Dirty'){
  if(disabled||lock.current||!canManage)return;
  lock.current=true;setWorking(true);onBusyChange(true);const messages:string[]=[];setResults([]);
  try{
   for(const room of rooms){
    const key='irp-quick-room:'+actor+':'+tenant+':'+property+':'+room.id;
    try{
     const raw=sessionStorage.getItem(key);
     if(!raw&&status==='Clean'&&(occupiedIds.includes(room.id)||room.maintenance_intervals?.some(i=>i.start<=businessDate&&i.end>businessDate))){messages.push('Room '+room.label+': skipped — '+(occupiedIds.includes(room.id)?'guest is still in house.':'release maintenance first.'));continue;}
     const command=raw?JSON.parse(raw):{p_tenant:tenant,p_property:property,p_room:room.id,p_request:crypto.randomUUID(),p_expected_version:room.state_version,p_status:status};
     if(!command||command.p_tenant!==tenant||command.p_property!==property||command.p_room!==room.id||!['Clean','Dirty'].includes(command.p_status)||!Number.isSafeInteger(command.p_expected_version)||typeof command.p_request!=='string')throw Error('Saved room update needs review.');
     if(command.p_status!==status)throw Error('Retry '+command.p_status+' first to resolve the previous update.');
     sessionStorage.setItem(key,JSON.stringify(command));
     const result=await hotelRpc<{request_id:string;replayed:boolean;room:{id:string;tenant_id:string;property_id:string;housekeeping:string;state_version:number}}>('quick_room_status',command);
     if(result.request_id!==command.p_request||result.room?.id!==room.id||result.room.tenant_id!==tenant||result.room.property_id!==property||result.room.housekeeping!==status||typeof result.replayed!=='boolean'||!Number.isSafeInteger(result.room.state_version)||result.room.state_version<command.p_expected_version||result.room.state_version>command.p_expected_version+1)throw Error('Result unconfirmed. Retry the same status.');
     sessionStorage.removeItem(key);messages.push('Room '+room.label+': saved '+status+'.');
    }catch(e){if(definitiveBookingRejection(e))sessionStorage.removeItem(key);messages.push('Room '+room.label+': '+(e instanceof Error?e.message:'Could not save; retry the same status.'));}
    finally{setResults([...messages]);}
   }
   try{await onSaved();}catch{setResults([...messages,'Refresh the page to load current room statuses.']);}
  }finally{lock.current=false;setWorking(false);onBusyChange(false);}
 }
 return <div><p>Selected rooms: {rooms.map(r=>r.label).join(', ')}</p>{canManage?<><p>Clean confirms these rooms have been cleaned. Occupied rooms and rooms under maintenance will be skipped.</p><div className="pilot-actions"><button className="primary" type="button" disabled={disabled||working} onClick={()=>void save('Clean')}>Clean selected rooms</button><button className="secondary" type="button" disabled={disabled||working} onClick={()=>void save('Dirty')}>Dirty selected rooms</button></div></>:<p>An owner or manager can change room status.</p>}{working&&<p role="status">Updating rooms…</p>}<div aria-live="polite">{results.map((message,i)=><p key={i}>{message}</p>)}</div></div>;
}
