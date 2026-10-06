'use client';
import {useEffect,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {BillingWorkspace} from './billing-workspace';
import {CreateBillingAccount} from './create-billing-account';
type Props={actor:string;tenant:string;property:string;group:{id:string;name:string}};
type Lookup={tenant_id:string;property_id:string;group_id:string;group_name:string;account:null|{id:string;name:string;kind:string;group_id:string}};
export function GroupBillingAccount(props:Props){return <LookupAccount key={[props.actor,props.tenant,props.property,props.group.id].join('/')} {...props}/>}
function LookupAccount({actor,tenant,property,group}:Props){
 const [opened,setOpened]=useState(false);
 const [revision,setRevision]=useState(0),[result,setResult]=useState<Lookup|null>(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setOpened(false);setResult(null);setError('');void hotelRpc<Lookup>('group_billing_account',{p_tenant:tenant,p_property:property,p_group:group.id}).then(value=>{
  if(!value||value.tenant_id!==tenant||value.property_id!==property||value.group_id!==group.id||typeof value.group_name!=='string'||!value.group_name.trim())throw Error();
  if(value.account!==null&&(!value.account||typeof value.account.id!=='string'||!value.account.id||typeof value.account.name!=='string'||!value.account.name.trim()||value.account.kind!=='group'||value.account.group_id!==group.id))throw Error();
  if(alive)setResult(value);
 }).catch(()=>{if(alive)setError('Group billing account could not be verified. Refresh before creating an account.')});return()=>{alive=false}},[tenant,property,group.id,revision]);
 return <section aria-label="Group billing account">
  <button className="secondary" onClick={()=>setRevision(n=>n+1)}>Refresh group billing</button>
  {error?<p role="alert">{error}</p>:!result?<p role="status">Checking group billing…</p>:result.account?<><h4>{result.account.name}</h4><p>This group has a billing account. Review its invoices and recorded payments.</p><button className="secondary" onClick={()=>setOpened(value=>!value)}>{opened?'Close group billing':'Open billing account'}</button>{opened&&<BillingWorkspace tenant={tenant} property={property} initialAccount={result.account.id}/>}</>:<CreateBillingAccount actor={actor} tenant={tenant} property={property} group={{id:group.id,name:result.group_name}} onCreated={()=>setRevision(n=>n+1)}/>}
 </section>;
}
