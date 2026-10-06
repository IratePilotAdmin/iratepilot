'use client';
import {useEffect,useState} from 'react';
import {hotelRpc,type RoomType} from '@/lib/pilot';
import {afterDays} from '@/lib/rates';
import {RED_ROOF_SHADOW_PROPERTY} from '@/lib/revenue-live';
import {evaluatePmsForecastEvidence} from '@/lib/revenue-pms-forecast-evidence';
type Forecasts=Parameters<typeof evaluatePmsForecastEvidence>[0];
type Closes=Parameters<typeof evaluatePmsForecastEvidence>[1];
type Feed={tenantId:string;propertyId:string;asOf:string;from:string;to:string;selection:string;truncated:boolean;forecasts:Forecasts;closes:Closes};
type Loaded={key:string;feed:Feed;report:ReturnType<typeof evaluatePmsForecastEvidence>};
export function RevenueForecastEvidence({tenant,property,businessDate,roomTypes}:{tenant:string;property:string;businessDate:string;roomTypes:RoomType[]}){
 const [period,setPeriod]=useState<'upcoming'|'completed'>('upcoming'),[loaded,setLoaded]=useState<Loaded|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[clock,setClock]=useState(Date.now()),[refresh,setRefresh]=useState(0);
 const from=afterDays(businessDate,period==='upcoming'?1:-30),to=afterDays(businessDate,period==='upcoming'?30:-1),key=[tenant,property,from,to].join('|');
 useEffect(()=>{let live=true,running=false;setLoaded(null);setError('');if(property!==RED_ROOF_SHADOW_PROPERTY)return;
  const read=async()=>{if(running||document.visibilityState==='hidden')return;running=true;setBusy(true);try{
   const feed=await hotelRpc<Feed>('forecast_evidence',{p_tenant:tenant,p_property:property,p_from:from,p_to:to});
   if(!feed||feed.tenantId!==tenant||feed.propertyId!==property||feed.from!==from||feed.to!==to||feed.truncated!==false||feed.selection!=='latest_issued_forecast_per_room_night_model'||!Array.isArray(feed.forecasts)||!Array.isArray(feed.closes))throw Error('Forecast evidence does not match the selected property or dates.');
   const report=evaluatePmsForecastEvidence(feed.forecasts,feed.closes,{tenantId:tenant,propertyId:property,asOf:feed.asOf});
   if(live){setLoaded({key,feed,report});setError('');setClock(Date.now());}
  }catch(e){if(live){setLoaded(null);setError(e instanceof Error?e.message:'Forecast evidence could not load.');}}finally{running=false;if(live)setBusy(false);}};
  void read();const interval=setInterval(()=>{if(live)setClock(Date.now());void read();},60000);window.addEventListener('focus',read);window.addEventListener('online',read);document.addEventListener('visibilitychange',read);
  return()=>{live=false;clearInterval(interval);window.removeEventListener('focus',read);window.removeEventListener('online',read);document.removeEventListener('visibilitychange',read);};
 },[tenant,property,from,to,key,refresh]);
 if(property!==RED_ROOF_SHADOW_PROPERTY)return null;
 const current=loaded?.key===key?loaded:null,age=current?clock-Date.parse(current.feed.asOf):NaN,fresh=Number.isFinite(age)&&age>=0&&age<5*60000,report=fresh?current?.report:null,feed=fresh?current?.feed:null;
 return <section className="card pilot-forecast-evidence" aria-labelledby="forecast-evidence-title" aria-busy={busy}>
  <div className="section-top"><div><h2 id="forecast-evidence-title">Saved forecasts and accuracy</h2><p>Compare predictions saved before each night with finalized PMS overnight occupancy.</p></div><span className="pill amber">Accuracy unvalidated</span></div>
  <div className="pilot-forecast-controls"><label className="field">Review period<select value={period} onChange={e=>setPeriod(e.target.value as typeof period)}><option value="upcoming">Upcoming 30 nights</option><option value="completed">Previous 30 nights</option></select></label><button className="secondary" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Refresh evidence</button></div>
  <p>{from} through {to}. Only the latest saved prediction for each room type, night and model is shown.</p>
  {error&&<p className="pilot-error" role="alert">{error}</p>}
  {busy&&!current&&<p role="status">Loading saved forecast evidence…</p>}
  {current&&!fresh&&<p className="pilot-error" role="status">Evidence is older than five minutes. Refresh before reviewing results.</p>}
  {report&&feed&&<><div className="pilot-report-totals"><div><span>Saved predictions</span><strong>{feed.forecasts.filter(f=>f.evidenceState==='recorded').length}</strong></div><div><span>Awaiting pickup history</span><strong>{report.pendingHistory}</strong></div><div><span>Finalized comparisons</span><strong>{report.eligibleSamples}</strong></div></div>
   {!report.eligibleSamples&&<p role="status">{period==='upcoming'?'Upcoming nights have no finalized occupancy result yet.':'No saved predictions with usable finalized occupancy results exist in this period.'} Missing results are not counted as zero occupancy.</p>}
   {report.rejectedCloses>0&&<p className="pilot-error">{report.rejectedCloses} forecast comparisons were excluded because their close evidence was incomplete or inconsistent.</p>}
   {!!Object.keys(report.excluded).length&&<p>Excluded comparisons: {Object.entries(report.excluded).map(([reason,count])=>`${count} ${reason.replaceAll('_',' ')}`).join('; ')}.</p>}
   {!!report.byModel.length&&<div className="pilot-table-wrap" tabIndex={0} aria-label="Forecast accuracy results"><table className="pilot-table"><thead><tr><th>Model</th><th>Comparisons</th><th>Average room error</th><th>Occupancy error</th><th>Improvement over on books</th></tr></thead><tbody>{report.byModel.map(model=><tr key={model.modelVersion}><td>{model.modelVersion==='on-books-v1'?'On-books baseline':'Seven-day pickup pace'}</td><td>{model.metrics?.samples}</td><td>{model.metrics?.roomMae} rooms</td><td>{model.metrics?.occupancyMaePercentagePoints} percentage points</td><td>{model.metrics?.improvementAgainstOnBooksPercent===null?'Not defined':`${model.metrics?.improvementAgainstOnBooksPercent}%`}</td></tr>)}</tbody></table></div>}
   {feed.forecasts.length>0?<div className="pilot-table-wrap" tabIndex={0} aria-label="Saved forecast records"><table className="pilot-table"><thead><tr><th>Night / room type</th><th>Model</th><th>On books</th><th>Saved prediction</th><th>Issued</th></tr></thead><tbody>{feed.forecasts.slice(0,30).map(f=><tr key={[f.roomTypeId,f.stayDate,f.modelVersion].join('|')}><td>{f.stayDate}<small>{roomTypes.find(t=>t.id===f.roomTypeId)?.name??f.roomTypeId}</small></td><td>{f.modelVersion==='on-books-v1'?'On-books baseline':'Seven-day pickup pace'}</td><td>{f.onBooksRooms}</td><td>{f.predictedRooms===null?'Awaiting seven-day history':`${f.predictedRooms} of ${f.capacity} rooms`}</td><td>{new Date(f.issuedAt).toLocaleString()}</td></tr>)}</tbody></table>{feed.forecasts.length>30&&<p>Showing the first 30 of {feed.forecasts.length} records.</p>}</div>:<p>No prospective forecast records exist in this period. Historical predictions are never fabricated.</p>}
   <p>Evidence checked {new Date(feed.asOf).toLocaleString()}. Results remain unvalidated for live pricing, even when comparisons are available. Automated rate writeback stays disabled.</p>
  </>}
 </section>;
}
