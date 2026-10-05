'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {downloadReport} from '@/lib/report-export';
import {propertyComparisonRows,type PropertyComparisonRow,type PortfolioSummary} from '@/lib/property-comparison-export';
import {PortfolioRateInventory} from '@/components/portfolio-rate-inventory';

type PortfolioSnapshot={tenant_id:string;business_date:string|null;generated_at:string;requested_properties:number;accessible_properties:number;denied_property_ids:string[];properties:PortfolioSummary[]};
export function PropertyOverview({tenant,members,businessDate,onOpen}:{tenant:string;members:Membership[];businessDate:string;onOpen:(member:Membership)=>void}){
 const [date,setDate]=useState(businessDate),[loadedDate,setLoadedDate]=useState(''),[rows,setRows]=useState<PropertyComparisonRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0),alive=useRef(true);
 useEffect(()=>{const aliveRef=alive,sequenceRef=sequence;aliveRef.current=true;return()=>{aliveRef.current=false;sequenceRef.current++}},[]);
 const allowed=members.filter(m=>m.tenant_id===tenant&&['owner','manager'].includes(m.role));
 async function load(){
  const seq=++sequence.current;setError('');setRows([]);setLoadedDate('');
  const start=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==date){setError('Choose a valid comparison date.');return}
  setBusy(true);const result:PropertyComparisonRow[]=[];
  for(let i=0;i<allowed.length;i+=100){
   if(!alive.current||seq!==sequence.current)return;
   const batch=allowed.slice(i,i+100),ids=batch.map(member=>member.property_id);
   try{
    const snapshot=await hotelRpc<PortfolioSnapshot>('portfolio_overview',{p_tenant:tenant,p_property_ids:ids,p_business_date:date});
    const denied=new Set(snapshot.denied_property_ids);
    if(snapshot.tenant_id!==tenant||snapshot.requested_properties!==ids.length||!Array.isArray(snapshot.properties)||!Array.isArray(snapshot.denied_property_ids)||snapshot.properties.length!==snapshot.accessible_properties||snapshot.properties.length+denied.size!==ids.length||denied.size!==new Set(snapshot.denied_property_ids).size)throw Error('The returned organization summary did not match the requested property scope.');
    const byId=new Map<string,PortfolioSummary>();
    for(const property of snapshot.properties){
     if(!ids.includes(property.property_id)||byId.has(property.property_id)||property.business_date!==date||!Number.isInteger(property.room_total)||!Number.isInteger(property.in_house)||!Number.isInteger(property.arrivals)||!Number.isInteger(property.departures)||!Number.isInteger(property.ready_vacant)||!Number.isInteger(property.to_prepare)||!Number.isInteger(property.maintenance)||![property.room_total,property.in_house,property.arrivals,property.departures,property.ready_vacant,property.to_prepare,property.maintenance].every(value=>value>=0))throw Error('The returned organization summary contains invalid property totals.');
     byId.set(property.property_id,{...property,generated_at:snapshot.generated_at});
    }
    if([...denied].some(id=>!ids.includes(id)))throw Error('The returned access exclusions did not match the requested properties.');
    for(const membership of batch){const property=byId.get(membership.property_id);result.push(property?{membership,snapshot:property}:{membership,error:'Property access changed. Refresh your property list.'})}
   }catch(e){for(const membership of batch)result.push({membership,error:e instanceof Error?e.message:'Summary unavailable.'})}
  }
  if(alive.current&&seq===sequence.current){setRows(result);setLoadedDate(date);setBusy(false)}
 }
 return <><section className="card property-overview">
  <h2>Property overview</h2><p>Compare operational totals for properties you can manage in this organization. The dashboard receives summary counts only, not guest, reservation, folio or payment rows. Business dates follow each property’s time zone unless you choose a comparison date.</p>
  <form onSubmit={e=>{e.preventDefault();void load()}}><label className="field">Comparison business date<input type="date" required value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label><button className="primary" disabled={busy||!allowed.length}>{busy?'Loading properties…':'Compare properties'}</button></form>
  {error&&<p role="alert">{error}</p>}
  {!allowed.length&&<p>No properties with owner or manager access in this organization.</p>}
  {loadedDate&&loadedDate!==date&&<output>Load the comparison again to use the changed date.</output>}
  {loadedDate===date&&rows.length>0&&!busy&&<button className="secondary" onClick={()=>{try{downloadReport('iratepilot-property-comparison-'+loadedDate,propertyComparisonRows(loadedDate,rows))}catch{setError('The report could not download. Try again.')}}}>Download comparison CSV</button>}
  {loadedDate===date&&rows.length>0&&<div className="pilot-table-wrap"><table className="pilot-table"><thead><tr>{['Property','Local date / time zone','Rooms','In house','Arrivals','Departures','Ready vacant','To prepare','Maintenance'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.membership.tenant_id+'/'+row.membership.property_id}><td><button className="text-button" onClick={()=>onOpen(row.membership)}>{row.snapshot?.property_name??row.membership.property_name}</button><small>{row.membership.tenant_name}</small>{row.snapshot&&<small>Snapshot: {new Date(row.snapshot.generated_at).toLocaleString()}</small>}</td>{row.error?<td colSpan={8}><output>Unavailable: {row.error}</output></td>:<><td>{row.snapshot?.business_date} · {row.snapshot?.time_zone}</td><td>{row.snapshot?.room_total}</td><td>{row.snapshot?.in_house}</td><td>{row.snapshot?.arrivals}</td><td>{row.snapshot?.departures}</td><td>{row.snapshot?.ready_vacant}</td><td>{row.snapshot?.to_prepare}</td><td>{row.snapshot?.maintenance}</td></>}</tr>)}</tbody></table><p>Ready vacant excludes in-house, closed and rooms with unfinished turnover work. To prepare excludes active maintenance closures. Dirty and inspection rooms are included in To prepare. Counts are current snapshots, not historical revenue or occupancy reporting; unavailable properties are never treated as zero.</p></div>}
 </section><PortfolioRateInventory tenant={tenant} members={members} businessDate={businessDate}/></>;
}
