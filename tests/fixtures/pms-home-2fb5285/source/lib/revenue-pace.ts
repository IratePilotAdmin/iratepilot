import {validRevenueSnapshot,type RevenueSnapshot} from './revenue-pickup';
import {pickupInstant} from './pickup-time';
export type PaceSnapshot=RevenueSnapshot&{capacityBasis:'maintenance-effective-v1'};
/** Explicitly paired stay dates, aligned by property-local lead day and clock second.
 * No historical date is selected automatically; no forecast or rate write is made.
 */
export function compareBookingPace(reference:PaceSnapshot|null,current:PaceSnapshot|null,timeZone:string){
 const unavailable=(reason:string)=>({available:false as const,reason});
 if(!reference||!current)return unavailable('Both saved snapshots are required. Missing history is not zero bookings.');
 if(!validRevenueSnapshot(reference)||!validRevenueSnapshot(current))return unavailable('Invalid snapshot values.');
 if(['tenantId','propertyId','roomTypeId','currency','basis','capacityBasis'].some(k=>reference[k as keyof PaceSnapshot]!==current[k as keyof PaceSnapshot])||reference.capacityBasis!=='maintenance-effective-v1')return unavailable('Snapshot scope or measurement basis differs.');
 if(current.stayDate<=reference.stayDate)return unavailable('Choose an earlier reference stay date.');
 const local=(s:PaceSnapshot)=>{
  const instant=pickupInstant(s.capturedAt);if(instant===null)throw Error();
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Number(instant/1000n)));
  const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  const day=`${part('year')}-${part('month')}-${part('day')}`;
  return {lead:(Date.parse(s.stayDate)-Date.parse(day))/86400000,clock:`${part('hour')}:${part('minute')}:${part('second')}`};
 };
 let a,b;try{if(!timeZone)throw Error();a=local(reference);b=local(current);}catch{return unavailable('A valid property time zone and capture timestamps are required.');}
 if(a.lead<0||b.lead<0||a.lead!==b.lead||a.clock!==b.clock)return unavailable(`Snapshots must have the same local lead day and capture time. Reference: ${a.lead} days before arrival at ${a.clock}; current: ${b.lead} days before arrival at ${b.clock} (${timeZone}). Select captures with matching timing; missing history cannot be recreated by taking a new snapshot.`);
 const ratio=(n:number|null,d:number|null)=>n===null||d===null||d===0?null:n/d;
 const previousOccupancy=ratio(reference.bookedRoomNights,reference.sellableRoomNights),currentOccupancy=ratio(current.bookedRoomNights,current.sellableRoomNights);
 return {available:true as const,leadDays:b.lead,localCaptureTime:b.clock,referenceStayDate:reference.stayDate,currentStayDate:current.stayDate,
 roomNightsDifference:current.bookedRoomNights-reference.bookedRoomNights,
 revenueDifferenceMinor:current.roomRevenueMinor===null||reference.roomRevenueMinor===null?null:current.roomRevenueMinor-reference.roomRevenueMinor,
 capacityDifference:current.sellableRoomNights===null||reference.sellableRoomNights===null?null:current.sellableRoomNights-reference.sellableRoomNights,
 previousOccupancy,currentOccupancy,occupancyPercentagePointDifference:previousOccupancy===null||currentOccupancy===null?null:(currentOccupancy-previousOccupancy)*100};
}
