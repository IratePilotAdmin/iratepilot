'use client';
import {useMemo,useRef,useState} from 'react';
import {cents,hotelRpc,type Membership} from '@/lib/pilot';

type CatalogRoomType={id:string;name:string;physical_rooms:number};
type CatalogPlan={id:string;room_type_id:string;name:string;version:number;active:boolean};
type CatalogProperty={property_id:string;property_name:string;currency:string;time_zone:string;business_date:string;room_types:CatalogRoomType[];rate_plans:CatalogPlan[]};
type Catalog={tenant_id:string;requested_properties:number;accessible_properties:number;denied_property_ids:string[];properties:CatalogProperty[]};
type Draft={rate:boolean;plan:string;amount:string;capacity:boolean;roomType:string;units:string};
type RateUpdate={propertyId:string;planId:string;start:string;end:string;amount:number;expectedVersion:number};
type CapacityUpdate={propertyId:string;roomTypeId:string;start:string;end:string;units:number};
type Submission={request:string;key:string};

const blank:Draft={rate:false,plan:'',amount:'',capacity:false,roomType:'',units:''};
function nextDate(date:string){const parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime()))return date;parsed.setUTCDate(parsed.getUTCDate()+1);return parsed.toISOString().slice(0,10)}

export function PortfolioRateInventory({tenant,members,businessDate}:{tenant:string;members:Membership[];businessDate:string}){
 const allowed=useMemo(()=>members.filter(member=>member.tenant_id===tenant&&['owner','manager'].includes(member.role)).filter((member,index,all)=>all.findIndex(item=>item.property_id===member.property_id)===index),[members,tenant]);
 const [selected,setSelected]=useState<string[]>([]),[catalog,setCatalog]=useState<Catalog|null>(null),[drafts,setDrafts]=useState<Record<string,Draft>>({}),[start,setStart]=useState(businessDate),[end,setEnd]=useState(nextDate(businessDate)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const request=useRef<Submission|null>(null),lock=useRef(false);
 const properties=catalog?.properties??[];
 const minimumDate=properties.reduce((latest,property)=>property.business_date>latest?property.business_date:latest,businessDate);
 const deniedIds=catalog?.denied_property_ids??[];
 const current=!!catalog&&catalog.tenant_id===tenant&&catalog.requested_properties===selected.length&&
  properties.length+deniedIds.length===selected.length&&new Set([...properties.map(property=>property.property_id),...deniedIds]).size===selected.length&&
  [...properties.map(property=>property.property_id),...deniedIds].every(id=>selected.includes(id));
 function updateDraft(id:string,patch:Partial<Draft>){setDrafts(value=>({...value,[id]:{...value[id]??blank,...patch}}))}
 async function load(){
  if(!selected.length){setError('Select at least one property first.');return}
  if(selected.length>100){setError('Select no more than 100 properties per update.');return}
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{
   const result=await hotelRpc<Catalog>('portfolio_rate_book',{p_tenant:tenant,p_property_ids:selected});
   if(result.tenant_id!==tenant||result.requested_properties!==selected.length||!Array.isArray(result.properties)||!Array.isArray(result.denied_property_ids)||result.properties.length!==result.accessible_properties||result.properties.length+result.denied_property_ids.length!==selected.length)throw Error('The returned property catalog did not match the selected scope. Refresh and try again.');
   if(result.properties.some(property=>!selected.includes(property.property_id)||!/^\d{4}-\d{2}-\d{2}$/.test(property.business_date)||typeof property.time_zone!=='string'||!Array.isArray(property.room_types)||!Array.isArray(property.rate_plans)||property.room_types.some(room=>!Number.isInteger(room.physical_rooms)||room.physical_rooms<0)||property.rate_plans.some(plan=>!Number.isSafeInteger(plan.version)||plan.version<1)))throw Error('The returned rates or room types did not pass validation. Refresh before updating.');
   const initial:Record<string,Draft>={};
   for(const property of result.properties){const plan=property.rate_plans.find(value=>value.active)??property.rate_plans[0];const room=property.room_types[0];initial[property.property_id]={...blank,plan:plan?.id??'',roomType:room?.id??''}}
   setCatalog(result);setDrafts(initial);const dates=[businessDate,...result.properties.map(property=>property.business_date)].sort();const firstNight=dates[dates.length-1]??businessDate;setStart(firstNight);setEnd(nextDate(firstNight));
   if(result.denied_property_ids.length)setNotice(`${result.denied_property_ids.length} selected propert${result.denied_property_ids.length===1?'y is':'ies are'} outside your assigned access and cannot be updated.`);
   else setNotice(`Loaded rate plans and room types for ${result.properties.length} propert${result.properties.length===1?'y':'ies'}.`);
  }catch(reason){setCatalog(null);setError(reason instanceof Error?reason.message:'Unable to load portfolio rate plans.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function submit(event:{preventDefault():void;currentTarget:HTMLFormElement}){
  event.preventDefault();if(!current||lock.current)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<=start||new Date(end+'T00:00:00Z').getTime()-new Date(start+'T00:00:00Z').getTime()>366*86400000){setError('Choose a date range from 1 to 366 nights.');return}
  const rateRows:RateUpdate[]=[],capacityRows:CapacityUpdate[]=[];
  try{
   for(const property of properties){const draft=drafts[property.property_id]??blank;if(!draft.rate&&!draft.capacity)continue;
    if(property.currency!=='USD')throw Error(`${property.property_name} uses ${property.currency}. Portfolio rate updates currently require USD; no conversion was applied.`);
    if(draft.rate){const plan=property.rate_plans.find(value=>value.id===draft.plan);if(!plan)throw Error(`Choose a saved rate plan for ${property.property_name}.`);rateRows.push({propertyId:property.property_id,planId:plan.id,expectedVersion:plan.version,start,end,amount:cents(draft.amount)})}
    if(draft.capacity){const room=property.room_types.find(value=>value.id===draft.roomType);const unitsText=draft.units.trim();if(!room||!/^(0|[1-9]\d{0,4})$/.test(unitsText))throw Error(`Choose a room type and whole-room capacity for ${property.property_name}.`);const units=Number(unitsText);if(units>room.physical_rooms)throw Error(`Capacity for ${property.property_name} cannot exceed its ${room.physical_rooms} physical rooms of that type.`);capacityRows.push({propertyId:property.property_id,roomTypeId:room.id,start,end,units})}
   }
   if(!rateRows.length&&!capacityRows.length)throw Error('Select a nightly rate or inventory update for at least one property.');
  }catch(reason){setError(reason instanceof Error?reason.message:'Review the selected update fields.');return}
  const ratePayload=rateRows.map(row=>({property_id:row.propertyId,plan_id:row.planId,expected_version:row.expectedVersion,start:row.start,end:row.end,amount_minor:row.amount}));
  const capacityPayload=capacityRows.map(row=>({property_id:row.propertyId,room_type_id:row.roomTypeId,start:row.start,end:row.end,units:row.units}));
  const key=JSON.stringify({tenant,rates:ratePayload,capacity:capacityPayload});if(request.current?.key!==key)request.current={key,request:crypto.randomUUID()};
  lock.current=true;setBusy(true);setError('');setNotice('');
  try{
   const result=await hotelRpc<{rates:unknown[];capacity:unknown[];replayed:boolean}>('portfolio_update',{p_tenant:tenant,p_request:request.current.request,p_rates:ratePayload,p_capacity:capacityPayload});
   if(!Array.isArray(result.rates)||result.rates.length!==ratePayload.length||!Array.isArray(result.capacity)||result.capacity.length!==capacityPayload.length)throw Error('The database returned an incomplete result. Keep the same update and retry so the saved receipt can be checked.');
   const savedNotice=`${ratePayload.length} nightly-rate update${ratePayload.length===1?'':'s'} and ${capacityPayload.length} inventory update${capacityPayload.length===1?'':'s'} saved atomically across ${new Set([...ratePayload,...capacityPayload].map(row=>row.property_id)).size} propert${new Set([...ratePayload,...capacityPayload].map(row=>row.property_id)).size===1?'y':'ies'}.${result.replayed?' Saved result verified on retry.':''}`;setNotice(savedNotice);request.current=null;
   lock.current=false;await load();setNotice(savedNotice);
  }catch(reason){setError(reason instanceof Error?reason.message:'The batch could not be confirmed. Retry the unchanged update to check its exact saved result.')}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="card portfolio-rate-inventory">
  <div className="section-top"><div><h2>Central rates &amp; inventory</h2><p>Review property-specific plan and room mappings, then apply selected updates across properties in one atomic request. Every room type and plan must be mapped explicitly.</p></div></div>
  {allowed.length===0?<p>No properties with owner or manager access are available.</p>:<>
   <fieldset className="portfolio-property-picker" disabled={busy}><legend>Properties to manage</legend><div className="pilot-settings-grid">{allowed.map(member=><label className="pilot-check" key={member.tenant_id+'/'+member.property_id}><input type="checkbox" checked={selected.includes(member.property_id)} onChange={event=>{setSelected(value=>event.target.checked?[...value,member.property_id]:value.filter(id=>id!==member.property_id));setNotice('');setError('')}}/>{member.property_name}<small>{member.role}</small></label>)}</div></fieldset>
   <button className="secondary" type="button" disabled={busy||!selected.length} onClick={()=>void load()}>{busy?'Loading…':'Load selected property mappings'}</button>
   {error&&<div className="pilot-error" role="alert">{error}</div>}{notice&&<output className="pilot-notice">{notice}</output>}
   {current&&<form onSubmit={submit}>
    <div className="form-grid"><label className="field">First night<input type="date" required min={minimumDate} value={start} disabled={busy} onChange={event=>setStart(event.target.value)}/></label><label className="field">End date (exclusive)<input type="date" required min={nextDate(start)} value={end} disabled={busy} onChange={event=>setEnd(event.target.value)}/></label></div>
    {properties.map(property=>{const draft=drafts[property.property_id]??blank;return <fieldset className="portfolio-property-picker" key={property.property_id} disabled={busy}><legend>{property.property_name} · {property.currency}</legend><small>Business date: {property.business_date} · {property.time_zone}</small>
     <label className="pilot-check"><input type="checkbox" checked={draft.rate} onChange={event=>updateDraft(property.property_id,{rate:event.target.checked})}/>Update nightly rate</label>
     {draft.rate&&<div className="form-grid"><label className="field">Saved rate plan<select required value={draft.plan} onChange={event=>updateDraft(property.property_id,{plan:event.target.value})}><option value="">Select a property-specific plan</option>{property.rate_plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {property.room_types.find(room=>room.id===plan.room_type_id)?.name??'Room type'} · v{plan.version}{plan.active?'':' · inactive'}</option>)}</select></label><label className="field">Nightly room price before taxes and fees (USD)<input type="number" min="0" step="0.01" required value={draft.amount} onChange={event=>updateDraft(property.property_id,{amount:event.target.value})} placeholder="For example, 129.00"/></label></div>}
     <label className="pilot-check"><input type="checkbox" checked={draft.capacity} onChange={event=>updateDraft(property.property_id,{capacity:event.target.checked})}/>Update sellable room capacity</label>
     {draft.capacity&&<div className="form-grid"><label className="field">Room type<select required value={draft.roomType} onChange={event=>updateDraft(property.property_id,{roomType:event.target.value,units:''})}><option value="">Select a property-specific room type</option>{property.room_types.map(room=><option key={room.id} value={room.id}>{room.name} · {room.physical_rooms} physical rooms</option>)}</select></label><label className="field">Sellable rooms per night<input type="number" min="0" max={property.room_types.find(room=>room.id===draft.roomType)?.physical_rooms??0} step="1" required value={draft.units} onChange={event=>updateDraft(property.property_id,{units:event.target.value})} placeholder="Enter units (0 closes sales)"/></label></div>}
     <small>Plan and room IDs are property-specific. Rates and inventory remain in USD and this request does not convert currencies. A capacity reduction is rejected if it falls below confirmed stays or active booking holds.</small>
    </fieldset>})}
    <button className="primary" disabled={busy||!properties.some(property=>{const draft=drafts[property.property_id];return draft?.rate||draft?.capacity})}>{busy?'Saving portfolio update…':'Apply selected updates'}</button>
    <p>All selected changes save together. If any property, plan version, date, rate, or capacity check fails, the entire batch rolls back. Repeating an uncertain submission with the same inputs checks the same idempotent request.</p>
   </form>}
  </>}
 </section>
}
