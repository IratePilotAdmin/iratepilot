import type {Booking,HotelWorkspace} from '@/lib/pilot';
import type {ReportCell} from '@/lib/report-export';

export type OnBooksForecastRow={stayDate:string;effectiveUnits:number|null;reservedUnits:number;availableUnits:number|null;bookedRoomNights:number;accommodationMinor:number|null;occupancyPercent:number|null;adrMinor:number|null;revparMinor:number|null;attention:string[]};
const date=/^\d{4}-\d{2}-\d{2}$/;
const active=(booking:Booking)=>['Confirmed','In house'].includes(booking.status)&&!!booking.arrival&&!!booking.departure&&booking.departure>booking.arrival;
const days=(start:string,end:string)=>Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
function dates(start:string,end:string){const count=days(start,end);if(!date.test(start)||!date.test(end)||!Number.isInteger(count)||count<1||count>366)throw Error('Choose a forecast range from 1 to 366 nights.');return Array.from({length:count},(_,index)=>new Date(Date.parse(start+'T00:00:00Z')+index*86400000).toISOString().slice(0,10))}
function allocatedNight(booking:Booking,stayDate:string){if(!active(booking)||stayDate<booking.arrival!||stayDate>=booking.departure!)return null;const nights=days(booking.arrival!,booking.departure!);if(!Number.isInteger(booking.accommodation_minor)||booking.accommodation_minor!<0)return {amount:null};const offset=days(booking.arrival!,stayDate),base=Math.floor(booking.accommodation_minor!/nights),remainder=booking.accommodation_minor!%nights;return {amount:base+(offset<remainder?1:0)}}

export function onBooksForecast(workspace:HotelWorkspace,start:string,end:string):OnBooksForecastRow[]{
 const roomTypes=new Set(workspace.room_types.map(type=>type.id));
 return dates(start,end).map(stayDate=>{
  const capacity=workspace.capacity.filter(row=>row.stay_date===stayDate&&roomTypes.has(row.room_type_id)),complete=capacity.length===roomTypes.size&&capacity.every(row=>Number.isInteger(row.effective_units)&&row.effective_units!>=0),effectiveUnits=complete?capacity.reduce((sum,row)=>sum+row.effective_units!,0):null,reservedUnits=capacity.reduce((sum,row)=>sum+Math.max(0,row.reserved_units),0),stays=workspace.reservations.map(booking=>allocatedNight(booking,stayDate)).filter((value):value is {amount:number|null}=>value!==null),revenueComplete=stays.every(stay=>stay.amount!==null),accommodationMinor=revenueComplete?stays.reduce((sum,stay)=>sum+stay.amount!,0):null,attention:string[]=[];
  if(!complete)attention.push('Capacity incomplete');
  if(effectiveUnits!==null&&reservedUnits>effectiveUnits)attention.push('Oversold');
  if(!revenueComplete)attention.push('Booked accommodation unavailable');
  const availableUnits=effectiveUnits===null?null:Math.max(0,effectiveUnits-reservedUnits),occupancyPercent=effectiveUnits&&effectiveUnits>0?Number((reservedUnits/effectiveUnits*100).toFixed(1)):null,adrMinor=accommodationMinor!==null&&stays.length?Math.round(accommodationMinor/stays.length):null,revparMinor=accommodationMinor!==null&&effectiveUnits&&effectiveUnits>0?Math.round(accommodationMinor/effectiveUnits):null;
  return {stayDate,effectiveUnits,reservedUnits,availableUnits,bookedRoomNights:stays.length,accommodationMinor,occupancyPercent,adrMinor,revparMinor,attention};
 });
}

// Period KPIs require the entire period; missing nights are never zero revenue.
export function onBooksForecastSummary(rows:OnBooksForecastRow[]){
 const total=(values:(number|null)[])=>{
  if(!values.length||values.some(value=>value===null||!Number.isSafeInteger(value)||value!<0))return null;
  const sum=values.reduce<number>((sum,value)=>sum+value!,0);
  return Number.isSafeInteger(sum)?sum:null;
 };
 const rooms=total(rows.map(row=>row.effectiveUnits)),reserved=total(rows.map(row=>row.reservedUnits)),revenue=total(rows.map(row=>row.accommodationMinor)),booked=total(rows.map(row=>row.bookedRoomNights));
 return {
  accommodationMinor:revenue,
  occupancyPercent:rooms!==null&&rooms>0&&reserved!==null?reserved/rooms*100:null,
  adrMinor:revenue!==null&&booked!==null&&booked>0?Math.round(revenue/booked):null,
  revparMinor:revenue!==null&&rooms!==null&&rooms>0?Math.round(revenue/rooms):null,
 };
}

export function onBooksForecastRows(property:string,timeZone:string,preparedAt:string,rows:OnBooksForecastRow[]):ReportCell[][]{
 if(!property||!timeZone||Number.isNaN(Date.parse(preparedAt))||!rows.length)throw Error('The on-books forecast is incomplete.');
 return [['iRatePilot PMS','On-books forecast'],['Property',property],['Property time zone',timeZone],['Prepared at',preparedAt],['Evidence','Current PMS reservations and effective capacity; not predictive demand or earned revenue.'],['Revenue basis','Stay accommodation totals allocated evenly by night; variable nightly quoted prices are not reconstructed.'],[],['Stay night','Effective rooms','Reserved / held','Available','Booked room nights','Allocated accommodation USD','Occupancy %','Allocated ADR USD','Allocated RevPAR USD','Attention'],...rows.map(row=>[row.stayDate,row.effectiveUnits??'Unavailable',row.reservedUnits,row.availableUnits??'Unavailable',row.bookedRoomNights,row.accommodationMinor===null?'Unavailable':money(row.accommodationMinor),row.occupancyPercent===null?'Unavailable':row.occupancyPercent.toFixed(1),row.adrMinor===null?'Unavailable':money(row.adrMinor),row.revparMinor===null?'Unavailable':money(row.revparMinor),row.attention.join(' · ')||'None'])];
}
function money(minor:number){return `${Math.floor(minor/100)}.${String(minor%100).padStart(2,'0')}`}
