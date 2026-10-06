import type {Membership} from './pilot';
import type {ReportCell} from './report-export';

export type PortfolioSummary={
 property_id:string;property_name:string;time_zone:string;currency:string;
 business_date:string;room_total:number;in_house:number;arrivals:number;departures:number;
 ready_vacant:number;to_prepare:number;maintenance:number;dirty:number;inspection:number;
 generated_at:string;
};
export type PropertyComparisonRow={membership:Membership;snapshot?:PortfolioSummary;error?:string};

export function propertyComparisonRows(date:string,rows:PropertyComparisonRow[]):ReportCell[][] {
 return [
  ['iRatePilot property comparison',date],
  ['Basis','Current operational counts for the selected local business date. No reservation, guest, folio or payment rows are included.'],
  ['Organization','Property','Property ID','Time zone','Business date','Snapshot UTC','Rooms','In house','Arrivals','Departures','Ready vacant','To prepare','Maintenance','Status'],
  ...rows.map(({membership:m,snapshot,error}):ReportCell[]=>[
   m.tenant_name,m.property_name,m.property_id,snapshot?.time_zone??m.time_zone,date,snapshot?.generated_at??'',
   snapshot?.room_total??'Unavailable',snapshot?.in_house??'Unavailable',snapshot?.arrivals??'Unavailable',
   snapshot?.departures??'Unavailable',snapshot?.ready_vacant??'Unavailable',snapshot?.to_prepare??'Unavailable',
   snapshot?.maintenance??'Unavailable',error??'Loaded'
  ])
 ];
}
