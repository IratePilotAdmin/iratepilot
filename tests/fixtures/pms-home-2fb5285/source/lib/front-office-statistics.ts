import type {PerformanceDay,PerformanceReport} from '@/lib/historical-performance';

export type StatisticsPeriod={key:'today'|'mtd'|'ytd'|'last_day'|'last_mtd'|'last_ytd';label:string;start:string;end:string;days:number};
export type StatisticsMetric={key:string;label:string;section:'rooms'|'guests'|'activity'|'revenue'|'payments';format:'count'|'percent'|'money';requiresCapacity?:boolean};
type EventCountField='checked_in_count'|'checked_in_guest_count'|'checked_out_count'|'checked_out_guest_count'|'cancellation_count'|'no_show_count'|'reservation_created_count'|'walk_in_count';
const DAY_MS=86_400_000;
const parseDate=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Choose a valid report date.');const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw Error('Choose a valid report date.');return time};
const iso=(value:number)=>new Date(value).toISOString().slice(0,10);
function previousYear(date:string){const [year,month,day]=date.split('-').map(Number);const targetYear=year-1;const lastDay=new Date(Date.UTC(targetYear,month,0)).getUTCDate();return `${targetYear}-${String(month).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`}
function makePeriod(key:StatisticsPeriod['key'],label:string,start:string,end:string):StatisticsPeriod{return {key,label,start,end,days:(parseDate(end)-parseDate(start))/DAY_MS}}
export function frontOfficeStatisticsPeriods(date:string):StatisticsPeriod[]{
 const time=parseDate(date),[year,month]=date.split('-');const next=iso(time+DAY_MS),last=previousYear(date),lastTime=parseDate(last),lastNext=iso(lastTime+DAY_MS);
 return [makePeriod('today','Today',date,next),makePeriod('mtd','MTD',`${year}-${month}-01`,next),makePeriod('ytd','YTD',`${year}-01-01`,next),makePeriod('last_day','Same day',last,lastNext),makePeriod('last_mtd','MTD',`${last.slice(0,4)}-${last.slice(5,7)}-01`,lastNext),makePeriod('last_ytd','YTD',`${last.slice(0,4)}-01-01`,lastNext)];
}
const sum=(days:PerformanceDay[],field:(d:PerformanceDay)=>string|null)=>days.reduce((total,d)=>total+BigInt(field(d)??'0'),0n);
const decimal=(minor:bigint)=>{const negative=minor<0n,value=negative?-minor:minor,whole=value/100n,cents=String(value%100n).padStart(2,'0');return `${negative?'-':''}${whole}.${cents}`};
function fullDays(days:PerformanceDay[],period:StatisticsPeriod){return days.length===period.days&&days.every(day=>day.closed)}
function capacityDays(days:PerformanceDay[],period:StatisticsPeriod){return fullDays(days,period)&&days.every(day=>day.inventory_snapshot?.complete&&day.inventory_snapshot.effective_units!==null)}
function amount(days:PerformanceDay[],period:StatisticsPeriod,field:(day:PerformanceDay)=>string|null){return fullDays(days,period)?sum(days,field).toString():null}
function activityAmount(days:PerformanceDay[],period:StatisticsPeriod,field:(day:PerformanceDay)=>string|undefined|null){return days.length===period.days&&days.every(day=>field(day)!==undefined&&field(day)!==null)?sum(days,day=>field(day)??null).toString():null}
function count(days:PerformanceDay[],period:StatisticsPeriod,field:(day:PerformanceDay)=>number|null){return fullDays(days,period)?String(days.reduce((total,day)=>total+(field(day)??0),0)):null}
function capacityCount(days:PerformanceDay[],period:StatisticsPeriod,field:(day:PerformanceDay)=>number|null){return capacityDays(days,period)?String(days.reduce((total,day)=>total+(field(day)??0),0)):null}
function inventoryCount(days:PerformanceDay[],period:StatisticsPeriod,field:(day:PerformanceDay)=>number|null){return fullDays(days,period)&&days.every(day=>day.inventory_snapshot!==null)?String(days.reduce((total,day)=>total+(field(day)??0),0)):null}
function guestCount(days:PerformanceDay[],period:StatisticsPeriod){if(!fullDays(days,period)||!days.every(day=>typeof day.overnight_guest_count==='number'&&Number.isSafeInteger(day.overnight_guest_count)&&day.overnight_guest_count>=0))return null;return String(days.reduce((total,day)=>total+day.overnight_guest_count!,0))}
function guestRoomCount(days:PerformanceDay[],period:StatisticsPeriod,field:'one_guest_room_count'|'two_guest_room_count'|'over_two_guest_room_count'){if(!fullDays(days,period)||!days.every(day=>typeof day[field]==='number'&&Number.isSafeInteger(day[field])&&day[field]!>=0))return null;return String(days.reduce((total,day)=>total+day[field]!,0))}
function eventCount(days:PerformanceDay[],period:StatisticsPeriod,field:EventCountField){if(!fullDays(days,period)||!days.every(day=>typeof day[field]==='number'&&Number.isSafeInteger(day[field])&&day[field]!>=0))return null;return String(days.reduce((total,day)=>total+day[field]!,0))}
function percent(numerator:string|null,denominator:string|null){if(numerator===null||denominator===null||BigInt(denominator)===0n)return null;const scaled=(BigInt(numerator)*10000n+BigInt(denominator)/2n)/BigInt(denominator);return (Number(scaled)/100).toFixed(2)}
export const frontOfficeStatisticsMetrics:StatisticsMetric[]=[
 {key:'physical',label:'Total rooms / room-nights',section:'rooms',format:'count'},
 {key:'out_of_inventory',label:'Out of inventory rooms',section:'rooms',format:'count',requiresCapacity:true},
 {key:'available',label:'Available rooms before out of order',section:'rooms',format:'count',requiresCapacity:true},
 {key:'closed',label:'Out of order / maintenance rooms',section:'rooms',format:'count'},
 {key:'rentable',label:'Total rentable rooms / room-nights',section:'rooms',format:'count',requiresCapacity:true},
 {key:'occupied',label:'Occupied room-nights',section:'rooms',format:'count'},
 {key:'vacant',label:'Rentable rooms left vacant',section:'rooms',format:'count',requiresCapacity:true},
 {key:'occupancy',label:'Occupancy on effective capacity',section:'rooms',format:'percent',requiresCapacity:true},
 {key:'adr',label:'Overnight ADR',section:'rooms',format:'money'},
 {key:'revpar',label:'Overnight revenue per rentable room',section:'rooms',format:'money',requiresCapacity:true},
 {key:'adults',label:'Total adults',section:'guests',format:'count'},
 {key:'children',label:'Total children',section:'guests',format:'count'},
 {key:'guests',label:'Overnight guests / guest-nights',section:'guests',format:'count'},
 {key:'one_guest_rooms',label:'Rooms with 1 guest',section:'guests',format:'count'},
 {key:'two_guest_rooms',label:'Rooms with 2 guests',section:'guests',format:'count'},
 {key:'over_two_guest_rooms',label:'Rooms with 3+ guests',section:'guests',format:'count'},
 {key:'arrivals',label:'Stays checked in',section:'activity',format:'count'},
 {key:'arrival_guests',label:'Guests checked in',section:'activity',format:'count'},
 {key:'departures',label:'Stays checked out',section:'activity',format:'count'},
 {key:'departure_guests',label:'Guests checked out',section:'activity',format:'count'},
 {key:'reservations',label:'Direct and iRatePilot web reservations created',section:'activity',format:'count'},
 {key:'walkins',label:'Walk-in bookings',section:'activity',format:'count'},
 {key:'noshow',label:'No-shows',section:'activity',format:'count'},
 {key:'cancellations',label:'Cancellations',section:'activity',format:'count'},
 {key:'earlyin',label:'Early check-ins',section:'activity',format:'count'},
 {key:'earlyout',label:'Early check-outs',section:'activity',format:'count'},
 {key:'overnight',label:'Overnight room revenue',section:'revenue',format:'money'},
 {key:'same_day',label:'Same-day accommodation',section:'revenue',format:'money'},
 {key:'other_accommodation',label:'Other accommodation',section:'revenue',format:'money'},
 {key:'corrections',label:'Posted accommodation corrections',section:'revenue',format:'money'},
 {key:'taxes',label:'Tax revenue',section:'revenue',format:'money'},
 {key:'property_fees',label:'Property fee revenue',section:'revenue',format:'money'},
 {key:'total_revenue',label:'Recorded accommodation, tax and fee revenue',section:'revenue',format:'money'},
 {key:'cash',label:'Cash payments',section:'payments',format:'money'},
 {key:'card',label:'Card payments',section:'payments',format:'money'},
 {key:'payments',label:'PMS-recorded payments',section:'payments',format:'money'},
 {key:'refunds',label:'PMS-recorded refunds',section:'payments',format:'money'},
 {key:'payment_reductions',label:'PMS payment-record reductions',section:'payments',format:'money'},
];
export const statisticsSections=[['rooms','ROOM STATISTICS'],['guests','GUEST STATISTICS'],['activity','ACTIVITY COUNTS'],['revenue','REVENUE'],['payments','PAYMENT ACTIVITY']] as const;
const unrecordedMetrics=new Set(['adults','children','guests','one_guest_rooms','two_guest_rooms','over_two_guest_rooms','arrivals','arrival_guests','departures','departure_guests','reservations','walkins','noshow','cancellations','earlyin','earlyout','cash','card','payments','refunds','payment_reductions']);
export function frontOfficeStatisticsAvailability(key:string,report:PerformanceReport,period:StatisticsPeriod){
 return fullDays(report.days,period)&&frontOfficeStatisticsValue(key,report,period)===null&&unrecordedMetrics.has(key)?'Not recorded':'Unavailable';
}
export function frontOfficeStatisticsValue(key:string,report:PerformanceReport,period:StatisticsPeriod):string|null{
 const days=report.days;
 const occupied=count(days,period,d=>d.occupied_nights);
 const physical=inventoryCount(days,period,d=>d.inventory_snapshot?.physical_units??null);
 const closed=inventoryCount(days,period,d=>d.inventory_snapshot?.closed_units??null);
 const rentable=capacityCount(days,period,d=>d.inventory_snapshot?.effective_units??null);
 const outOfInventory=capacityDays(days,period)?days.reduce((total,day)=>total+Math.max(0,day.inventory_snapshot!.physical_units-day.inventory_snapshot!.configured_units!),0):null;
 const available=physical===null||outOfInventory===null?null:String(BigInt(physical)-BigInt(outOfInventory));
 const overnight=amount(days,period,d=>d.overnight_accommodation_minor);
 const sameDay=amount(days,period,d=>d.same_day_accommodation_minor);
 const other=amount(days,period,d=>d.other_accommodation_minor);
 const corrections=amount(days,period,d=>d.accommodation_corrections_minor);
 const taxes=amount(days,period,d=>d.original_taxes_minor);
 const fees=amount(days,period,d=>d.original_property_fees_minor);
 const payments=activityAmount(days,period,d=>d.pms_recorded_payments_minor);
 const refunds=activityAmount(days,period,d=>d.pms_recorded_refunds_minor);
 const reductions=activityAmount(days,period,d=>d.pms_payment_record_reductions_minor);
 switch(key){
  case 'physical':return physical;
  case 'out_of_inventory':return outOfInventory===null?null:String(outOfInventory);
  case 'available':return available;
  case 'closed':return closed;
  case 'rentable':return rentable;
  case 'occupied':return occupied;
  case 'vacant':return rentable===null||occupied===null?null:String(BigInt(rentable)-BigInt(occupied));
  case 'occupancy':return percent(occupied,rentable);
  case 'adr':return occupied===null||BigInt(occupied)===0n||overnight===null?null:decimal((BigInt(overnight)+BigInt(occupied)/2n)/BigInt(occupied));
  case 'revpar':return overnight===null||rentable===null||BigInt(rentable)===0n?null:decimal((BigInt(overnight)+BigInt(rentable)/2n)/BigInt(rentable));
  case 'guests':return guestCount(days,period);
  case 'one_guest_rooms':return guestRoomCount(days,period,'one_guest_room_count');
  case 'two_guest_rooms':return guestRoomCount(days,period,'two_guest_room_count');
  case 'over_two_guest_rooms':return guestRoomCount(days,period,'over_two_guest_room_count');
  case 'arrivals':return eventCount(days,period,'checked_in_count');
  case 'arrival_guests':return eventCount(days,period,'checked_in_guest_count');
  case 'departures':return eventCount(days,period,'checked_out_count');
  case 'departure_guests':return eventCount(days,period,'checked_out_guest_count');
  case 'noshow':return eventCount(days,period,'no_show_count');
  case 'cancellations':return eventCount(days,period,'cancellation_count');
  case 'reservations':return eventCount(days,period,'reservation_created_count');
  case 'walkins':return eventCount(days,period,'walk_in_count');
  case 'overnight':return overnight===null?null:decimal(BigInt(overnight));
  case 'same_day':return sameDay===null?null:decimal(BigInt(sameDay));
  case 'other_accommodation':return other===null?null:decimal(BigInt(other));
  case 'corrections':return corrections===null?null:decimal(BigInt(corrections));
  case 'taxes':return taxes===null?null:decimal(BigInt(taxes));
  case 'property_fees':return fees===null?null:decimal(BigInt(fees));
  case 'total_revenue':return overnight===null||sameDay===null||other===null||corrections===null||taxes===null||fees===null?null:decimal(BigInt(overnight)+BigInt(sameDay)+BigInt(other)+BigInt(corrections)+BigInt(taxes)+BigInt(fees));
  case 'payments':return payments===null?null:decimal(BigInt(payments));
  case 'refunds':return refunds===null?null:decimal(BigInt(refunds));
  case 'payment_reductions':return reductions===null?null:decimal(BigInt(reductions));
  default:return null;
 }
}
export function frontOfficeStatisticsPeriodStatus(report:PerformanceReport,period:StatisticsPeriod){const closedDays=report.days.filter(d=>d.closed).length,inventoryDays=report.days.filter(d=>d.closed&&d.inventory_snapshot!==null).length;return {closedDays,inventoryDays,totalDays:period.days,complete:fullDays(report.days,period),capacityComplete:capacityDays(report.days,period)};}
