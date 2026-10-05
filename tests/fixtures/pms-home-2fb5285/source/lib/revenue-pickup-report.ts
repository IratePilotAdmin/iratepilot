import {pickupInstant} from './pickup-time';
import {validRevenueSnapshot,type RevenueSnapshot} from './revenue-pickup';
export function pickupBatchSnapshots(value:unknown,tenant:string,property:string,capture:string):RevenueSnapshot[]{
 const fail=()=>{throw Error('Saved pickup capture is incomplete or does not match the selected property.');};
 if(!value||typeof value!=='object')return fail();
 const d=value as Record<string,unknown>,b=d.batch as Record<string,unknown>|null;
 if(d.schema_version!==1||d.tenant_id!==tenant||d.property_id!==property||!b||b.tenant_id!==tenant||b.property_id!==property||b.capture_id!==capture||!Array.isArray(d.rows)||d.rows.length!==b.row_count||d.rows.length<1||d.rows.length>10000)return fail();
 const start=b.start_date,end=b.end_date;
 const isDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!isDate(start)||!isDate(end)||end<=start)return fail();
 const nights=(Date.parse(end)-Date.parse(start))/86400000;if(nights>31)return fail();
 const seen=new Set<string>(),types=new Set<string>();
 const rows=d.rows.map(raw=>{
  if(!raw||typeof raw!=='object')return fail();const r=raw as Record<string,unknown>;
  if(r.tenant_id!==tenant||r.property_id!==property||r.capture_id!==capture||r.capacity_basis!=='maintenance-effective-v1'||!isDate(r.stay_date)||r.stay_date<start||r.stay_date>=end)return fail();
  const s:RevenueSnapshot={tenantId:tenant,propertyId:property,roomTypeId:r.room_type_id as string,currency:r.currency as string,stayDate:r.stay_date,capturedAt:r.captured_at as string,basis:r.revenue_basis as RevenueSnapshot['basis'],bookedRoomNights:r.booked_room_nights as number,sellableRoomNights:r.sellable_room_nights as number|null,roomRevenueMinor:r.room_revenue_minor as number|null};
  if(!validRevenueSnapshot(s)||!Number.isSafeInteger(r.unknown_revenue_room_nights)||(r.unknown_revenue_room_nights as number)<0||(r.unknown_revenue_room_nights as number)>s.bookedRoomNights||((r.unknown_revenue_room_nights===0)!==(s.roomRevenueMinor!==null)))return fail();
  const key=s.roomTypeId+':'+s.stayDate;if(seen.has(key))return fail();seen.add(key);types.add(s.roomTypeId);return s;
 });
 if(rows.length!==types.size*nights)return fail();
 return rows;
}


export type PickupCapture={capture_id:string;started_at:string;start_date:string;end_date:string};
export type PickupCursor={time:string;id:string};
export function pickupHistoryPage(value:unknown,tenant:string,property:string):{batches:PickupCapture[];next:PickupCursor|null}{
 const fail=():never=>{throw Error('Saved capture history is incomplete or does not match this property.');};
 if(!value||typeof value!=='object')return fail();
 const d=value as Record<string,unknown>;
 if(d.schema_version!==1||d.tenant_id!==tenant||d.property_id!==property||!Array.isArray(d.batches)||d.batches.length>50||typeof d.has_more!=='boolean')return fail();
 const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const seen=new Set<string>();
 const batches=d.batches.map(raw=>{
  if(!raw||typeof raw!=='object')return fail();const c=raw as Record<string,unknown>;
  if(typeof c.capture_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.capture_id)||seen.has(c.capture_id)||typeof c.started_at!=='string'||pickupInstant(c.started_at)===null||!date(c.start_date)||!date(c.end_date)||c.end_date<=c.start_date||Date.parse(c.end_date)-Date.parse(c.start_date)>31*86400000)return fail();
  seen.add(c.capture_id);return {capture_id:c.capture_id,started_at:c.started_at,start_date:c.start_date,end_date:c.end_date};
 });
 if(!d.has_more){if(d.next_cursor!==null)return fail();return {batches,next:null};}
 const last=batches.at(-1),next=d.next_cursor as Record<string,unknown>|null;
 if(!last||!next||next.time!==last.started_at||next.id!==last.capture_id)return fail();
 return {batches,next:{time:last.started_at,id:last.capture_id}};
}
