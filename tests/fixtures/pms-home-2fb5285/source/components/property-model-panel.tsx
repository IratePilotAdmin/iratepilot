'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc,formText} from '@/lib/pilot';
import {useClientReady} from '@/lib/client-ready';
import {definitiveBookingRejection} from '@/lib/pending-booking';

export type OperatingProfile={tenant_id:string;property_id:string;property:{id:string;name:string;time_zone:string;currency:string};mode:'hotel'|'whole_home';version:number;max_guests:number|null;room_type_id:string|null;room_id:string|null};
type ModelCommand={p_request:string;p_expected_version:number;p_mode:'hotel'|'whole_home';p_max_guests:number|null};
type CreateCommand={p_request:string;p_name:string;p_time_zone:string;p_mode:'hotel'|'whole_home';p_max_guests:number|null};
type Command=ModelCommand|CreateCommand;
type Props={actor:string;tenant:string;property:string;role:string;onBusyChange:(busy:boolean)=>void;onSaved:()=>Promise<void>};
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function validCommand(value:unknown,create:boolean):value is Command{
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 const keys=create?'p_max_guests,p_mode,p_name,p_request,p_time_zone':'p_expected_version,p_max_guests,p_mode,p_request';
 return Object.keys(v).sort().join(',')===keys&&typeof v.p_request==='string'&&uuid.test(v.p_request)&&['hotel','whole_home'].includes(String(v.p_mode))&&(v.p_mode==='hotel'?v.p_max_guests===null:Number.isInteger(v.p_max_guests)&&Number(v.p_max_guests)>=1&&Number(v.p_max_guests)<=20)&&(create?typeof v.p_name==='string'&&v.p_name.trim().length>0&&v.p_name.length<=200&&typeof v.p_time_zone==='string'&&v.p_time_zone.length>0:Number.isSafeInteger(v.p_expected_version)&&Number(v.p_expected_version)>=1);
}
function usePropertyCommand(key:string,create:boolean,onBusyChange:(busy:boolean)=>void){
 const [restored]=useState(()=>{try{const raw=sessionStorage.getItem(key);if(!raw)return {pending:null,error:''};const value:unknown=JSON.parse(raw);if(!validCommand(value,create))throw Error();return {pending:value,error:''}}catch{return {pending:null,error:'A saved property request could not be read. Reconcile the property list before making another change.'}}});
 const [pending,setPending]=useState<Command|null>(restored.pending),[busy,setBusy]=useState(false),[error,setError]=useState(restored.error);
 const lock=useRef(false),alive=useRef(true),busyCallback=useRef(onBusyChange);
 useEffect(()=>{busyCallback.current=onBusyChange},[onBusyChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(lock.current)busyCallback.current(false)}},[]);
 async function run(name:string,scope:Record<string,unknown>,command:Command,onSaved:(profile:OperatingProfile)=>Promise<void>,onRejected?:()=>void){
  if(lock.current||restored.error)return;lock.current=true;setBusy(true);busyCallback.current(true);setError('');
  try{
   sessionStorage.setItem(key,JSON.stringify(command));setPending(command);
   let result:OperatingProfile;
   try{result=await hotelRpc<OperatingProfile>(name,{...scope,...command})}catch(e){if(definitiveBookingRejection(e)){if(alive.current){sessionStorage.removeItem(key);setPending(null);onRejected?.()}throw e}throw Error('The result is uncertain. Retry this saved request to confirm it before creating another change.')}
   if(!alive.current)return;sessionStorage.removeItem(key);setPending(null);await onSaved(result);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to save property.')}finally{lock.current=false;if(alive.current){setBusy(false);busyCallback.current(false)}}
 }
 return {pending,busy,error,blocked:!!restored.error,run};
}
function ModeFields({mode,setMode,busy,maxGuests}:{mode:'hotel'|'whole_home';setMode:(m:'hotel'|'whole_home')=>void;busy:boolean;maxGuests:number|null}){
 return <><label className="field">Property operating model<select name="mode" value={mode} disabled={busy} onChange={e=>setMode(e.target.value as 'hotel'|'whole_home')}><option value="hotel">Hotel — individually bookable rooms</option><option value="whole_home">Whole-home vacation rental</option></select></label>{mode==='whole_home'&&<label className="field">Maximum guests for the entire home<input name="maxGuests" type="number" min="1" max="20" required defaultValue={maxGuests??4} disabled={busy}/></label>}<p>{mode==='whole_home'?'One home is one exclusive booking unit. Add each separate home as its own property. Set rates and open nightly inventory after setup.':'Room types, physical rooms and nightly inventory control the individually bookable rooms.'}</p></>;
}
function SavedRequest({pending,busy,onRetry}:{pending:Command;busy:boolean;onRetry:()=>void}){
 return <section className="pilot-notice"><h3>Confirm saved property request</h3><p>{'p_name' in pending?pending.p_name+' · ':''}{pending.p_mode==='whole_home'?'Whole-home vacation rental · '+pending.p_max_guests+' guests':'Hotel'}</p><button className="primary" disabled={busy} onClick={onRetry}>Retry this exact property request</button></section>;
}
export function PropertyModelPanel(props:Props){return useClientReady()?<ModelForm {...props}/>:<section className="card pilot-settings"><p>Loading property model…</p></section>}
function ModelForm({actor,tenant,property,role,onBusyChange,onSaved}:Props){
 const [data,setData]=useState<OperatingProfile|null>(null),[mode,setMode]=useState<'hotel'|'whole_home'>('hotel'),[readError,setReadError]=useState(''),[notice,setNotice]=useState('');
 const sequence=useRef(0),mounted=useRef(true),manager=['owner','manager'].includes(role);
 const request=usePropertyCommand('iratepilot-pms-pending-model:'+actor+':'+tenant+':'+property,false,onBusyChange);
 async function load(){const version=++sequence.current;try{const result=await hotelRpc<OperatingProfile>('operating_profile',{p_tenant:tenant,p_property:property});if(mounted.current&&sequence.current===version){setReadError('');setData(result);setMode(result.mode)}}catch(e){if(mounted.current&&sequence.current===version){setData(null);setReadError(e instanceof Error?e.message:'Unable to load property model.')}}}
 useEffect(()=>{mounted.current=true;const version=++sequence.current;hotelRpc<OperatingProfile>('operating_profile',{p_tenant:tenant,p_property:property}).then(result=>{if(mounted.current&&sequence.current===version){setReadError('');setData(result);setMode(result.mode)}}).catch(e=>{if(mounted.current&&sequence.current===version){setData(null);setReadError(e instanceof Error?e.message:'Unable to load property model.')}});return()=>{mounted.current=false}},[tenant,property]);
 async function save(command:ModelCommand){await request.run('configure_operating_model',{p_tenant:tenant,p_property:property},command,async result=>{setData(result);setMode(result.mode);setNotice('Property operating model saved.');try{await onSaved()}catch{throw Error('Saved successfully, but the workspace could not refresh. Refresh before another change.')}},()=>{setData(null);void load()})}
 return <section className="card pilot-settings"><div className="section-top"><h2>Property operating model</h2><button className="text-button" disabled={request.busy||!!request.pending} onClick={()=>void load()}>Refresh model</button></div>{(request.error||readError)&&<div className="pilot-error" role="alert">{request.error||readError}</div>}{notice&&<output className="pilot-notice">{notice}</output>}{request.pending?<SavedRequest pending={request.pending} busy={request.busy} onRetry={()=>void save(request.pending as ModelCommand)}/>:!data?<p>Load the property model to continue.</p>:<form key={data.version} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setNotice('');void save({p_request:crypto.randomUUID(),p_expected_version:data.version,p_mode:mode,p_max_guests:mode==='whole_home'?Number(f.get('maxGuests')):null})}}><ModeFields mode={mode} setMode={setMode} busy={request.busy||!manager||request.blocked} maxGuests={data.max_guests}/>{manager&&<><p>Changing the model requires compatible rooms and inventory with no active stays. Disable any enabled whole-home Cleaning fee before switching to hotel. Existing booking history is retained.</p><button className="primary" disabled={request.busy||request.blocked}>Save operating model</button></>}</form>}</section>;
}
export function CreatePropertyPanel(props:{actor:string;tenant:string;onBusyChange:(busy:boolean)=>void;onSaved:(profile:OperatingProfile)=>Promise<void>}){return useClientReady()?<CreateForm {...props}/>:<p>Loading saved property requests…</p>}
function CreateForm({actor,tenant,onBusyChange,onSaved}:{actor:string;tenant:string;onBusyChange:(busy:boolean)=>void;onSaved:(profile:OperatingProfile)=>Promise<void>}){
 const [mode,setMode]=useState<'hotel'|'whole_home'>('whole_home');
 const request=usePropertyCommand('iratepilot-pms-pending-create-property:'+actor+':'+tenant,true,onBusyChange);
 const save=(command:CreateCommand)=>request.run('create_property',{p_tenant:tenant},command,onSaved);
 return <>{request.error&&<div className="pilot-error" role="alert">{request.error}</div>}{request.pending?<SavedRequest pending={request.pending} busy={request.busy} onRetry={()=>void save(request.pending as CreateCommand)}/>:<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({p_request:crypto.randomUUID(),p_name:formText(f,'name').trim(),p_time_zone:formText(f,'timezone').trim(),p_mode:mode,p_max_guests:mode==='whole_home'?Number(f.get('maxGuests')):null})}}><label className="field">Property name<input name="name" required maxLength={200} disabled={request.busy||request.blocked}/></label><label className="field">Property time zone<input name="timezone" required defaultValue="America/Chicago" placeholder="America/Chicago" disabled={request.busy||request.blocked}/></label><ModeFields mode={mode} setMode={setMode} busy={request.busy||request.blocked} maxGuests={4}/><p>The new property belongs to your selected organization. Prices and inventory start unconfigured.</p><button className="primary" disabled={request.busy||request.blocked}>Create property</button></form>}</>;
}
