import type {HotelWorkspace,Room} from '@/lib/pilot';
import type {ReportCell} from '@/lib/report-export';

export type DailyOpsSummary={
 property:string;
 businessDate:string;
 timeZone:string;
 roomTotal:number;
 readyRooms:number;
 inHouse:number;
 arrivals:number;
 departures:number;
 roomsToPrepare:number;
 maintenance:number;
};

const isDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const maintenanceNow=(room:Room,day:string)=>room.maintenance_intervals?.some(row=>row.start<=day&&row.end>day)??false;

export function dailyOpsSummary(workspace:HotelWorkspace):DailyOpsSummary{
 if(!workspace||typeof workspace.property?.name!=='string'||!workspace.property.name.trim()||typeof workspace.property.time_zone!=='string'||!workspace.property.time_zone.trim()||!isDate(workspace.business_date)||!Array.isArray(workspace.rooms)||!Array.isArray(workspace.reservations))throw Error('A complete property snapshot is required for the daily brief.');
 const rooms=workspace.rooms,stays=workspace.reservations.filter(row=>row.status==='In house');
 const occupied=new Set(stays.map(row=>row.physical_room_id).filter((id):id is string=>typeof id==='string'));
 const ready=rooms.filter(room=>room.status==='Clean'&&!room.open_turnover_task&&!maintenanceNow(room,workspace.business_date)&&!occupied.has(room.id)).length;
 return {
  property:workspace.property.name.trim(),businessDate:workspace.business_date,timeZone:workspace.property.time_zone.trim(),
  roomTotal:rooms.length,readyRooms:ready,inHouse:stays.length,
  arrivals:workspace.reservations.filter(row=>row.status==='Confirmed'&&row.arrival===workspace.business_date).length,
  departures:stays.filter(row=>row.departure===workspace.business_date).length,
  roomsToPrepare:rooms.filter(room=>room.status!=='Clean'||!!room.open_turnover_task).length,
  maintenance:rooms.filter(room=>maintenanceNow(room,workspace.business_date)).length,
 };
}

// Aggregate-only rows: this export intentionally excludes guest names, room
// labels, reservation references, folios, payment records and ID data.
export function dailyOpsSummaryRows(summary:DailyOpsSummary):ReportCell[][]{
 if(!summary||!isDate(summary.businessDate)||![summary.roomTotal,summary.readyRooms,summary.inHouse,summary.arrivals,summary.departures,summary.roomsToPrepare,summary.maintenance].every(value=>Number.isSafeInteger(value)&&value>=0))throw Error('Invalid daily brief totals.');
 return [
  ['iRatePilot daily operations brief'],
  ['Property',summary.property],
  ['Business date',summary.businessDate],
  ['Property time zone',summary.timeZone],
  [],
  ['Measure','Rooms / stays'],
  ['Physical rooms',summary.roomTotal],
  ['Ready rooms',summary.readyRooms],
  ['In house',summary.inHouse],
  ['Arrivals today',summary.arrivals],
  ['Departures today',summary.departures],
  ['Rooms to prepare',summary.roomsToPrepare],
  ['Rooms under maintenance',summary.maintenance],
  [],
  ['Snapshot only; refresh before shift handoff. This is not a night audit, payment settlement, or demand forecast.'],
 ];
}
