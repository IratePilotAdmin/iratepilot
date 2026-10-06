'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
type Props={actor:string;tenant:string;property:string;onCreated:()=>void;group?:{id:string;name:string}};
type Pending={request:string;name:string};
export function CreateBillingAccount(props:Props){return <Form key={[props.actor,props.tenant,props.property,props.group?.id??'company'].join('/')} {...props}/>}
function Form({actor,tenant,property,onCreated,group}:Props){
 const key=group?['irp-create-group-account',actor,tenant,property,group.id].join('/'):['irp-create-company-account',actor,tenant,property].join('/');
 const label=group?'Group':'Company';
 const [initial]=useState(()=>{try{const raw=sessionStorage.getItem(key);if(!raw)return {pending:null,error:''};const p=JSON.parse(raw) as Pending;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!=='name,request'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.request)||typeof p.name!=='string'||!p.name.trim()||p.name!==p.name.trim()||p.name.length>200)throw Error();return {pending:p,error:''}}catch{return {pending:null,error:'Saved account request could not be read. Restore browser storage before creating an account.'}}});
 const [pending,setPending]=useState<Pending|null>(initial.pending),[name,setName]=useState(initial.pending?.name??group?.name??''),[busy,setBusy]=useState(false),[error,setError]=useState(initial.error),[notice,setNotice]=useState('');
 const locked=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function submit(){
  if(locked.current||initial.error||!name.trim())return;
  locked.current=true;setBusy(true);setError('');setNotice('');
  let request=pending;let sent=false;
  try{
   if(!request){request={request:crypto.randomUUID(),name:name.trim()};sessionStorage.setItem(key,JSON.stringify(request));setPending(request)}
   sent=true;
   const result=await hotelRpc<{id:string;name:string;kind:string;group_id:string|null}>('create_billing_account',{p_tenant:tenant,p_property:property,p_request:request.request,p_name:request.name,p_kind:group?'group':'company',p_group:group?.id??null});
   if(!result||typeof result.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result.id)||result.name!==request.name||result.kind!==(group?'group':'company')||result.group_id!==(group?.id??null))throw Error('Unverified result');
   sessionStorage.removeItem(key);setPending(null);setName('');setNotice(label+' account created.');if(alive.current)onCreated();
  }catch{setError(sent?'Account creation could not be confirmed. Retry the saved request to check or finish it without creating a duplicate.':'The request could not be saved in browser storage. No account request was sent. Enable storage and try again.')}
  finally{locked.current=false;setBusy(false)}
 }
 return <section className="card" aria-label={'Create '+label.toLowerCase()+' account'}><div className="section-top"><h2>New {label.toLowerCase()} account</h2></div>
  <form style={{padding:24}} onSubmit={event=>{event.preventDefault();void submit()}}>
   <label className="field">{label} name<input required maxLength={200} value={name} disabled={busy||!!pending||!!initial.error} onChange={event=>setName(event.target.value)}/></label>
   <p>Creates a billing account. Charges and payments are added separately.</p>
   {pending&&<p>A saved request is retained. Retry uses the same account name and request.</p>}
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   <button className="primary" disabled={busy||!!initial.error||!name.trim()}>{busy?'Saving…':pending?'Retry saved account request':'Create '+label.toLowerCase()+' account'}</button>
  </form></section>;
}
