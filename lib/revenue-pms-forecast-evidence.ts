import {evaluateRevenueForecasts,type ForecastEvidence,type EvaluationScope} from './revenue-forecast-validation';
type StoredForecast=Omit<ForecastEvidence,'actual'|'predictedRooms'> & {predictedRooms:number|null;evidenceState:'recorded'|'insufficient_history'};
type ClosedDay={tenantId:string;propertyId:string;serviceDate:string;closedAt:string;snapshot:unknown};
type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Obj:null;
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function midnightAt(value:string,zone:string,day:string){
 const instant=new Date(value);if(!Number.isFinite(instant.getTime())||instant.getUTCMilliseconds()!==0)return false;
 try {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 const get=(k:string)=>parts.find(p=>p.type===k)?.value;
 return `${get('year')}-${get('month')}-${get('day')}`===day&&get('hour')==='00'&&get('minute')==='00'&&get('second')==='00';
 }catch{return false;}
}
function actualFor(f:StoredForecast,c:ClosedDay):ForecastEvidence['actual']{
 const s=obj(c.snapshot),totals=obj(s?.totals),inventory=obj(s?.inventory_snapshot);
 if(!s||s.can_close!==true||s.rows_truncated!==false||!totals||totals.complete!==true||!integer(totals.occupied_nights)||!inventory||inventory.complete!==true||inventory.schema_version!==1||inventory.basis!=='inventory_configuration_at_close'||inventory.service_date!==c.serviceDate||s.next_service_date!==c.serviceDate||typeof s.time_zone!=='string'||!Array.isArray(s.rows)||!Array.isArray(inventory.room_types))return null;
 const dayInstant=Date.parse(f.stayDate+'T00:00:00Z');if(!Number.isFinite(dayInstant))return null;
 const nextDay=new Date(dayInstant+86400000).toISOString().slice(0,10);
 if(!midnightAt(f.stayStartAt,s.time_zone,f.stayDate)||!midnightAt(f.stayEndAt,s.time_zone,nextDay))return null;
 const capacities=new Map<string,number>();
 for(const v of inventory.room_types){const r=obj(v);if(!r||typeof r.room_type_id!=='string'||!r.room_type_id||!integer(r.effective_units)||capacities.has(r.room_type_id))return null;capacities.set(r.room_type_id,r.effective_units);}
 const physicalRooms=new Set<string>(),occupiedByType=new Map<string,number>();let total=0,occupied=0;
 for(const v of s.rows){const r=obj(v);if(!r||typeof r.room_type_id!=='string'||!capacities.has(r.room_type_id)||typeof r.occupied_night!=='boolean'||r.blocker!==null)return null;
  if(r.occupied_night){if(typeof r.physical_room_id!=='string'||!r.physical_room_id||physicalRooms.has(r.physical_room_id))return null;physicalRooms.add(r.physical_room_id);total++;const typeOccupied=(occupiedByType.get(r.room_type_id)??0)+1;if(typeOccupied>capacities.get(r.room_type_id)!)return null;occupiedByType.set(r.room_type_id,typeOccupied);if(r.room_type_id===f.roomTypeId)occupied++;}
 }
 const capacity=capacities.get(f.roomTypeId);if(capacity===undefined||capacity===0||total!==totals.occupied_nights||occupied>capacity)return null;
 return {observedAt:c.closedAt,complete:true,capacity,occupiedRooms:occupied};
}
/** Accept only finalized calendar-night snapshots; never infer actuals from live reservations. */
export function evaluatePmsForecastEvidence(forecasts:StoredForecast[],closes:ClosedDay[],scope:EvaluationScope){
 const days=new Map<string,ClosedDay>();
 for(const c of closes){if(c.tenantId!==scope.tenantId||c.propertyId!==scope.propertyId)continue;if(days.has(c.serviceDate))throw Error('Duplicate service-day close.');days.set(c.serviceDate,c);}
 let pendingHistory=0,rejectedCloses=0;
 const evidence:ForecastEvidence[]=[];
 for(const f of forecasts){if(f.tenantId!==scope.tenantId||f.propertyId!==scope.propertyId)continue;
  if(f.evidenceState!=='recorded'||f.predictedRooms===null){pendingHistory++;continue;}
  const c=days.get(f.stayDate);const actual=c?actualFor(f,c):null;if(c&&!actual)rejectedCloses++;
  evidence.push({...f,predictedRooms:f.predictedRooms,actual});
 }
 return {...evaluateRevenueForecasts(evidence,scope),pendingHistory,rejectedCloses};
}
