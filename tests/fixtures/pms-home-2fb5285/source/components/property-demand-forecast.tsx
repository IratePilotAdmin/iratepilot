'use client';
import {useMemo,useRef,useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import {readPerformance} from '@/lib/historical-performance';
import {readRevenueDemandAdjustmentSet} from '@/lib/revenue-demand-adjustments';
import {forecastPropertyDemand,propertyCaptureBusinessDate,propertyDemandComparableCandidates,type PropertyForecastCapture} from '@/lib/property-demand-forecast';
import {readDemandForecastSaveReceipt} from '@/lib/revenue-demand-forecast-archive';
import type {RevenueSnapshot} from '@/lib/revenue-pickup';
import {pickupBatchSnapshots,type PickupCapture} from '@/lib/revenue-pickup-report';

const dayOffset=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86_400_000).toISOString().slice(0,10);
const dollars=(minor:number|null)=>minor===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(minor/100);
const storagePrefix='irp-demand-forecast-save-v1';
type Forecast=Extract<ReturnType<typeof forecastPropertyDemand>,{available:true}>;
type PendingSave={key:string;request:string;forecast:Forecast};

export function PropertyDemandForecast({actor,tenant,property,timeZone,currentCaptureId,currentSnapshots,captures}:{actor:string;tenant:string;property:string;timeZone:string;currentCaptureId:string;currentSnapshots:RevenueSnapshot[];captures:PickupCapture[]}){
 const capture=captures.find(item=>item.capture_id===currentCaptureId)??null,asOf=capture?propertyCaptureBusinessDate(capture.started_at,timeZone):'',dates=useMemo(()=>[...new Set(currentSnapshots.filter(item=>item.stayDate>asOf).map(item=>item.stayDate))].sort(),[asOf,currentSnapshots]);
 const [stayDate,setStayDate]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[forecast,setForecast]=useState<ReturnType<typeof forecastPropertyDemand>|null>(null),[saveBusy,setSaveBusy]=useState(false),[saveError,setSaveError]=useState(''),[saved,setSaved]=useState<{key:string;id:string}|null>(null);
 const pendingSave=useRef<PendingSave|null>(null),selected=dates.includes(stayDate)?stayDate:dates[0]??'';
 async function load(){
  if(busy||!capture||!selected)return;setBusy(true);setError('');setForecast(null);setSaveError('');setSaved(null);
  try{
   const auth=await hotelClient().auth.getUser();if(auth.error||auth.data.user?.id!==actor)throw Error('Sign in again before loading the property forecast.');
   const targetRows=currentSnapshots.filter(row=>row.stayDate===selected);if(!targetRows.length)throw Error('No complete on-books snapshot exists for the selected stay night.');
   const leadDays=Math.round((Date.parse(selected)-Date.parse(asOf))/86_400_000),candidates=propertyDemandComparableCandidates({stayDate:selected,asOfDate:asOf,leadDays,captures,timeZone,limit:12});
   const reportStart=dayOffset(asOf,-365),reportEnd=asOf;
   const [rawAdjustments,rawPerformance]=await Promise.all([
    hotelRpc('revenue_demand_adjustments',{p_tenant:tenant,p_property:property}),
    hotelRpc('historical_performance_report',{p_tenant:tenant,p_property:property,p_start:reportStart,p_end:reportEnd}),
   ]);
   const adjustmentSet=readRevenueDemandAdjustmentSet(rawAdjustments,{tenant,property}),performance=readPerformance(rawPerformance,{tenant,property,start:reportStart,end:reportEnd});
   const historicalCaptures:PropertyForecastCapture[]=[];
   for(let offset=0;offset<candidates.length;offset+=3){
    const batch=await Promise.all(candidates.slice(offset,offset+3).map(async candidate=>{
     const raw=await hotelRpc('pickup_batch',{p_tenant:tenant,p_property:property,p_capture:candidate.capture.capture_id});
     return {capture:candidate.capture,snapshots:pickupBatchSnapshots(raw,tenant,property,candidate.capture.capture_id)};
    }));historicalCaptures.push(...batch);
   }
   setForecast(forecastPropertyDemand({tenant,property,timeZone,stayDate:selected,currentCapture:capture,currentSnapshots,captures,historicalCaptures,historicalDays:performance.days,adjustments:adjustmentSet.adjustments}));
  }catch(reason){setError(reason instanceof Error?reason.message:'The property demand forecast could not be loaded.');}
  finally{setBusy(false)}
 }
 async function saveForecast(){
  if(saveBusy||!capture||!forecast?.available)return;const forecastKey=[actor,tenant,property,currentCaptureId,forecast.stayDate].join(':');const key=[storagePrefix,forecastKey].join(':');setSaveBusy(true);setSaveError('');
  try{
   let command=pendingSave.current?.key===key?pendingSave.current:null;
   if(!command){
    let stored:unknown=null;try{const raw=sessionStorage.getItem(key);stored=raw?JSON.parse(raw):null}catch{}
    if(stored&&typeof stored==='object'&&!Array.isArray(stored)&&'request' in stored&&'forecast' in stored&&typeof (stored as {request?:unknown}).request==='string'&&JSON.stringify((stored as {forecast:unknown}).forecast)===JSON.stringify(forecast))command={key,request:(stored as {request:string}).request,forecast};
    else command={key,request:crypto.randomUUID(),forecast};
    pendingSave.current=command;try{sessionStorage.setItem(key,JSON.stringify({request:command.request,forecast:command.forecast}))}catch{}
   }
   const receipt=readDemandForecastSaveReceipt(await hotelRpc('save_revenue_demand_forecast',{p_tenant:tenant,p_property:property,p_request:command.request,p_capture:currentCaptureId,p_forecast:command.forecast}),{tenant,property,request:command.request});
   try{sessionStorage.removeItem(key)}catch{}pendingSave.current=null;setSaved({key:forecastKey,id:receipt.forecast_id});
  }catch(reason){setSaveError(reason instanceof Error?reason.message:'The forecast save could not be verified. Retry to check the same saved request.');}
  finally{setSaveBusy(false)}
 }
 const forecastKey=forecast?.available?[actor,tenant,property,currentCaptureId,forecast.stayDate].join(':'):'';
 return <section className="card" aria-labelledby="property-demand-forecast-title"><div className="section-top"><div><h2 id="property-demand-forecast-title">Property demand forecast</h2><p>Deterministic planning estimate · manager-entered event inputs · no rate or inventory changes</p></div><span className="pill amber">Review before use</span></div>{!capture?<p>Load recent pickup captures, then choose a saved capture to prepare a forecast.</p>:<div className="form-grid"><label className="field">Future stay night<select value={selected} disabled={busy||dates.length===0} onChange={event=>{setStayDate(event.target.value);setForecast(null);setError('');setSaveError('');setSaved(null)}}>{dates.map(date=><option key={date} value={date}>{date}</option>)}</select></label><div className="field"><span>Capture date</span><span>{asOf} · {timeZone}</span></div><div><button className="primary" disabled={busy||!selected} onClick={()=>void load()}>{busy?'Preparing forecast…':'Prepare forecast'}</button></div></div>}{dates.length===0&&capture&&<p>No future stay nights are available in this capture.</p>}{error&&<p className="pilot-error" role="alert">{error}</p>}{forecast&&(!forecast.available?<output className="pilot-error">Forecast unavailable: {forecast.reason} Load older captures if this property does not yet have three matching closed-day comparisons.</output>:<section aria-label="Property demand forecast results"><p>{forecast.stayDate} · {forecast.comparableCount} same-weekday, same-lead-time closed stays · {forecast.confidence} confidence</p><div className="pilot-report-totals">{[['Booked rooms now',forecast.bookedUnits],['Effective rooms',forecast.effectiveCapacity],['Projected occupied rooms',forecast.forecastOccupiedUnits],['Projected occupancy',forecast.forecastOccupancyPercent.toFixed(1)+'%'],['Projected ADR',dollars(forecast.forecastAdrMinor)],['Projected accommodation',dollars(forecast.forecastAccommodationMinor)]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div><ul>{forecast.explanations.map(note=><li key={note}>{note}</li>)}</ul>{forecast.appliedDemandAdjustments.length>0&&<p>Applied saved event and seasonal inputs: {forecast.appliedDemandAdjustments.map(item=>`${item.kind}: ${item.label} (${item.adjustmentBasisPoints>0?'+':''}${(item.adjustmentBasisPoints/100).toFixed(2)}%)`).join(' · ')}</p>}<ul>{forecast.limitations.map(note=><li key={note}>{note}</li>)}</ul><button className="secondary" disabled={saveBusy||saved?.key===forecastKey} onClick={()=>void saveForecast()}>{saved?.key===forecastKey?'Saved for accuracy reporting':saveBusy?'Saving forecast…':'Save forecast for accuracy reporting'}</button>{saved?.key===forecastKey&&<output>This forecast is saved as an immutable manager review record. Compare it with the closed-day result in Forecast vs actual below.</output>}{saveError&&<p className="pilot-error" role="alert">{saveError}</p>}</section>)}</section>;
}
