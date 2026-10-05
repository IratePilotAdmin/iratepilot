'use client';
import {PaymentTransferForm} from './payment-transfer-form';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import {readAccountingSetup,type AccountingSetup} from '@/lib/accounting';
import {readPaymentSources,type PaymentSources} from '@/lib/payment-accounting';
import {afterDays} from '@/lib/rates';
import {PaymentActivityExport} from '@/components/payment-activity-export';
import {PaymentAccountingForm} from '@/components/payment-accounting-form';
import {PaymentAccountingAction} from '@/components/payment-accounting-action';
export function PaymentAccountingWorkspace(props:{membership:Membership;businessDate:string}){return <Workspace key={props.membership.tenant_id+'/'+props.membership.property_id+'/'+props.membership.role} {...props}/>;}
function Workspace({membership,businessDate}:{membership:Membership;businessDate:string}){
 const [start,setStart]=useState(businessDate),[end,setEnd]=useState(afterDays(businessDate,1)),[loaded,setLoaded]=useState<{setup:AccountingSetup;sources:PaymentSources;revision:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(false),lock=useRef(false),revision=useRef(0);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const allowed=['owner','manager'].includes(membership.role);
 async function load(event:React.FormEvent){event.preventDefault();if(lock.current||!allowed)return;lock.current=true;setBusy(true);setLoaded(null);setError('');
  try{const span=Date.parse(end)-Date.parse(start);if(!Number.isFinite(span)||span<86400000||span>31*86400000)throw Error('Choose 1 to 31 recorded payment dates.');const user=await hotelClient().auth.getUser();if(user.error||!user.data.user)throw Error('Verify sign-in before loading payment records.');
   const [setup,sources]=await Promise.all([hotelRpc<unknown>('gl_setup',{p_tenant:membership.tenant_id,p_property:membership.property_id}),hotelRpc<unknown>('payment_journal_sources',{p_tenant:membership.tenant_id,p_property:membership.property_id,p_start:start,p_end:end})]);
   const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==user.data.user.id)throw Error('Sign-in changed. Reload payment records.');if(!alive.current)return;
   setLoaded({setup:readAccountingSetup(setup,membership.tenant_id,membership.property_id),sources:readPaymentSources(sources,{actor:user.data.user.id,tenant:membership.tenant_id,property:membership.property_id},start,end),revision:++revision.current});
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Unable to load payment accounting.');}finally{if(alive.current){lock.current=false;setBusy(false);}}
 }
 return <section className="card pilot-reports"><h2>Payment accounting</h2>{allowed&&<form onSubmit={load}><label className="field">Recorded from<input type="date" disabled={busy} value={start} onChange={e=>{setLoaded(null);setStart(e.target.value)}}/></label><label className="field">Recorded until (exclusive)<input type="date" disabled={busy} value={end} onChange={e=>{setLoaded(null);setEnd(e.target.value)}}/></label><button className="primary" disabled={busy}>{busy?'Loading payment records...':'Load payment accounting'}</button></form>}<p>Dates select when payments were recorded in the property's time zone. Each complete selection supports up to 500 payment records.</p>{error&&<p role="alert" className="pilot-error">{error}</p>}{loaded?<><PaymentTransferForm key={'transfer/'+loaded.revision} membership={membership} setup={loaded.setup} sources={loaded.sources} businessDate={businessDate}/><PaymentActivityExport key={'export/'+loaded.revision} sources={loaded.sources}/><PaymentAccountingForm key={loaded.revision} membership={membership} setup={loaded.setup} sources={loaded.sources} businessDate={businessDate}/></>:<PaymentAccountingAction membership={membership} preview={null}/>}</section>;
}

