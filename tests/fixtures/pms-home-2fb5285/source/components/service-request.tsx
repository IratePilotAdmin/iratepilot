'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {definitiveBookingRejection} from '@/lib/pending-booking';
import {validServiceCommand,type ServiceCommand} from '@/lib/service-days';
export function useServiceRequest(key:string,tenant:string,property:string,onBusyChange:(busy:boolean)=>void){
 const [restored]=useState(()=>{try{const raw=sessionStorage.getItem(key);if(raw===null)return {pending:null,error:''};const value:unknown=JSON.parse(raw);if(!validServiceCommand(value))throw Error();return {pending:value,error:''}}catch{return {pending:null,error:'The saved service-day request cannot be read. Reconcile this property before preparing another request.'}}});
 const [pending,setPending]=useState<ServiceCommand|null>(restored.pending),[busy,setBusy]=useState(false),[error,setError]=useState(restored.error);const lock=useRef(false),alive=useRef(true),callback=useRef(onBusyChange);
 useEffect(()=>{callback.current=onBusyChange},[onBusyChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(lock.current)callback.current(false)}},[]);
 async function run<T>(command:ServiceCommand,onSaved:(result:T)=>Promise<void>,onRejected:()=>void){
  if(lock.current||restored.error)return;lock.current=true;setBusy(true);callback.current(true);setError('');
  try{if(!validServiceCommand(command))throw Error('Review all required values before saving.');sessionStorage.setItem(key,JSON.stringify(command));setPending(command);let result:T;
   try{result=await hotelRpc<T>(command.rpc,{p_tenant:tenant,p_property:property,...command.params})}catch(e){if(definitiveBookingRejection(e)){if(alive.current){sessionStorage.removeItem(key);setPending(null);onRejected()}throw e}throw Error('The result is uncertain. Retry the preserved request to confirm it. No new request has been created.')}
   if(!alive.current)return;sessionStorage.removeItem(key);setPending(null);await onSaved(result);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to save service-day request.')}finally{lock.current=false;if(alive.current){setBusy(false);callback.current(false)}}
 }
 return {pending,busy,error,blocked:!!restored.error,run};
}
export function PendingServiceRequest({command,busy,onRetry}:{command:ServiceCommand;busy:boolean;onRetry:()=>void}){return <div className="pilot-notice"><h3>Confirm saved request</h3><p>{command.label}</p><button className="primary" disabled={busy} onClick={onRetry}>Retry this exact service request</button></div>}
