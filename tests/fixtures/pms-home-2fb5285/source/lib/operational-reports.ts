import {reservationStatus} from '@/lib/reservation-status';
import type {Booking,Room,RoomType} from '@/lib/pilot';
import {reportMoney,reportDecimal,type ReportCell} from '@/lib/report-export';

export const reportKinds=[['arrivals','Arrivals'],['departures','Departures'],['in_house','In house now'],['cancellations','Cancelled arrivals'],['booking_sources','Booking sources & arrival outcomes'],['channel_performance','Channel performance'],['housekeeping','Housekeeping now'],['daily_occupancy','Inventory commitments'],['forecast','Booked value forecast']] as const;
export type ReportKind=typeof reportKinds[number][0];
type Occupancy={stay_date:string;capacity_units:number;configured_units?:number;physical_units?:number;closed_units?:number;shortfall_units?:number;reserved_units:number;available_units:number;overdue_units:number;unconfigured_room_types:number;occupancy_percent:number|null};
export type OperationalReport={property:{id:string;name:string;time_zone:string;currency:string;operating_model?:string};period:{start:string;end:string;end_exclusive:true};business_date:string;generated_at:string;summary:Record<string,number>;arrivals:Booking[];departures:Booking[];in_house:Booking[];cancellations:Booking[];housekeeping:(Room&{housekeeping:string;room_type_name:string;current_reservation_id:string|null})[];daily_occupancy:Occupancy[];booked_value_forecast:{basis:string;currency:string;rows:Booking[];accommodation_minor:number;taxes_minor:number;hotel_fees_minor:number;ota_fees_minor:number;total_minor:number;unknown_amount_reservations:number};definitions:Record<string,string>};
export const reportDefinitions:Record<ReportKind,string>={
 arrivals:'Reservations scheduled to arrive within the selected dates. Review the status shown for each stay.',
 departures:'Reservations scheduled to depart within the selected dates. Review the status shown for each stay.',
 in_house:'Current in-house stays at the report generation time. This is a current snapshot, independent of the selected date range.',
 cancellations:'Cancelled reservations whose scheduled arrival falls within the selected dates. This is not a report of when cancellations were recorded.',
 booking_sources:'Reservations grouped by their saved source and scheduled arrival date. Known full-stay booked value is shown separately for current active and cancelled arrivals; unknown amounts are counted. Values include the saved guest total and are not earned revenue, collected payments, OTA settlement, commission or profitability. Cancellation and no-show shares use current status; no-shows are included in cancellations.',
 channel_performance:'Scheduled arrival cohorts grouped by saved booking source. Accommodation booked value and recorded OTA fees include active stays only; taxes and property fees are excluded from accommodation. Estimated contribution is accommodation booked value less recorded OTA fees; it is not earned revenue, collected payment, settlement or profit.',
 housekeeping:'Current housekeeping and assigned occupancy at the report generation time, independent of the selected date range.',
 daily_occupancy:'Current inventory commitments for each night. Effective capacity is the lower of the configured selling ceiling and current physical rooms remaining after dated closures. Configured, physical and closed units are shown separately. This uses current inventory configuration and does not reconstruct historical room assignments or actual occupancy. Historical actual occupancy and earned-revenue metrics are not calculated here. Missing capacity is flagged.',
 forecast:'Full booked value of active stays arriving within the selected dates, including nights outside that range. This is not nightly earned revenue or money collected.'
};
export function operationalRows(data:OperationalReport,kind:ReportKind,types:RoomType[],rooms:Room[]):{headers:string[];rows:ReportCell[][]}{
 const typeName=(id:string|null)=>types.find(t=>t.id===id)?.name??id??'';
 const roomName=(id:string|null)=>rooms.find(r=>r.id===id)?.label??'Unassigned';
 if(kind==='housekeeping')return {headers:['Unit','Type','Readiness','Assigned reservation'],rows:data.housekeeping.map(r=>[r.label,r.room_type_name,r.housekeeping??r.status,r.current_reservation_id??'Vacant'])};
 if(kind==='booking_sources')return bookingSourceRows(data);
 if(kind==='channel_performance')return channelPerformanceRows(data,data.property.currency);
 if(kind==='daily_occupancy')return {headers:['Night','Configured units','Physical units','Closed units','Effective capacity','Reserved / held','Available','Shortfall','Overdue holds','Types missing capacity','Committed occupancy %'],rows:data.daily_occupancy.map(r=>[r.stay_date,r.configured_units??null,r.physical_units??null,r.closed_units??null,r.capacity_units,r.reserved_units,r.available_units,r.shortfall_units??null,r.overdue_units,r.unconfigured_room_types,r.occupancy_percent==null?'Unavailable':r.occupancy_percent])};
 const reservations=kind==='forecast'?data.booked_value_forecast.rows:data[kind];
 const headers=['Guest','Reference','Source','Arrival','Departure','Guests','Type','Unit','Status'];
 if(kind==='forecast')headers.push('Accommodation USD','Taxes USD','Property fees USD','OTA fees USD','Total booked USD');
 return {headers,rows:reservations.map(r=>{const row:ReportCell[]=[r.guest_name??'',r.migration_source_id??r.source_booking_id,r.source,r.arrival??'',r.departure??'',r.guests,typeName(r.room_type_id),roomName(r.physical_room_id),reservationStatus(r)];if(kind==='forecast')row.push(...[r.accommodation_minor,r.taxes_minor,r.hotel_fees_minor,r.ota_fees_minor,r.guest_total_minor].map(reportMoney));return row})};
}

const channelLabels:Record<string,string>={direct:'Direct','iratepilot-ota':'iRatePilot OTA',booking_com:'Booking.com',expedia:'Expedia',agoda:'Agoda',airbnb:'Airbnb',google_hotel:'Google Hotel'};
type ChannelTotals={active:number;cancelled:number;noShows:number;booked:bigint|null;fees:bigint|null;unknownValues:number;unknownFees:number};
export function channelPerformanceRows(data:Pick<OperationalReport,'arrivals'|'cancellations'>,currency='USD'):{headers:string[];rows:ReportCell[][]}{
 const groups=new Map<string,ChannelTotals>(),seen=new Set<string>();
 const add=(booking:Booking,cancelled:boolean)=>{
  if(typeof booking.id!=='string'||!booking.id||seen.has(booking.id))throw Error('Channel report contains a duplicate or invalid reservation.');seen.add(booking.id);
  const source=typeof booking.source==='string'&&booking.source?booking.source:'unknown';
  const row=groups.get(source)??{active:0,cancelled:0,noShows:0,booked:0n,fees:0n,unknownValues:0,unknownFees:0};
  if(cancelled){row.cancelled++;if(booking.cancellation_disposition==='no_show')row.noShows++}
  else{
   row.active++;
   if(booking.accommodation_minor==null){row.unknownValues++;row.booked=null}else if(!Number.isSafeInteger(booking.accommodation_minor)||booking.accommodation_minor<0)throw Error('Channel report contains an invalid accommodation amount.');else if(row.booked!==null)row.booked+=BigInt(booking.accommodation_minor);
   const fee=booking.source==='direct'?0:booking.ota_fees_minor;
   if(fee==null){row.unknownFees++;row.fees=null}else if(!Number.isSafeInteger(fee)||fee<0)throw Error('Channel report contains an invalid recorded channel fee.');else if(row.fees!==null)row.fees+=BigInt(fee);
  }
  groups.set(source,row);
 };
 for(const stay of data.arrivals)add(stay,false);for(const stay of data.cancellations)add(stay,true);
 const exact=(value:bigint|null):ReportCell=>{if(value===null)return 'Unavailable';const digits=value.toString().padStart(3,'0');return reportDecimal(`${digits.slice(0,-2)}.${digits.slice(-2)}`)};
 const rows=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([source,row])=>{
  const total=row.active+row.cancelled, rate=(count:number)=>total?Number((count*100/total).toFixed(1)):'Unavailable';
  const contribution=row.booked===null||row.fees===null?null:row.booked-row.fees;
  return [channelLabels[source]??source,row.active,row.cancelled,row.noShows,rate(row.cancelled),rate(row.noShows),exact(row.booked),exact(row.fees),exact(contribution),row.unknownValues,row.unknownFees];
 });
 return {headers:['Saved source','Active stays','Cancelled','No shows','Cancellation %','No-show %',`Active accommodation booked (${currency})`,`Recorded OTA fees (${currency})`,`Estimated contribution (${currency})`,'Unknown accommodation','Unknown OTA fees'],rows};
}

const bookingSourceLabels:Record<string,string>={direct:'Direct',migration:'Migrated', 'iratepilot-ota':'iRatePilot OTA',booking_com:'Booking.com'};
export function bookingSourceRows(data:Pick<OperationalReport,'arrivals'|'cancellations'>):{headers:string[];rows:ReportCell[][]}{
 const groups=new Map<string,{arrivals:number;cancellations:number;noShows:number;activeMinor:bigint;cancelledMinor:bigint;activeUnknown:number;cancelledUnknown:number}>();
 const seen=new Set<string>();
 const sourceKey=(source:unknown)=>typeof source==='string'&&Object.hasOwn(bookingSourceLabels,source)?source:'unknown';
 const add=(booking:Booking,cancelled:boolean)=>{
  if(typeof booking.id!=='string'||!booking.id||seen.has(booking.id))throw Error('Booking source report contains a duplicate or invalid reservation.');
  seen.add(booking.id);
  const key=sourceKey(booking.source),row=groups.get(key)??{arrivals:0,cancellations:0,noShows:0,activeMinor:0n,cancelledMinor:0n,activeUnknown:0,cancelledUnknown:0};
  const amount=booking.guest_total_minor;
  if(amount!==null&&(!Number.isSafeInteger(amount)||amount<0))throw Error('Booking source report contains an invalid booked amount.');
  if(cancelled){row.cancellations++;if(booking.cancellation_disposition==='no_show')row.noShows++;if(amount===null)row.cancelledUnknown++;else row.cancelledMinor+=BigInt(amount);}
  else{row.arrivals++;if(amount===null)row.activeUnknown++;else row.activeMinor+=BigInt(amount);}
  groups.set(key,row);
 };
 for(const booking of data.arrivals)add(booking,false);
 for(const booking of data.cancellations)add(booking,true);
 const percent=(count:number,total:number):ReportCell=>total?Number((count*100/total).toFixed(1)):'Unavailable';
 const amountCell=(minor:bigint):ReportCell=>{const digits=minor.toString().padStart(3,'0');return reportDecimal(`${digits.slice(0,-2)}.${digits.slice(-2)}`)};
 const rows=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,row])=>{
  const total=row.arrivals+row.cancellations;
  return [bookingSourceLabels[key]??'Other / unknown',row.arrivals,row.cancellations,row.noShows,amountCell(row.activeMinor),amountCell(row.cancelledMinor),row.activeUnknown,row.cancelledUnknown,total,percent(row.cancellations,total),percent(row.noShows,total)];
 });
 return {headers:['Saved booking source','Scheduled arrivals','Cancelled arrivals','No-show arrivals','Known active full-stay booked value (USD)','Known cancelled full-stay value (USD)','Active bookings with unknown amount','Cancelled bookings with unknown amount','Arrival cohort total','Cancellation share %','No-show share %'],rows};
}
