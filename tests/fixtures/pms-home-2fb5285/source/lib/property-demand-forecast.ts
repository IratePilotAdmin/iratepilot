import {forecastDemand,type DemandForecast,type DemandPaceComparable} from './demand-forecast';
import {demandForecastInputsForDate,type RevenueDemandAdjustment} from './revenue-demand-adjustments';
import {pickupInstant} from './pickup-time';
import type {PickupCapture} from './revenue-pickup-report';
import type {RevenueSnapshot} from './revenue-pickup';
import type {PerformanceDay} from './historical-performance';

export type PropertyForecastCapture={capture:PickupCapture;snapshots:RevenueSnapshot[]};
type Context={tenant:string;property:string;timeZone:string;stayDate:string;currentCapture:PickupCapture;currentSnapshots:RevenueSnapshot[];captures:PickupCapture[];historicalCaptures:PropertyForecastCapture[];historicalDays:PerformanceDay[];adjustments:RevenueDemandAdjustment[]};

const validDate=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const addDays=(value:string,amount:number)=>new Date(Date.parse(value+'T00:00:00Z')+amount*86_400_000).toISOString().slice(0,10);
function localDate(instant:string,timeZone:string){
 if(pickupInstant(instant)===null||!timeZone)throw Error('Forecast capture time or property time zone is invalid.');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Number(pickupInstant(instant)!/1000n)));
 const part=(name:string)=>parts.find(value=>value.type===name)?.value??'';
 const value=`${part('year')}-${part('month')}-${part('day')}`;if(!validDate(value))throw Error('Forecast capture date could not be read in the property time zone.');return value;
}
export function propertyCaptureBusinessDate(instant:string,timeZone:string){return localDate(instant,timeZone)}
function totalForNight(rows:RevenueSnapshot[],tenant:string,property:string,stayDate:string){
 const night=rows.filter(row=>row.stayDate===stayDate);
 if(!night.length||night.some(row=>row.tenantId!==tenant||row.propertyId!==property||row.currency!=='USD'||!row.roomTypeId))return null;
 if(new Set(night.map(row=>row.roomTypeId)).size!==night.length)return null;
 const booked=night.reduce((sum,row)=>sum+row.bookedRoomNights,0),capacity=night.some(row=>row.sellableRoomNights===null)?null:night.reduce((sum,row)=>sum+(row.sellableRoomNights??0),0);
 const revenue=night.some(row=>row.roomRevenueMinor===null)?null:night.reduce((sum,row)=>sum+(row.roomRevenueMinor??0),0);
 if(!Number.isSafeInteger(booked)||capacity!==null&&!Number.isSafeInteger(capacity)||revenue!==null&&!Number.isSafeInteger(revenue))return null;
 return {booked,capacity,revenue};
}

/** Return the closest same-weekday capture dates that were recorded at the same local lead time. */
export function propertyDemandComparableCandidates(input:{stayDate:string;asOfDate:string;leadDays:number;captures:PickupCapture[];timeZone:string;limit?:number}){
 const {stayDate,asOfDate,leadDays,captures,timeZone}=input,limit=input.limit??12;
 if(!validDate(stayDate)||!validDate(asOfDate)||stayDate<=asOfDate||!Number.isSafeInteger(leadDays)||leadDays<1||leadDays>365||!Array.isArray(captures)||captures.length>100||!Number.isSafeInteger(limit)||limit<3||limit>20)throw Error('Forecast comparison inputs are invalid.');
 if(Math.round((Date.parse(stayDate)-Date.parse(asOfDate))/86_400_000)!==leadDays)throw Error('Forecast comparison lead time does not match the selected stay night.');
 const candidates: Array<{stayDate:string;capture:PickupCapture}>=[],seen=new Set<string>();
 for(let week=1;week<=52&&candidates.length<limit;week++){
  const comparableDate=addDays(stayDate,-7*week);if(comparableDate>=asOfDate)continue;
  const captureDate=addDays(comparableDate,-leadDays);
  const matches=captures.filter(capture=>capture.start_date<=comparableDate&&comparableDate<capture.end_date&&localDate(capture.started_at,timeZone)===captureDate).sort((a,b)=>{const left=pickupInstant(a.started_at)??0n,right=pickupInstant(b.started_at)??0n;return left===right?0:left>right?-1:1});
  const capture=matches[0];if(capture&&!seen.has(capture.capture_id)){seen.add(capture.capture_id);candidates.push({stayDate:comparableDate,capture});}
 }
 return candidates;
}

/** Build a property-wide forecast from complete pickup captures and closed-day actuals. */
export function forecastPropertyDemand(input:Context):DemandForecast{
 const {tenant,property,timeZone,stayDate,currentCapture,currentSnapshots,captures,historicalCaptures,historicalDays,adjustments}=input;
 if(!tenant||!property||!timeZone||!validDate(stayDate)||!Array.isArray(historicalDays)||!Array.isArray(adjustments))throw Error('Property forecast context is incomplete.');
 const asOfDate=localDate(currentCapture.started_at,timeZone);if(stayDate<=asOfDate)return {available:false,reason:'Choose a stay night after the selected capture date.'};
 const leadDays=Math.round((Date.parse(stayDate)-Date.parse(asOfDate))/86_400_000),current=totalForNight(currentSnapshots,tenant,property,stayDate);
 if(!current||current.capacity===null||current.capacity<1||current.booked>current.capacity)return {available:false,reason:'Current booked rooms or effective capacity are incomplete for this night.'};
 const capturesById=new Map(historicalCaptures.map(item=>[item.capture.capture_id,item]));
 const dayByDate=new Map(historicalDays.map(day=>[day.service_date,day]));
 const candidates=propertyDemandComparableCandidates({stayDate,asOfDate,leadDays,captures,timeZone});
 const comparables:DemandPaceComparable[]=[];
 for(const candidate of candidates){
  const day=dayByDate.get(candidate.stayDate),saved=capturesById.get(candidate.capture.capture_id);if(!day?.closed||day.inventory_status!=='recorded'||!day.inventory_snapshot?.complete||!saved)continue;
  const total=totalForNight(saved.snapshots,tenant,property,candidate.stayDate),capacity=day.inventory_snapshot.effective_units;
  if(!total||total.capacity===null||capacity===null||capacity!==total.capacity||day.occupied_nights===null||day.occupied_nights>capacity||total.booked>capacity)continue;
  let finalAccommodationMinor:number|null=null;try{const value=BigInt(day.overnight_accommodation_minor??'');if(value>=0n&&value<=BigInt(Number.MAX_SAFE_INTEGER))finalAccommodationMinor=Number(value);}catch{}
  comparables.push({tenantId:tenant,propertyId:property,stayDate:candidate.stayDate,roomTypeId:'property-total',currency:'USD',leadDays,bookedUnitsAtLead:total.booked,effectiveCapacity:capacity,finalOccupiedUnits:day.occupied_nights,finalAccommodationMinor});
 }
 const demandInputs=demandForecastInputsForDate(adjustments,stayDate);
 return forecastDemand({tenantId:tenant,propertyId:property,roomTypeId:'property-total',currency:'USD',stayDate,asOfDate,leadDays,bookedUnits:current.booked,effectiveCapacity:current.capacity,bookedAccommodationMinor:current.revenue,comparables,...demandInputs});
}
