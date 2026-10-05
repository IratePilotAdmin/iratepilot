import {pickupInstant} from './pickup-time';
/** Pure comparison of authoritative nightly snapshots; no rate writes or forecast. */
export type RevenueSnapshot = {
 tenantId:string; propertyId:string; roomTypeId:string; currency:string;
 stayDate:string; capturedAt:string; basis:'booked-room-revenue-v1';
 bookedRoomNights:number; sellableRoomNights:number|null; roomRevenueMinor:number|null;
};
export type PickupComparison = {available:false;reason:string} | {
 available:true; roomNightsChange:number; roomRevenueChangeMinor:number|null;
 capacityChange:number|null; previousOccupancy:number|null; currentOccupancy:number|null;
 previousAdrMinor:number|null; currentAdrMinor:number|null;
 previousRevparMinor:number|null; currentRevparMinor:number|null;
};
export function validRevenueSnapshot(s:RevenueSnapshot){
 const date=/^\d{4}-\d{2}-\d{2}$/.test(s.stayDate)&&Number.isFinite(Date.parse(s.stayDate))&&new Date(s.stayDate).toISOString().slice(0,10)===s.stayDate;
 return [s.tenantId,s.propertyId,s.roomTypeId].every(v=>typeof v==='string'&&v.length>0)&&/^[A-Z]{3}$/.test(s.currency)&&date&&pickupInstant(s.capturedAt)!==null&&s.basis==='booked-room-revenue-v1'&&Number.isSafeInteger(s.bookedRoomNights)&&s.bookedRoomNights>=0&&(s.sellableRoomNights===null||(Number.isSafeInteger(s.sellableRoomNights)&&s.sellableRoomNights>=0))&&(s.roomRevenueMinor===null||(Number.isSafeInteger(s.roomRevenueMinor)&&s.roomRevenueMinor>=0));
}
export function compareRevenueSnapshots(previous:RevenueSnapshot|null,current:RevenueSnapshot|null):PickupComparison{
 if(!previous||!current)return {available:false,reason:'Both saved snapshots are required. Missing history is not zero pickup.'};
 if(!validRevenueSnapshot(previous)||!validRevenueSnapshot(current))return {available:false,reason:'Snapshot values are invalid.'};
 if(['tenantId','propertyId','roomTypeId','currency','stayDate','basis'].some(key=>previous[key as keyof RevenueSnapshot]!==current[key as keyof RevenueSnapshot]))return {available:false,reason:'Snapshots must use the same property, room type, stay night, currency and revenue basis.'};
 const previousTime=pickupInstant(previous.capturedAt),currentTime=pickupInstant(current.capturedAt);
 if(previousTime===null||currentTime===null)return {available:false,reason:'Snapshot timestamps are invalid.'};
 if(currentTime<=previousTime)return {available:false,reason:'The comparison snapshot must be later than the baseline.'};
 const ratio=(value:number|null,denominator:number|null)=>value===null||denominator===null||denominator===0?null:value/denominator;
 return {available:true,roomNightsChange:current.bookedRoomNights-previous.bookedRoomNights,roomRevenueChangeMinor:current.roomRevenueMinor===null||previous.roomRevenueMinor===null?null:current.roomRevenueMinor-previous.roomRevenueMinor,capacityChange:current.sellableRoomNights===null||previous.sellableRoomNights===null?null:current.sellableRoomNights-previous.sellableRoomNights,
 previousOccupancy:ratio(previous.bookedRoomNights,previous.sellableRoomNights),currentOccupancy:ratio(current.bookedRoomNights,current.sellableRoomNights),previousAdrMinor:ratio(previous.roomRevenueMinor,previous.bookedRoomNights),currentAdrMinor:ratio(current.roomRevenueMinor,current.bookedRoomNights),previousRevparMinor:ratio(previous.roomRevenueMinor,previous.sellableRoomNights),currentRevparMinor:ratio(current.roomRevenueMinor,current.sellableRoomNights)};
}

export type NightlyBookingFact={reservationId:string;sourceVersion:number;tenantId:string;propertyId:string;roomTypeId:string;stayDate:string;roomRevenueMinor:number|null};
/** The caller must supply a complete, transaction-consistent set of active booked nights. */
export function aggregateRevenueSnapshot(context:Omit<RevenueSnapshot,'bookedRoomNights'|'roomRevenueMinor'>,facts:NightlyBookingFact[],complete:boolean):{snapshot:RevenueSnapshot;unknownRevenueRoomNights:number}{
 if(!complete)throw Error('Incomplete reservation capture cannot produce a snapshot.');
 const ids=new Set<string>();let revenue=0,unknown=0;
 for(const fact of facts){
  if(!fact.reservationId||ids.has(fact.reservationId)||!Number.isSafeInteger(fact.sourceVersion)||fact.sourceVersion<1)throw Error('Duplicate or invalid reservation evidence.');
  if(fact.tenantId!==context.tenantId||fact.propertyId!==context.propertyId||fact.roomTypeId!==context.roomTypeId||fact.stayDate!==context.stayDate)throw Error('Reservation evidence does not match snapshot scope.');
  ids.add(fact.reservationId);
  if(fact.roomRevenueMinor===null)unknown++;
  else{if(!Number.isSafeInteger(fact.roomRevenueMinor)||fact.roomRevenueMinor<0)throw Error('Invalid nightly room revenue.');revenue+=fact.roomRevenueMinor;if(!Number.isSafeInteger(revenue))throw Error('Nightly revenue exceeds supported precision.');}
 }
 const snapshot={...context,bookedRoomNights:ids.size,roomRevenueMinor:unknown?null:revenue};
 if(!validRevenueSnapshot(snapshot))throw Error('Invalid snapshot context.');
 return {snapshot,unknownRevenueRoomNights:unknown};
}
