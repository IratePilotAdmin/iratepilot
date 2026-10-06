export type PickupFact={reservation_id:string;source_version:number;quote_id:string|null;quote_link_count:number;room_revenue_minor:number|null};
export function pickupEvidencePage(value:unknown,scope:{tenant:string;property:string;capture:string;roomType:string;day:string},after:string|null=null):{facts:PickupFact[];next:string|null}{
 const fail=():never=>{throw Error('Reservation evidence is incomplete or does not match this capture.');};
 const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
 const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
 if(!value||typeof value!=='object')return fail();
 const d=value as Record<string,unknown>,s=d.snapshot as Record<string,unknown>|null;
 if(d.schema_version!==1||d.reconciled!==true||!s||s.tenant_id!==scope.tenant||s.property_id!==scope.property||s.capture_id!==scope.capture||s.room_type_id!==scope.roomType||s.stay_date!==scope.day||!Array.isArray(d.facts)||d.facts.length>100||typeof d.has_more!=='boolean'||(after!==null&&!uuid(after)))return fail();
 let previous=after;
 const facts=d.facts.map(raw=>{
  if(!raw||typeof raw!=='object')return fail();const f=raw as Record<string,unknown>;
  if(!uuid(f.reservation_id)||(previous!==null&&f.reservation_id<=previous)||!integer(f.source_version)||f.source_version<1||!integer(f.quote_link_count)||(f.quote_id!==null&&!uuid(f.quote_id))||(f.room_revenue_minor!==null&&!integer(f.room_revenue_minor))||(f.room_revenue_minor!==null&&(f.quote_id===null||f.quote_link_count!==1)))return fail();
  previous=f.reservation_id;
  return {reservation_id:f.reservation_id,source_version:f.source_version,quote_id:f.quote_id as string|null,quote_link_count:f.quote_link_count,room_revenue_minor:f.room_revenue_minor as number|null};
 });
 if(d.has_more){if(!facts.length||d.next_cursor!==previous)return fail();return {facts,next:previous};}
 if(d.next_cursor!==null)return fail();
 return {facts,next:null};
}
