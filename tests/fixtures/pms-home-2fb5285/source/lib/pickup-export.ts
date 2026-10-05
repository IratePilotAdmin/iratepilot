import {pickupAverageMinor} from './pickup-money';
import {compareRevenueSnapshots,type RevenueSnapshot} from './revenue-pickup';
import {reportDecimal,reportMoney,type ReportCell} from './report-export';
export function pickupExportRows(old:RevenueSnapshot[],current:RevenueSnapshot[],beforeId:string,afterId:string,types:{id:string;name:string}[]):ReportCell[][]{
 const previous=new Map(old.map(s=>[s.roomTypeId+':'+s.stayDate,s])),later=new Map(current.map(s=>[s.roomTypeId+':'+s.stayDate,s])),names=new Map(types.map(t=>[t.id,t.name]));
 const keys=[...new Set([...previous.keys(),...later.keys()])].sort();
 const money=(n:number|null|undefined):ReportCell=>n==null?'Unavailable':reportDecimal(reportMoney(n));
 const average=(n:number|null,d:number|null):ReportCell=>money(pickupAverageMinor(n,d));
 const rows:ReportCell[][]=[['Booking pickup - development preview'],['Basis','Net booked room nights and accommodation revenue; includes cancellations and changes. Not earned revenue, payments or a demand forecast.'],['Rounding','ADR and RevPAR rounded to nearest cent, half up. Occupancy is a ratio (1 = 100%). Room type names are current.'],['Baseline capture',beforeId],['Later capture',afterId],['Tenant','Property','Stay night','Room type ID','Room type','Currency','Baseline captured at','Later captured at','Comparison status','Room-night change','Room revenue change','Current booked room nights','Current sellable room nights','Current room revenue','Current occupancy ratio','Current ADR','Current RevPAR']];
 for(const key of keys){const a=previous.get(key),b=later.get(key),s=b??a!,r=compareRevenueSnapshots(a??null,b??null);
 rows.push([s.tenantId,s.propertyId,s.stayDate,s.roomTypeId,names.get(s.roomTypeId)??'Unknown room type',s.currency,a?.capturedAt??'Unavailable',b?.capturedAt??'Unavailable',r.available?'Comparable':r.reason,r.available?reportDecimal(String(r.roomNightsChange)):'Unavailable',r.available?money(r.roomRevenueChangeMinor):'Unavailable',b?.bookedRoomNights??'Unavailable',b?.sellableRoomNights??'Unavailable',money(b?.roomRevenueMinor),r.available?r.currentOccupancy??'Unavailable':'Unavailable',r.available&&b?average(b.roomRevenueMinor,b.bookedRoomNights):'Unavailable',r.available&&b?average(b.roomRevenueMinor,b.sellableRoomNights):'Unavailable']);
 }
 return rows;
}
