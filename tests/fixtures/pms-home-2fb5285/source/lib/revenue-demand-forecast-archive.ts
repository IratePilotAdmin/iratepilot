import type {DemandForecast} from './demand-forecast';
import type {PerformanceDay} from './historical-performance';

export type SavedDemandForecast={forecast_id:string;request_id:string;tenant_id:string;property_id:string;capture_id:string;actor_id:string;created_at:string;forecast:Extract<DemandForecast,{available:true}>};
export type ForecastActualRow={forecast:SavedDemandForecast;actualStatus:'not-closed'|'inventory-incomplete'|'capacity-changed'|'occupancy-unknown'|'revenue-unknown'|'available';actualOccupiedUnits:number|null;actualOccupancyPercent:number|null;actualAccommodationMinor:number|null;actualAdrMinor:number|null;occupiedUnitsError:number|null;occupancyErrorPercentagePoints:number|null;accommodationErrorMinor:number|null};
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const safeInteger=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value);
const finiteNumber=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const minor=(value:unknown):value is number|null=>value===null||typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function parseForecast(value:unknown,scope:{tenant:string;property:string}) : Extract<DemandForecast,{available:true}> {
 if(!plain(value)||value.available!==true||value.tenantId!==scope.tenant||value.propertyId!==scope.property||value.roomTypeId!=='property-total'||value.currency!=='USD'||!date(value.stayDate)||!date(value.asOfDate)||value.stayDate<=value.asOfDate||!safeInteger(value.leadDays)||value.leadDays<1||value.leadDays>365||Math.round((Date.parse(value.stayDate)-Date.parse(value.asOfDate))/86_400_000)!==value.leadDays||!safeInteger(value.bookedUnits)||value.bookedUnits<0||!safeInteger(value.effectiveCapacity)||value.effectiveCapacity<1||value.bookedUnits>value.effectiveCapacity||!safeInteger(value.forecastOccupiedUnits)||value.forecastOccupiedUnits<value.bookedUnits||value.forecastOccupiedUnits>value.effectiveCapacity||!finiteNumber(value.forecastOccupancyPercent)||value.forecastOccupancyPercent<0||value.forecastOccupancyPercent>100||!minor(value.forecastAdrMinor)||!minor(value.forecastAccommodationMinor)||!safeInteger(value.comparableCount)||value.comparableCount<3||value.comparableCount>366||!['low','medium','high'].includes(String(value.confidence))||value.method!=='same-weekday-same-lead-pace-v2'||!Array.isArray(value.appliedDemandAdjustments)||value.appliedDemandAdjustments.length>37||!Array.isArray(value.explanations)||value.explanations.length>8||value.explanations.some(item=>typeof item!=='string'||item.length>1000)||!Array.isArray(value.limitations)||value.limitations.length>8||value.limitations.some(item=>typeof item!=='string'||item.length>1000))throw Error('A saved property forecast contains incomplete or invalid values.');
 return value as Extract<DemandForecast,{available:true}>;
}
export function readRevenueDemandForecastArchive(raw:unknown,scope:{tenant:string;property:string;start:string;end:string}):SavedDemandForecast[]{
 if(!date(scope.start)||!date(scope.end)||scope.start>=scope.end||Date.parse(scope.end+'T00:00:00Z')-Date.parse(scope.start+'T00:00:00Z')>366*86_400_000||!plain(raw)||raw.tenant_id!==scope.tenant||raw.property_id!==scope.property||raw.start!==scope.start||raw.end!==scope.end||!Array.isArray(raw.forecasts)||raw.forecasts.length>500)throw Error('Saved forecasts did not match the requested property and date range.');
 const ids=new Set<string>(),requests=new Set<string>();
 return raw.forecasts.map((item):SavedDemandForecast=>{
  if(!plain(item)||!uuid(item.forecast_id)||ids.has(item.forecast_id)||!uuid(item.request_id)||requests.has(item.request_id)||item.tenant_id!==scope.tenant||item.property_id!==scope.property||!uuid(item.capture_id)||!uuid(item.actor_id)||typeof item.created_at!=='string'||!Number.isFinite(Date.parse(item.created_at)))throw Error('A saved property forecast could not be verified.');
  const forecast=parseForecast(item.forecast,scope);if(forecast.stayDate<scope.start||forecast.stayDate>=scope.end)throw Error('A saved property forecast is outside the requested date range.');
  ids.add(item.forecast_id);requests.add(item.request_id);return {forecast_id:item.forecast_id,request_id:item.request_id,tenant_id:scope.tenant,property_id:scope.property,capture_id:item.capture_id,actor_id:item.actor_id,created_at:item.created_at,forecast};
 });
}
export function readDemandForecastSaveReceipt(raw:unknown,scope:{tenant:string;property:string;request:string}){
 if(!plain(raw)||raw.tenant_id!==scope.tenant||raw.property_id!==scope.property||raw.request_id!==scope.request||!uuid(raw.forecast_id)||typeof raw.replayed!=='boolean'||typeof raw.created_at!=='string'||!Number.isFinite(Date.parse(raw.created_at)))throw Error('The forecast save receipt could not be verified. Refresh the report before saving again.');
 return {tenant_id:scope.tenant,property_id:scope.property,request_id:scope.request,forecast_id:raw.forecast_id,created_at:raw.created_at,replayed:raw.replayed};
}
function actualMinor(value:string|null):number|null{
 if(value===null||!/^\d{1,16}$/.test(value))return null;try{const parsed=BigInt(value);return parsed<=BigInt(Number.MAX_SAFE_INTEGER)?Number(parsed):null}catch{return null}
}
export function compareDemandForecastsToActual(forecasts:SavedDemandForecast[],days:PerformanceDay[]):ForecastActualRow[]{
 const byDate=new Map(days.map(item=>[item.service_date,item]));
 return forecasts.map(saved=>{
  const forecast=saved.forecast,day=byDate.get(forecast.stayDate),empty=(actualStatus:ForecastActualRow['actualStatus']):ForecastActualRow=>({forecast:saved,actualStatus,actualOccupiedUnits:null,actualOccupancyPercent:null,actualAccommodationMinor:null,actualAdrMinor:null,occupiedUnitsError:null,occupancyErrorPercentagePoints:null,accommodationErrorMinor:null});
  if(!day?.closed)return empty('not-closed');
  if(day.inventory_status!=='recorded'||!day.inventory_snapshot?.complete||day.inventory_snapshot.effective_units===null)return empty('inventory-incomplete');
  if(day.inventory_snapshot.effective_units!==forecast.effectiveCapacity)return empty('capacity-changed');
  if(day.occupied_nights===null||!Number.isSafeInteger(day.occupied_nights)||day.occupied_nights<0||day.occupied_nights>forecast.effectiveCapacity)return empty('occupancy-unknown');
  const actualAccommodationMinor=actualMinor(day.overnight_accommodation_minor);if(actualAccommodationMinor===null)return empty('revenue-unknown');
  const actualOccupancyPercent=Math.round(day.occupied_nights*10_000/forecast.effectiveCapacity)/100,actualAdrMinor=day.occupied_nights?Math.round(actualAccommodationMinor/day.occupied_nights):null;
  return {forecast:saved,actualStatus:'available',actualOccupiedUnits:day.occupied_nights,actualOccupancyPercent,actualAccommodationMinor,actualAdrMinor,occupiedUnitsError:forecast.forecastOccupiedUnits-day.occupied_nights,occupancyErrorPercentagePoints:Math.round((forecast.forecastOccupancyPercent-actualOccupancyPercent)*100)/100,accommodationErrorMinor:forecast.forecastAccommodationMinor===null?null:forecast.forecastAccommodationMinor-actualAccommodationMinor};
 });
}
