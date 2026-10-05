import {pickupInstant} from './pickup-time';
import type {HotelWorkspace} from './pilot';
import type {RateBook} from './rates';
import type {PilotGatewayConnection} from './pms-revenue-source-snapshot';
import {onBooksForecast} from './on-books-forecast';
import {revenueRecommendation} from './revenue-recommendation';

export const RED_ROOF_SHADOW_PROPERTY='7d9add80-216e-435c-86e9-58e17cdcbb6d';
export const REVENUE_FRESHNESS_MS=5*60*1000;
export const PICKUP_WINDOWS=[1,3,7,14,30] as const;
export type PickupFeed={propertyId:string;asOf:string|null;pilotOnly:boolean;rows:{roomTypeId:string;stayDate:string;windowDays:number;currentAt:string;baselineAt:string|null;available:boolean;roomNightsChange:number|null;roomRevenueChangeMinor:number|null}[]};
function comparablePickupRow(feed:PickupFeed,row:PickupFeed['rows'][number],days:number){
 const current=pickupInstant(row.currentAt),capture=pickupInstant(feed.asOf),baseline=pickupInstant(row.baselineAt);
 const date=Date.parse(row.stayDate);
 if(!row.available||!row.roomTypeId||!/^\d{4}-\d{2}-\d{2}$/.test(row.stayDate)||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==row.stayDate||row.windowDays!==days||current===null||capture===null||current!==capture||baseline===null||baseline>=current||!Number.isSafeInteger(row.roomNightsChange)||(row.roomRevenueChangeMinor!==null&&!Number.isSafeInteger(row.roomRevenueChangeMinor)))return false;
 const drift=current-baseline-BigInt(days)*86400000000n;
 return drift>=-10800000000n&&drift<=10800000000n;
}
export function pickupWindow(feed:PickupFeed|null,days:number,expectedRows:number){
 if(!feed||!feed.propertyId||pickupInstant(feed.asOf)===null||!Array.isArray(feed.rows)||!PICKUP_WINDOWS.some(window=>window===days)||!Number.isSafeInteger(expectedRows)||expectedRows<1)return null;
 const rows=feed.rows.filter(row=>row.windowDays===days);
 if(rows.length!==expectedRows||new Set(rows.map(row=>row.roomTypeId+'|'+row.stayDate)).size!==expectedRows||rows.some(row=>!comparablePickupRow(feed,row,days)))return null;
 const roomNights=rows.reduce((sum,row)=>sum+row.roomNightsChange!,0),revenueMinor=rows.every(row=>row.roomRevenueChangeMinor!==null)?rows.reduce((sum,row)=>sum+row.roomRevenueChangeMinor!,0):null;
 if(!Number.isSafeInteger(roomNights)||(revenueMinor!==null&&!Number.isSafeInteger(revenueMinor)))return null;
 return {roomNights,revenueMinor};
}
export function firstOccupancyForecast(feed:PickupFeed|null,stayDate:string,businessDate:string,reservedUnits:number,effectiveUnits:number|null,roomTypeIds:string[]){
 if(!feed||!feed.propertyId||!Array.isArray(feed.rows)||!Number.isSafeInteger(effectiveUnits)||effectiveUnits!<1||!Number.isSafeInteger(reservedUnits)||reservedUnits<0||reservedUnits>effectiveUnits!||roomTypeIds.length<1||new Set(roomTypeIds).size!==roomTypeIds.length)return null;
 const remaining=Math.round((Date.parse(stayDate+'T00:00:00Z')-Date.parse(businessDate+'T00:00:00Z'))/86400000);
 if(!Number.isInteger(remaining)||remaining<0||remaining>30)return null;
 const matching=feed.rows.filter(row=>row.stayDate===stayDate&&row.windowDays===7);
 if(matching.length!==roomTypeIds.length||new Set(matching.map(row=>row.roomTypeId)).size!==roomTypeIds.length||matching.some(row=>!roomTypeIds.includes(row.roomTypeId)||!comparablePickupRow(feed,row,7)))return null;
 const netPickup=matching.reduce((sum,row)=>sum+row.roomNightsChange!,0);
 if(!Number.isSafeInteger(netPickup))return null;
 const projectedUnits=Math.min(effectiveUnits!,Math.max(reservedUnits,Math.round(reservedUnits+Math.max(0,netPickup)*remaining/7)));
 return {projectedUnits,projectedOccupancyPercent:Number((projectedUnits/effectiveUnits!*100).toFixed(1)),netPickup,confidence:'Low · unvalidated seven-day pace',explanation:`${reservedUnits} booked now; ${netPickup>=0?'+':''}${netPickup} net rooms in the last seven days for this stay night. Extrapolated over ${remaining} days until arrival, capped at ${effectiveUnits} effective rooms.`};
}
export type RevenueException={key:string;priority:'critical'|'attention';title:string;detail:string;stayDate?:string};
export function revenueFreshness(workspaceAt:string|null,ratesAt:string|null,now:number){
 const times=[workspaceAt,ratesAt].map(value=>value?Date.parse(value):NaN);
 return {ready:times.every(time=>Number.isFinite(time)&&time<=now&&now-time<=REVENUE_FRESHNESS_MS),oldestAt:times.every(Number.isFinite)?new Date(Math.min(...times)).toISOString():null};
}
export function liveRevenueBoard(workspace:HotelWorkspace,book:RateBook,connections:PilotGatewayConnection[],tenant:string,property:string,days=14){
 if(workspace.property.id!==property||!['owner','manager'].includes(workspace.role)||!tenant)throw Error('The current manager property scope is required.');
 const start=workspace.business_date,end=new Date(Date.parse(start+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
 const nights=onBooksForecast(workspace,start,end),exceptions:RevenueException[]=[],types=new Map(workspace.room_types.map(type=>[type.id,type.name]));
 const plans=book.plans.filter(plan=>plan.active&&types.has(plan.room_type_id)),priced=new Map(book.nightly_rates.map(rate=>[rate.plan_id+'|'+rate.stay_date,rate.amount_minor]));
 const mapped=new Set<string>(),externalIds=new Set<string>();
 for(const connection of connections){
  if(!connection.enabled)continue;
  if(connection.inventory_authority!=='iratepilot-pms')exceptions.push({key:'authority-'+connection.connection_id,priority:'attention',title:'Gateway is a sandbox mapping',detail:connection.connection_id+' does not certify live OTA delivery.'});
  for(const [external,internal] of Object.entries(connection.room_types)){
   if(!types.has(internal)||externalIds.has(connection.ota_property_id+'|'+external))exceptions.push({key:'mapping-'+connection.connection_id+'-'+external,priority:'critical',title:'Conflicting room mapping',detail:'Review the saved gateway IDs in Connections.'});
   externalIds.add(connection.ota_property_id+'|'+external);mapped.add(internal);
  }
 }
 for(const type of workspace.room_types)if(!mapped.has(type.id))exceptions.push({key:'unmapped-'+type.id,priority:'attention',title:'Room type has no enabled gateway mapping',detail:type.name+' needs a confirmed destination mapping.'});
 for(const plan of plans)exceptions.push({key:'rate-map-'+plan.id,priority:'attention',title:'Destination rate-plan contract is uncertified',detail:plan.name+' has a PMS identity. Observed destination codes still require rate semantics and delivery certification.'});
 const recommendations:{key:string;stayDate:string;plan:string;current:number;suggested:number;confidence:string;explanation:string[]}[]=[];
 for(const night of nights){
  for(const issue of night.attention)exceptions.push({key:issue+'-'+night.stayDate,priority:issue==='Oversold'?'critical':'attention',title:issue,detail:'Review the live PMS inventory and bookings for '+night.stayDate+'.',stayDate:night.stayDate});
  for(const plan of plans){
   const amount=priced.get(plan.id+'|'+night.stayDate),capacity=workspace.capacity.find(row=>row.room_type_id===plan.room_type_id&&row.stay_date===night.stayDate);
   if(amount===undefined){exceptions.push({key:'unpriced-'+plan.id+'-'+night.stayDate,priority:'attention',title:'Nightly rate missing',detail:plan.name+' on '+night.stayDate,stayDate:night.stayDate});continue}
   if(!capacity||capacity.effective_units==null||capacity.effective_units<1||capacity.reserved_units>capacity.effective_units||amount<1)continue;
   const result=revenueRecommendation({stayDate:night.stayDate,currentRateMinor:amount,effectiveUnits:capacity.effective_units,reservedUnits:capacity.reserved_units,minimumRateMinor:Math.max(1,Math.round(amount*.7)),maximumRateMinor:Math.round(amount*1.5),competitorRateMinor:null,eventUpliftBasisPoints:0});
   recommendations.push({key:plan.id+'|'+night.stayDate,stayDate:night.stayDate,plan:plan.name,current:amount,suggested:result.recommendedRateMinor,confidence:'Low · pickup and demand history unavailable',explanation:result.explanations});
  }
 }
 return {nights,exceptions,recommendations,plans,connections,types};
}
