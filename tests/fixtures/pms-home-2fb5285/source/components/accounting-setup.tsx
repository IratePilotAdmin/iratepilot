'use client';
import {AccountingMappingEditor} from '@/components/accounting-mapping-editor';
import {AccountingSetupForm} from '@/components/accounting-setup-form';
import {AccountingPeriodReview} from '@/components/accounting-period-review';
import {useEffect,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {readAccountingSetup,type AccountingSetup} from '@/lib/accounting';
export function AccountingSetupView({membership}:{membership:Membership}){
 const {tenant_id,property_id,role}=membership;
 const [selectedPeriod,setSelectedPeriod]=useState('');
 const [data,setData]=useState<AccountingSetup|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{let current=true;setSelectedPeriod('');setData(null);setError('');if(role!=='owner'&&role!=='manager'){setLoading(false);return;}setLoading(true);hotelRpc<unknown>('gl_setup',{p_tenant:tenant_id,p_property:property_id}).then(value=>{const parsed=readAccountingSetup(value,tenant_id,property_id);if(current)setData(parsed);}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to load accounting setup.');}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[tenant_id,property_id,role,revision]);
 if(role!=='owner'&&role!=='manager')return <p>Accounting setup is available to owners and managers.</p>;
 const visible=data?.tenant_id===tenant_id&&data.property_id===property_id?data:null;
 return <section className="card pilot-reports" aria-busy={loading}><div className="section-top"><h2>Accounting setup</h2><button className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh setup</button></div>{loading&&<p role="status">Loading accounting setup…</p>}{error&&<p className="pilot-error" role="alert">{error}</p>}{visible&&<>
 <div className="pilot-table-wrap"><table className="pilot-table"><caption>Chart of accounts</caption><thead><tr><th scope="col">Code</th><th scope="col">Account</th><th scope="col">Type</th><th scope="col">Status</th></tr></thead><tbody>{visible.accounts.map(a=><tr key={a.account_id}><th scope="row">{a.code}</th><td>{a.name}</td><td>{a.kind}</td><td>{a.active?'Active':'Inactive'}</td></tr>)}</tbody></table>{!visible.accounts.length&&<p>No accounts configured.</p>}</div>
 <h3>Accounting periods</h3>{visible.periods.map(p=><p key={p.period_id}>{p.start_date} through {p.end_date_exclusive} (end excluded) · {p.closed?'Closed':'Open'} <button className="secondary" onClick={()=>setSelectedPeriod(p.period_id)}>Review period {p.start_date}</button></p>)}{!visible.periods.length&&<p>No periods configured.</p>}
 {selectedPeriod&&visible.periods.some(p=>p.period_id===selectedPeriod)&&<AccountingPeriodReview key={tenant_id+'/'+property_id+'/'+selectedPeriod} membership={membership} period={selectedPeriod}/>}
 <AccountingSetupForm key={tenant_id+'/'+property_id+'/'+revision} membership={membership}/><h3>Posting mappings</h3>{visible.current_mapping?<><p>Version {visible.current_mapping.version}</p><dl>{Object.entries(visible.current_mapping.components).map(([component,id])=>{const account=visible.accounts.find(a=>a.account_id===id)!;return <div className="pilot-list-row" key={component}><dt>{component.replaceAll('_',' ').replace(':',': ')}</dt><dd>{account.code} · {account.name}{!account.active?' · Inactive':''}</dd></div>;})}</dl></>:<p>No posting mappings configured.</p>}
 <AccountingMappingEditor key={'mapping/'+tenant_id+'/'+property_id+'/'+revision} membership={membership} setup={visible}/></>}</section>;
}
