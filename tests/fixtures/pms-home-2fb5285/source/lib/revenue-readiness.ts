import type {HotelWorkspace} from './pilot';
import type {RateBook} from './rates';
import {afterDays} from './rates';
import type {PilotGatewayConnection} from './pms-revenue-source-snapshot';
import {pickupWindow,PICKUP_WINDOWS,type PickupFeed} from './revenue-live';
export type RevenueGate={key:string;label:string;passed:boolean;detail:string};
// An observation report, never a writeback authorization or destination certificate.
export function revenueReadiness(workspace:HotelWorkspace,book:RateBook|null,connections:PilotGatewayConnection[]|null,pickup:PickupFeed|null,fresh:boolean,historyFresh:boolean,days=14){
 if(!Number.isInteger(days)||days<1||days>30)throw Error('Invalid readiness horizon.');
 const dates=Array.from({length:days},(_,i)=>afterDays(workspace.business_date,i)),types=new Set(workspace.room_types.map(t=>t.id)),sellable=new Set<string>();
 let invalidCapacity=0;const capacity=new Map<string,typeof workspace.capacity[number]>();
 for(const row of workspace.capacity){if(!dates.includes(row.stay_date))continue;const key=row.room_type_id+'|'+row.stay_date;if(!types.has(row.room_type_id)||capacity.has(key)||!Number.isSafeInteger(row.effective_units)||row.effective_units!<0||!Number.isSafeInteger(row.reserved_units)||row.reserved_units<0||row.reserved_units>row.effective_units!)invalidCapacity++;capacity.set(key,row);if((row.effective_units??0)>0)sellable.add(row.room_type_id)}
 const missingCapacity=[...types].reduce((n,type)=>n+dates.filter(date=>!capacity.has(type+'|'+date)).length,0);
 const mapped=new Set<string>(),destinations=new Set<string>();let conflicts=0,invalidMappings=0;
 for(const connection of connections??[]){if(!connection.enabled)continue;const route=new Set<string>();for(const [external,internal] of Object.entries(connection.room_types)){const key=connection.ota_property_id+'|'+external;if(destinations.has(key))conflicts++;destinations.add(key);if(!types.has(internal)||route.has(internal)||!external||!connection.ota_property_id)invalidMappings++;route.add(internal);mapped.add(internal)}}
 const missingMappings=[...sellable].filter(type=>!mapped.has(type)).length,plans=book?.plans.filter(plan=>plan.active&&sellable.has(plan.room_type_id))??[];
 const plansMissing=[...sellable].filter(type=>!plans.some(plan=>plan.room_type_id===type)).length;
 const prices=new Map<string,number>();let duplicatePrices=0;for(const row of book?.nightly_rates??[]){const key=row.plan_id+'|'+row.stay_date;if(prices.has(key))duplicatePrices++;prices.set(key,row.amount_minor)}
 const missingPrices=plans.reduce((n,plan)=>n+dates.filter(date=>{const amount=prices.get(plan.id+'|'+date);return !Number.isSafeInteger(amount)||amount!<=0}).length,0);
 const missingWindows=PICKUP_WINDOWS.filter(window=>!historyFresh||pickup?.propertyId!==workspace.property.id||pickupWindow(pickup,window,types.size*days)===null||!dates.every(date=>[...types].every(type=>pickup.rows.some(row=>row.windowDays===window&&row.stayDate===date&&row.roomTypeId===type))));
 const gates:RevenueGate[]=[
 {key:'fresh',label:'Current PMS observations',passed:fresh&&book!==null&&connections!==null,detail:fresh&&book&&connections?'Workspace, rates and mappings fetched within five minutes.':'Refresh PMS observations; stale or incomplete feeds stop decisions.'},
 {key:'capacity',label:'Inventory coverage',passed:types.size>0&&sellable.size>0&&invalidCapacity===0&&missingCapacity===0,detail:`${days}-night horizon: ${missingCapacity} missing room-type nights; ${invalidCapacity} invalid, duplicate or oversold rows.`},
 {key:'room-mapping',label:'Sellable room mappings',passed:connections!==null&&sellable.size>0&&missingMappings===0&&invalidMappings===0,detail:`${missingMappings} sellable room types unmapped; ${invalidMappings} invalid or repeated PMS room identities. Zero-capacity room types do not require a sellable mapping.`},
 {key:'routes',label:'Unique destination routes',passed:connections!==null&&connections.some(c=>c.enabled)&&conflicts===0,detail:`${conflicts} destination room IDs repeated across enabled routes. Saved IDs alone do not certify destination existence or live delivery.`},
 {key:'rates',label:'PMS nightly rate coverage',passed:book!==null&&sellable.size>0&&plansMissing===0&&missingPrices===0&&duplicatePrices===0,detail:`${plansMissing} sellable room types without active plans; ${missingPrices} plan nights without positive prices; ${duplicatePrices} duplicate prices.`},
 {key:'pickup',label:'Complete pickup baselines',passed:types.size>0&&missingWindows.length===0,detail:missingWindows.length?`Missing, stale or incomplete ${missingWindows.join('/')} day windows. Missing pickup is never treated as zero.`:'All five windows cover this property and every room/stay date.'},
 {key:'destination',label:'Destination rate-plan contract',passed:false,detail:'No certified destination rate-plan mapping is connected to this report. Define and verify destination plan IDs, currency, taxes and restriction semantics.'},
 {key:'delivery',label:'Live delivery certification',passed:false,detail:'Require a verified destination readback and controlled delivery test. Native transport blocks unvalidated stay restrictions and tax/fee payload extensions.'},
 {key:'forecast',label:'Forecast accuracy validation',passed:false,detail:'The first pace projection is unvalidated. Backtest against held-out actuals before approving live pricing.'}
 ];
 return {gates,passed:gates.filter(gate=>gate.passed).length,total:gates.length,writebackEnabled:false as const};
}
