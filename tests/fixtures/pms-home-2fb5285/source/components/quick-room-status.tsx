'use client';
import {useState,useRef} from 'react';
import {hotelRpc,type Room} from '@/lib/pilot';
import {definitiveBookingRejection} from '@/lib/pending-booking';
import {MaintenancePanel} from '@/components/maintenance-panel';
type Command={p_tenant:string;p_property:string;p_room:string;p_request:string;p_expected_version:number;p_status:'Clean'|'Dirty'};
export function QuickRoomStatus({room,tenant,property,actor,businessDate,canManage,occupied,disabled,onBusyChange,onSaved}:{room:Room;tenant:string;property:string;actor:string;businessDate:string;canManage:boolean;occupied:boolean;disabled:boolean;onBusyChange:(v:boolean)=>void;onSaved:()=>Promise<void>}){
 const [message,setMessage]=useState(''),[maintenance,setMaintenance]=useState(false),[working,setWorking]=useState(false);const lock=useRef(false);
 const key='irp-quick-room:'+actor+':'+tenant+':'+property+':'+room.id;
 async function save(status:'Clean'|'Dirty'){
  if(disabled||lock.current)return;lock.current=true;setWorking(true);onBusyChange(true);setMessage('');
  let command:Command|undefined;
  try{
   const raw=sessionStorage.getItem(key);
   command=raw?JSON.parse(raw):{p_tenant:tenant,p_property:property,p_room:room.id,p_request:crypto.randomUUID(),p_expected_version:room.state_version,p_status:status};
   if(!command||command.p_tenant!==tenant||command.p_property!==property||command.p_room!==room.id||!['Clean','Dirty'].includes(command.p_status)||!Number.isSafeInteger(command.p_expected_version)||typeof command.p_request!=='string')throw Error('Saved room update needs review.');
   if(command.p_status!==status)throw Error('Retry '+command.p_status+' first to resolve the previous room update.');
   sessionStorage.setItem(key,JSON.stringify(command));
   const result=await hotelRpc<{request_id:string;replayed:boolean;room:{id:string;tenant_id:string;property_id:string;housekeeping:string;state_version:number}}>('quick_room_status',command);
   if(result.request_id!==command.p_request||result.room?.id!==room.id||result.room.tenant_id!==tenant||result.room.property_id!==property||result.room.housekeeping!==status||typeof result.replayed!=='boolean'||!Number.isSafeInteger(result.room.state_version)||result.room.state_version<command.p_expected_version||result.room.state_version>command.p_expected_version+1)throw Error('Could not verify the saved status. Click the same status again to recover the result.');
   sessionStorage.removeItem(key);setMessage('Saved: '+status+'.');await onSaved();
  }catch(e){if(definitiveBookingRejection(e))sessionStorage.removeItem(key);setMessage(e instanceof Error?e.message:'Could not save. Retry the same status.');}
  finally{lock.current=false;setWorking(false);onBusyChange(false)}
 }
 const closed=room.maintenance_intervals?.some(i=>i.start<=businessDate&&i.end>businessDate);
 return <div><p>Current status: <b>{room.status}{closed?' · Maintenance':''}</b></p>{canManage?<><p>Choose Clean to confirm this room has been cleaned and is ready.</p><div className="pilot-actions"><button type="button" className="primary" disabled={disabled||working||occupied||closed} onClick={()=>void save('Clean')}>Clean</button><button type="button" className="secondary" disabled={disabled||working} onClick={()=>void save('Dirty')}>Dirty</button><button type="button" className="secondary" aria-expanded={maintenance} aria-controls={'room-maintenance-'+room.id} disabled={disabled||working} onClick={()=>setMaintenance(!maintenance)}>{maintenance?'Close maintenance controls':closed?'Review maintenance':'Maintenance'}</button></div>{occupied&&<p>The guest must check out before the room can be marked ready.</p>}{closed&&<p>This room cannot be marked Clean while its maintenance closure is active. Select Review maintenance, find this room’s active closure, choose Review release, enter a reason and confirm. Finish any needed repair and cleaning before selecting Clean. Releasing maintenance does not change housekeeping status.</p>}</>:<p>An owner or manager can change room status here.</p>}{message&&<p role="status">{message}</p>}<div id={'room-maintenance-'+room.id} hidden={!maintenance}>{maintenance&&<MaintenancePanel actor={actor} tenant={tenant} property={property} businessDate={businessDate} rooms={[room]} initialRoom={room.id} disabled={disabled||working} onBusyChange={onBusyChange} onSaved={onSaved}/>}</div></div>;
}
