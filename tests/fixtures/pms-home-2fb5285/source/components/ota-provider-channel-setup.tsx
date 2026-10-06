'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type RoomType} from '@/lib/pilot';
import {afterDays,type RateBook} from '@/lib/rates';
import {otaConnectorDefinitions,type OtaConnectorKey} from '@/lib/ota-connectors';
import {summarizeOtaDistribution} from '@/lib/ota-distribution-summary';

type Channel={connection_id:string;provider:string;provider_property_id:string;currency:string;certified:boolean;outbound_enabled:boolean;certification_gates_passed:number;certification_gates_required:number;room_mapping_count:number;rate_mapping_count:number;pending?:number;retrying?:number;dead_letter?:number;refresh_pending?:number;refresh_blocked?:number;last_delivered_at?:string|null};
type MappingRow={localId:string;providerId:string};
type Mappings={provider:string;roomMappings:MappingRow[];rateMappings:MappingRow[]};
const providers=otaConnectorDefinitions.filter(item=>item.certificationRequired);

export function OtaProviderChannelSetup({actor,tenant,property,role,types,businessDate}:{actor:string;tenant:string;property:string;role:string;types:RoomType[];businessDate:string}){
 const [channels,setChannels]=useState<Channel[]>([]),[plans,setPlans]=useState<RateBook['plans']>([]),[maps,setMaps]=useState<Mappings|null>(null),[selected,setSelected]=useState<Channel|null>(null);
 const [connection,setConnection]=useState(''),[provider,setProvider]=useState<OtaConnectorKey>('booking_com'),[providerProperty,setProviderProperty]=useState(''),[currency,setCurrency]=useState('USD');
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const working=useRef(false),scope={p_tenant:tenant,p_property:property};
 async function refresh(){const [items,rates]=await Promise.all([hotelRpc<Channel[]>('ota_ari_provider_channels',scope),hotelRpc<RateBook>('rates',{...scope,p_start:businessDate,p_end:afterDays(businessDate,1)})]);setChannels(items);setPlans(rates.plans);setReady(true)}
 useEffect(()=>{let live=true;if(!['owner','manager'].includes(role))return()=>{live=false};Promise.all([hotelRpc<Channel[]>('ota_ari_provider_channels',{p_tenant:tenant,p_property:property}),hotelRpc<RateBook>('rates',{p_tenant:tenant,p_property:property,p_start:businessDate,p_end:afterDays(businessDate,1)})]).then(([items,rates])=>{if(live){setChannels(items);setPlans(rates.plans);setReady(true)}}).catch(e=>{if(live){setReady(true);setError(e instanceof Error?e.message:'Could not load external OTA setup.')}});return()=>{live=false}},[tenant,property,role,businessDate]);
 async function run(action:()=>Promise<string>){if(working.current)return;working.current=true;setBusy(true);setError('');setNotice('');try{const {data}=await hotelClient().auth.getSession();if(data.session?.user?.id!==actor)throw Error('Your account changed. Reopen Connections before continuing.');const message=await action();setNotice(message);try{await refresh()}catch{setError('Saved, but the saved status could not refresh. Reopen Connections before retrying.')}}catch(e){setError(e instanceof Error?e.message:'OTA configuration could not be saved.')}finally{working.current=false;setBusy(false)}}
 async function editMappings(channel:Channel){setError('');setNotice('');setSelected(channel);try{const value=await hotelRpc<Mappings>('ota_ari_get_mappings',{...scope,p_connection:channel.connection_id});if(value.provider!==channel.provider)throw Error('The saved mapping provider does not match this channel.');setMaps(value)}catch(e){setMaps(null);setError(e instanceof Error?e.message:'Could not load room and rate mappings.')}}
 if(!['owner','manager'].includes(role))return <section className="card pilot-empty">An owner or manager can review third-party OTA channel setup.</section>;
 const distribution=summarizeOtaDistribution(channels);
 return <section className="card pilot-settings" aria-label="Third-party OTA channel setup">
  <h2>Third-party OTA channel setup</h2>
  <p>Save a provider property ID, currency and room/rate mappings for launch preparation. This does not connect to the OTA, publish inventory, or receive reservations. Never enter API secrets here.</p>
  <span className="pill gray">Configuration only · outbound disabled</span>
  {error&&<div className="pilot-error" role="alert">{error}</div>}{notice&&<output className="pilot-notice">{notice}</output>}
  {!ready&&<output>Loading saved channel setup…</output>}
  {ready&&!error&&<><h3 className="pilot-distribution-title">Distribution health snapshot</h3><p className="pilot-distribution-note">Shows saved configuration and queue counts only. It does not confirm that an OTA received an update or booking.</p><div className="pilot-distribution-summary" aria-label="Distribution health summary">
   <div><span>Channels configured</span><strong>{distribution.configured}</strong></div>
   <div><span>Certification gates complete</span><strong>{distribution.certificationComplete} / {distribution.configured}</strong></div>
   <div><span>ARI updates waiting</span><strong>{distribution.updatesWaiting??'Unavailable'}</strong></div>
   <div><span>Items needing review</span><strong>{distribution.itemsNeedingReview??'Unavailable'}</strong></div>
  </div></>}
  {channels.map(channel=><article className="pilot-list-row" key={channel.connection_id}>
   <div><strong>{providers.find(item=>item.key===channel.provider)?.name??channel.provider}</strong><small>{channel.connection_id} · OTA property {channel.provider_property_id} · {channel.currency}</small>
    <small>Room mappings: {channel.room_mapping_count} · rate mappings: {channel.rate_mapping_count} · certification: {channel.certification_gates_passed}/{channel.certification_gates_required}</small>
    <small>Refresh queue: {channel.refresh_pending??0} waiting · {channel.refresh_blocked??0} blocked · outbound queue: {channel.pending??0} pending · {channel.retrying??0} retrying · {channel.dead_letter??0} needs review{channel.last_delivered_at?' · Last delivered '+new Date(channel.last_delivered_at).toLocaleString():''}</small>
    <span className="pill gray">{channel.outbound_enabled?'Delivery setting enabled · worker unavailable':'Delivery disabled'}</span>
   </div><button type="button" className="secondary" disabled={busy} onClick={()=>void editMappings(channel)}>Review mappings</button>
  </article>)}
  {ready&&!channels.length&&<p className="pilot-empty">No third-party OTA channels saved for this property.</p>}
  {role==='owner'&&<details className="pilot-connection-form"><summary>Add or update a third-party channel</summary>
   <form onSubmit={e=>{e.preventDefault();const id=connection.trim(),external=providerProperty.trim();void run(async()=>{const saved=await hotelRpc<{connection_id:string}>('ota_ari_save_provider_channel',{...scope,p_connection:id,p_provider:provider,p_provider_property_id:external,p_currency:currency});setConnection('');setProviderProperty('');return `Channel ${saved.connection_id} saved disabled. No OTA traffic was sent.`})}}>
    <fieldset disabled={busy||!ready} style={{border:0,padding:0,margin:0,minWidth:0}}>
     <label className="field">OTA provider<select value={provider} onChange={e=>setProvider(e.target.value as OtaConnectorKey)}>{providers.map(item=><option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
     <label className="field">iRatePilot connection ID<input value={connection} onChange={e=>setConnection(e.target.value)} pattern="[A-Za-z0-9_-]{1,80}" maxLength={80} required placeholder="booking_red_roof_ridgeland"/></label>
     <label className="field">Provider property ID<input value={providerProperty} onChange={e=>setProviderProperty(e.target.value)} maxLength={128} required placeholder="Provided by the OTA"/></label>
     <label className="field">Property currency<input value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} pattern="[A-Z]{3}" maxLength={3} required placeholder="USD"/><small>Three-letter currency code recorded by the OTA.</small></label>
     <p>Saving an existing channel keeps it disabled. A property connection and approved adapter are still required before bookings or inventory can sync.</p>
     <button className="primary" disabled={busy}>Save channel disabled</button>
    </fieldset>
   </form>
  </details>}
  {selected&&<details className="pilot-connection-form" open><summary>Room and rate mappings · {selected.connection_id}</summary>
   {!maps?<output>Loading mappings…</output>:<form onSubmit={e=>{e.preventDefault();const roomMappings=types.map(room=>({localId:room.id,providerId:maps.roomMappings.find(item=>item.localId===room.id)?.providerId??''})).filter(item=>item.providerId.trim()).map(item=>({...item,providerId:item.providerId.trim()}));const rateMappings=plans.filter(plan=>plan.active).map(plan=>({localId:plan.id,providerId:maps.rateMappings.find(item=>item.localId===plan.id)?.providerId??''})).filter(item=>item.providerId.trim()).map(item=>({...item,providerId:item.providerId.trim()}));void run(async()=>{await hotelRpc('ota_ari_save_mappings',{...scope,p_connection:selected.connection_id,p_provider:selected.provider,p_room_mappings:roomMappings,p_rate_mappings:rateMappings});setSelected(null);setMaps(null);return 'Mappings saved. Delivery remains disabled.'})}}>
    <fieldset disabled={busy||role!=='owner'} style={{border:0,padding:0,margin:0,minWidth:0}}>
     <h3>Room types</h3>{types.map(room=><label className="field" key={room.id}>{room.name} · OTA room ID<input value={maps.roomMappings.find(item=>item.localId===room.id)?.providerId??''} onChange={e=>setMaps(current=>current?({...current,roomMappings:[...current.roomMappings.filter(item=>item.localId!==room.id),...(e.target.value?[{localId:room.id,providerId:e.target.value}]:[])]}):current)} maxLength={128} placeholder="Provider room ID"/></label>)}
     <h3>Active rate plans</h3>{plans.filter(plan=>plan.active).map(plan=><label className="field" key={plan.id}>{plan.name} · OTA rate ID<input value={maps.rateMappings.find(item=>item.localId===plan.id)?.providerId??''} onChange={e=>setMaps(current=>current?({...current,rateMappings:[...current.rateMappings.filter(item=>item.localId!==plan.id),...(e.target.value?[{localId:plan.id,providerId:e.target.value}]:[])]}):current)} maxLength={128} placeholder="Provider rate-plan ID"/></label>)}
     <p>Only IDs are saved. Booking.com’s prototype currently accepts numeric provider IDs and standard maximum-occupancy pricing; other providers have no live adapter yet.</p>
     {role==='owner'?<button className="primary">Save mappings disabled</button>:<p>Managers can review these mappings; only the property owner can edit them.</p>}
    </fieldset>
    <button type="button" className="secondary" disabled={busy} onClick={()=>{setSelected(null);setMaps(null)}}>Close mappings</button>
   </form>}
  </details>}
 </section>;
}
