'use client';
import {useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import {readPerformance} from '@/lib/historical-performance';
import {compareDemandForecastsToActual,readRevenueDemandForecastArchive,type ForecastActualRow} from '@/lib/revenue-demand-forecast-archive';
const offset=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86_400_000).toISOString().slice(0,10);
const money=(minor:number|null)=>minor===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(minor/100);
const statusLabel:Record<ForecastActualRow['actualStatus'],string>={'not-closed':'Awaiting day close','inventory-incomplete':'Inventory unavailable','capacity-changed':'Capacity changed; not comparable','occupancy-unknown':'Occupancy unavailable','revenue-unknown':'Accommodation unavailable',available:'Compared with closed actual'};
export function ForecastAccuracyReport({actor,tenant,property,businessDate}:{actor:string;tenant:string;property:string;businessDate:string}){
 const [rows,setRows]=useState<ForecastActualRow[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){
  if(busy)return;setBusy(true);setRows(null);setError('');const start=offset(businessDate,-365),end=offset(businessDate,1);
  try{
   const auth=await hotelClient().auth.getUser();if(auth.error||auth.data.user?.id!==actor)throw Error('Sign in again before loading forecast accuracy.');
   const [archiveRaw,performanceRaw]=await Promise.all([
    hotelRpc('revenue_demand_forecasts',{p_tenant:tenant,p_property:property,p_start:start,p_end:end,p_limit:500}),
    hotelRpc('historical_performance_report',{p_tenant:tenant,p_property:property,p_start:start,p_end:end}),
   ]);
   const archive=readRevenueDemandForecastArchive(archiveRaw,{tenant,property,start,end}),performance=readPerformance(performanceRaw,{tenant,property,start,end});
   setRows(compareDemandForecastsToActual(archive,performance.days));
  }catch(reason){setError(reason instanceof Error?reason.message:'Forecast accuracy could not be loaded.');}
  finally{setBusy(false)}
 }
 const compared=rows?.filter(row=>row.actualStatus==='available')??[],unitsMae=compared.length?compared.reduce((sum,row)=>sum+Math.abs(row.occupiedUnitsError??0),0)/compared.length:null,occupancyMae=compared.length?compared.reduce((sum,row)=>sum+Math.abs(row.occupancyErrorPercentagePoints??0),0)/compared.length:null,accommodationRows=compared.filter(row=>row.accommodationErrorMinor!==null),accommodationMae=accommodationRows.length?accommodationRows.reduce((sum,row)=>sum+Math.abs(row.accommodationErrorMinor??0),0)/accommodationRows.length:null;
 return <section className="card" aria-labelledby="forecast-accuracy-title"><div className="section-top"><div><h2 id="forecast-accuracy-title">Forecast vs actual</h2><p>Compare saved manager forecasts with closed, capacity-matched property results.</p></div><button className="secondary" disabled={busy} onClick={()=>void load()}>{busy?'Loading…':rows?'Refresh accuracy':'Load accuracy report'}</button></div>{error&&<p className="pilot-error" role="alert">{error}</p>}{rows&&<><div className="pilot-report-totals"><div><span>Saved forecasts</span><strong>{rows.length}</strong></div><div><span>Closed comparable nights</span><strong>{compared.length}</strong></div><div><span>Mean absolute room error</span><strong>{unitsMae===null?'Unavailable':unitsMae.toFixed(1)}</strong></div><div><span>Mean absolute occupancy error</span><strong>{occupancyMae===null?'Unavailable':occupancyMae.toFixed(1)+' pp'}</strong></div><div><span>Mean absolute accommodation error</span><strong>{accommodationMae===null?'Unavailable':money(Math.round(accommodationMae))}</strong></div></div>{rows.length===0?<p>No saved forecasts are available for this property and date range.</p>:<div className="pilot-table-wrap"><table className="pilot-table"><thead><tr><th>Stay night</th><th>Forecast rooms / occupancy</th><th>Actual rooms / occupancy</th><th>Occupancy error</th><th>Forecast ADR</th><th>Actual ADR</th><th>Forecast accommodation</th><th>Actual overnight accommodation</th><th>Result</th></tr></thead><tbody>{rows.map(row=>{const f=row.forecast.forecast;return <tr key={row.forecast.forecast_id}><td>{f.stayDate}<br/><small>Saved {row.forecast.created_at}</small></td><td>{f.forecastOccupiedUnits} / {f.forecastOccupancyPercent.toFixed(1)}%</td><td>{row.actualOccupiedUnits===null?'Unavailable':`${row.actualOccupiedUnits} / ${row.actualOccupancyPercent?.toFixed(1)}%`}</td><td>{row.occupancyErrorPercentagePoints===null?'Unavailable':`${row.occupancyErrorPercentagePoints>0?'+':''}${row.occupancyErrorPercentagePoints.toFixed(1)} pp`}</td><td>{money(f.forecastAdrMinor)}</td><td>{money(row.actualAdrMinor)}</td><td>{money(f.forecastAccommodationMinor)}</td><td>{money(row.actualAccommodationMinor)}</td><td>{statusLabel[row.actualStatus]}</td></tr>})}</tbody></table></div>}<p>Accuracy uses only closed nights with complete inventory and unchanged capacity. Incomplete history is excluded from error averages; ADR and accommodation compare overnight accommodation only.</p></>}</section>;
}
