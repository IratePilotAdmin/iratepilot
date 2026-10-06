import {readServiceInventory,type ServiceInventory} from './service-inventory';
import {signedLedgerDecimal} from './profit-loss';
import type {ReportCell} from './report-export';
export const performanceAmounts=['overnight_accommodation_minor','same_day_accommodation_minor','other_accommodation_minor','original_accommodation_minor','accommodation_corrections_minor','original_taxes_minor','original_property_fees_minor'] as const;
type Amount=typeof performanceAmounts[number];
export type PerformanceDay={service_date:string;closed:boolean;close_id:string|null;closed_at:string|null;inventory_status:'unclosed'|'not_recorded'|'incomplete'|'zero_capacity'|'recorded';inventory_snapshot:ServiceInventory|null;occupied_nights:number|null;overnight_guest_count?:number|null;checked_in_count?:number|null;checked_in_guest_count?:number|null;checked_out_count?:number|null;checked_out_guest_count?:number|null;cancellation_count?:number|null;no_show_count?:number|null;reservation_created_count?:number|null;walk_in_count?:number|null;one_guest_room_count?:number|null;two_guest_room_count?:number|null;over_two_guest_room_count?:number|null;pms_recorded_payments_minor?:string|null;pms_recorded_refunds_minor?:string|null;pms_payment_record_reductions_minor?:string|null}&Record<Amount,string|null>;
export type PerformanceReport={schema_version:1;tenant_id:string;property_id:string;start:string;end:string;currency:'USD';basis:'preserved_service_allocations_and_close_inventory';time_zone:string|null;generated_at:string;days:PerformanceDay[];reconciliation_pending_count:number;pending_adjustment_count:number};
export function readPerformance(value:unknown,scope:{tenant:string;property:string;start:string;end:string}):PerformanceReport{
 const fail=()=>{throw Error('Historical performance data is inconsistent. Refresh the report.');};
 if(!value||typeof value!=='object')return fail();const v=value as PerformanceReport;
 const count=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.start!==scope.start||v.end!==scope.end||!date(v.start)||!date(v.end)||v.currency!=='USD'||v.basis!=='preserved_service_allocations_and_close_inventory'||!Array.isArray(v.days)||!count(v.reconciliation_pending_count)||!count(v.pending_adjustment_count))return fail();
 const days=(Date.parse(v.end)-Date.parse(v.start))/86400000;
 if(days<1||days>366||v.days.length!==days)return fail();
 for(let i=0;i<days;i++){
  const d=v.days[i];if(!d||d.service_date!==new Date(Date.parse(v.start)+i*86400000).toISOString().slice(0,10)||typeof d.closed!=='boolean')return fail();
  if([d.pms_recorded_payments_minor,d.pms_recorded_refunds_minor,d.pms_payment_record_reductions_minor].some(n=>n!==undefined&&n!==null&&(typeof n!=='string'||!(/^(0|[1-9][0-9]{0,40})$/).test(n))))return fail();
  if(!d.closed){if(d.close_id!==null||d.closed_at!==null||d.inventory_snapshot!==null||d.inventory_status!=='unclosed'||d.occupied_nights!==null||[d.overnight_guest_count,d.checked_in_count,d.checked_in_guest_count,d.checked_out_count,d.checked_out_guest_count,d.cancellation_count,d.no_show_count,d.reservation_created_count].some(n=>n!==undefined&&n!==null)||performanceAmounts.some(k=>d[k]!==null))return fail();continue;}
  if(typeof d.close_id!=='string'||!d.close_id||typeof d.closed_at!=='string'||!Number.isFinite(Date.parse(d.closed_at))||!count(d.occupied_nights))return fail();
  if([d.overnight_guest_count,d.checked_in_count,d.checked_in_guest_count,d.checked_out_count,d.checked_out_guest_count,d.cancellation_count,d.no_show_count,d.reservation_created_count,d.walk_in_count,d.one_guest_room_count,d.two_guest_room_count,d.over_two_guest_room_count].some(n=>n!==undefined&&n!==null&&!count(n)))return fail();
  for(const k of performanceAmounts)if(typeof d[k]!=='string'||!(/^(0|-?[1-9][0-9]{0,40})$/).test(d[k]!)||(k!=='accommodation_corrections_minor'&&BigInt(d[k]!)<0n))return fail();
  if(BigInt(d.original_accommodation_minor!)!==BigInt(d.overnight_accommodation_minor!)+BigInt(d.same_day_accommodation_minor!)+BigInt(d.other_accommodation_minor!))return fail();
  if(d.inventory_snapshot===null){if(d.inventory_status!=='not_recorded')return fail();}
  else{const inventory=readServiceInventory(d.inventory_snapshot,d.service_date);const expected=!inventory.complete?'incomplete':inventory.effective_units===0?'zero_capacity':'recorded';if(d.inventory_status!==expected)return fail();}
 }
 return v;
}
export type WalkInStatistics={schema_version:1;tenant_id:string;property_id:string;start:string;end:string;end_exclusive:true;time_zone:string;generated_at:string;days:{service_date:string;walk_in_count:number|null}[]};
export function readWalkInStatistics(value:unknown,scope:{tenant:string;property:string;start:string;end:string}):WalkInStatistics{
 const fail=()=>{throw Error('Walk-in statistics are inconsistent. Refresh the report.');};
 const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,10)===s;
 if(!value||typeof value!=='object')return fail();const v=value as WalkInStatistics;
 const dayCount=(Date.parse(scope.end)-Date.parse(scope.start))/86400000;
 if(!validDate(scope.start)||!validDate(scope.end)||v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.start!==scope.start||v.end!==scope.end||v.end_exclusive!==true||typeof v.time_zone!=='string'||!Number.isFinite(Date.parse(v.generated_at))||dayCount<1||dayCount>366||!Array.isArray(v.days)||v.days.length!==dayCount)return fail();
 for(let i=0;i<dayCount;i++){
  const day=v.days[i],walkins=day?.walk_in_count;
  if(!day||day.service_date!==new Date(Date.parse(scope.start)+i*86400000).toISOString().slice(0,10)||(walkins!==null&&(!Number.isSafeInteger(walkins)||walkins<0)))return fail();
 }
 return v;
}
export type GuestMixStatistics={schema_version:1;tenant_id:string;property_id:string;start:string;end:string;end_exclusive:true;time_zone:string;generated_at:string;days:{service_date:string;one_guest_room_count:number|null;two_guest_room_count:number|null;over_two_guest_room_count:number|null}[]};
export function readGuestMixStatistics(value:unknown,scope:{tenant:string;property:string;start:string;end:string}):GuestMixStatistics{
 const fail=()=>{throw Error('Guest room statistics are inconsistent. Refresh the report.');};
 const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,10)===s;
 if(!value||typeof value!=='object')return fail();const v=value as GuestMixStatistics;
 const dayCount=(Date.parse(scope.end)-Date.parse(scope.start))/86400000;
 if(!validDate(scope.start)||!validDate(scope.end)||v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.start!==scope.start||v.end!==scope.end||v.end_exclusive!==true||typeof v.time_zone!=='string'||!Number.isFinite(Date.parse(v.generated_at))||dayCount<1||dayCount>366||!Array.isArray(v.days)||v.days.length!==dayCount)return fail();
 for(let i=0;i<dayCount;i++){const row=v.days[i];if(row?.service_date!==new Date(Date.parse(scope.start)+i*86400000).toISOString().slice(0,10)||[row.one_guest_room_count,row.two_guest_room_count,row.over_two_guest_room_count].some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0||n>1000000)))return fail();}
 return v;
}
function ratio(n:bigint,d:bigint,scale:bigint):string|null{
 if(d===0n)return null;const rounded=(n*scale+d/2n)/d;const digits=rounded.toString().padStart(3,'0');return digits.slice(0,-2)+'.'+digits.slice(-2);
}
export function summarizePerformance(report:PerformanceReport){
 const closed=report.days.filter(d=>d.closed),allClosed=closed.length===report.days.length;
 const totals=Object.fromEntries(performanceAmounts.map(k=>[k,closed.reduce((n,d)=>n+BigInt(d[k]!),0n).toString()])) as Record<Amount,string>;
 const occupied=closed.reduce((n,d)=>n+BigInt(d.occupied_nights!),0n);
 const netAccommodation=BigInt(totals.original_accommodation_minor)+BigInt(totals.accommodation_corrections_minor);
 const capacityComplete=allClosed&&closed.every(d=>d.inventory_snapshot?.complete);
 const capacity=capacityComplete?closed.reduce((n,d)=>n+BigInt(d.inventory_snapshot!.effective_units!),0n):null;
 return {totals,closed_days:closed.length,unclosed_days:report.days.length-closed.length,missing_inventory_days:closed.filter(d=>!d.inventory_snapshot?.complete).length,occupied_nights:occupied.toString(),effective_unit_nights:capacity?.toString()??null,
  occupancy_percent:capacity===null?null:ratio(occupied,capacity,10000n),
  original_overnight_adr:allClosed?ratio(BigInt(totals.overnight_accommodation_minor),occupied,1n):null,
  original_overnight_revenue_per_effective_unit:capacity===null?null:ratio(BigInt(totals.overnight_accommodation_minor),capacity,1n),
  net_accommodation_minor:netAccommodation.toString(),
  net_accommodation_usd:signedLedgerDecimal(netAccommodation.toString()),
  reconciliation_required:report.reconciliation_pending_count>0||report.pending_adjustment_count>0,
  capacity_shortfall:capacityComplete&&closed.some(d=>d.occupied_nights!>d.inventory_snapshot!.effective_units!),
 };
}
const inventoryLabels={unclosed:'Not closed',not_recorded:'Not recorded',incomplete:'Incomplete',zero_capacity:'Zero capacity',recorded:'Recorded'};
const amountLabels=['Original overnight accommodation USD','Same-day accommodation USD','Other accommodation USD','Original accommodation USD','Posted accommodation corrections USD','Original taxes USD','Original property fees USD'];
export const performanceHeaders=['Service date','Closed','Inventory status','Occupied overnight nights','Overnight guest count','Effective units','Occupancy on effective capacity %','Original overnight ADR USD','Original overnight RevPAR USD','Original overnight accommodation USD','Same-day accommodation USD','Other accommodation USD','Original accommodation USD','Posted accommodation corrections USD','Original taxes USD','Original property fees USD','Net accommodation after posted corrections USD'];
export function performanceDayRows(report:PerformanceReport):ReportCell[][]{return report.days.map(d=>{
 const overnight=d.closed?BigInt(d.overnight_accommodation_minor!):null,occupied=d.closed?BigInt(d.occupied_nights!):null;
 const capacity=d.inventory_snapshot?.complete?BigInt(d.inventory_snapshot.effective_units!):null;
 const occupancy=capacity!==null&&capacity>0n&&occupied!==null?ratio(occupied,capacity,10000n):null;
 const adr=occupied!==null&&occupied>0n&&overnight!==null?ratio(overnight,occupied,1n):null;
 const revpar=capacity!==null&&capacity>0n&&overnight!==null?ratio(overnight,capacity,1n):null;
 const netAccommodation=d.closed?signedLedgerDecimal((BigInt(d.original_accommodation_minor!)+BigInt(d.accommodation_corrections_minor!)).toString()):null;
 return [d.service_date,d.closed?'Yes':'No',inventoryLabels[d.inventory_status],d.occupied_nights,d.overnight_guest_count??(d.closed?'Not recorded':null),d.inventory_snapshot?.effective_units??null,occupancy,adr,revpar,...performanceAmounts.map(k=>d[k]===null?null:signedLedgerDecimal(d[k]!)),netAccommodation];
});}
export function performanceExportRows(report:PerformanceReport):ReportCell[][]{
 const s=summarizePerformance(report);
 return [['iRatePilot PMS','Historical overnight performance'],['Property reference',report.property_id],['From',report.start],['Until (exclusive)',report.end],['Generated at',report.generated_at],['Basis','Original overnight accommodation only for rates; same-day charges and signed posted corrections shown separately. Taxes and property fees excluded from rates. Overnight guest counts are captured at each close; older closes can be not recorded.'],['Capacity basis','Effective selling capacity reviewed at close, not reconstructed historical physical inventory.'],['Completeness','Unclosed dates suppress whole-period rates; missing inventory suppresses capacity-based rates.'],['Closed days',s.closed_days],['Unclosed days',s.unclosed_days],['Closed days missing inventory',s.missing_inventory_days],['Pending reconciliations',report.reconciliation_pending_count],['Pending adjustments',report.pending_adjustment_count],['Occupied nights in closed days',s.occupied_nights],['Effective unit-nights',s.effective_unit_nights],['Occupancy on effective capacity %',s.occupancy_percent],['Original overnight ADR USD',s.original_overnight_adr],['Original overnight RevPAR USD',s.original_overnight_revenue_per_effective_unit],['Net accommodation after posted corrections USD',s.net_accommodation_usd],['Capacity shortfall',s.capacity_shortfall],[],['Closed-day totals only'],...performanceAmounts.map((k,i)=>[amountLabels[i],signedLedgerDecimal(s.totals[k])]),[],performanceHeaders,...performanceDayRows(report)];
}

