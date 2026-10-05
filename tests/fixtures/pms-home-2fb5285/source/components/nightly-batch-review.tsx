'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {readAccountingSetup,readPostingPreview,accountingUsd,type AccountingSetup,type PostingPreview,type SourceReconciliation} from '@/lib/accounting';
import {validateNightlyBatch} from '@/lib/nightly-batch-request';
import {NightlyBatchAction} from '@/components/nightly-batch-action';
export function NightlyBatchReview({membership,sources,businessDate,onClose}:{membership:Membership;sources:SourceReconciliation['entries'];businessDate:string;onClose:()=>void}){
 const {tenant_id,property_id,role}=membership,permitted=role==='owner'||role==='manager';
 const [setup,setSetup]=useState<AccountingSetup|null>(null),[period,setPeriod]=useState(''),[date,setDate]=useState(businessDate),[loading,setLoading]=useState(true),[preparing,setPreparing]=useState(false),[error,setError]=useState(''),[review,setReview]=useState<{sources:SourceReconciliation['entries'];period:string;date:string;previews:PostingPreview[]}|null>(null);
 const epoch=useRef(0),alive=useRef(false),mutex=useRef(false),scope=useRef('');scope.current=tenant_id+'/'+property_id;
 const latest=useRef({sources,period,date,role});latest.current={sources,period,date,role};
 useEffect(()=>{let current=true;alive.current=true;epoch.current++;setSetup(null);setReview(null);setPeriod('');setDate(businessDate);setError('');setLoading(permitted);setPreparing(false);mutex.current=false;
  if(permitted)hotelRpc<unknown>('gl_setup',{p_tenant:tenant_id,p_property:property_id}).then(value=>{const parsed=readAccountingSetup(value,tenant_id,property_id);if(current)setSetup(parsed);}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Accounting setup unavailable.');}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;alive.current=false;epoch.current++;};
 },[tenant_id,property_id,permitted,sources,businessDate]);
 function changed(){epoch.current++;setReview(null);setError('');}
 async function prepare(event:React.FormEvent){event.preventDefault();if(mutex.current)return;mutex.current=true;setPreparing(true);setReview(null);setError('');const started=++epoch.current,startedScope=scope.current;
  const current=()=>alive.current&&epoch.current===started&&scope.current===startedScope&&latest.current.sources===sources&&latest.current.period===period&&latest.current.date===date&&(latest.current.role==='owner'||latest.current.role==='manager');
  try{
   if(!permitted||!setup||setup.tenant_id!==tenant_id||setup.property_id!==property_id||!setup.current_mapping)throw Error('Load this property and configure posting mappings first.');
   if(sources.length<1||sources.length>100||sources.some(s=>s.status!=='pending'||s.adjustment_id))throw Error('Select between 1 and 100 pending nightly sources.');
   const selected=setup.periods.find(p=>p.period_id===period&&!p.closed);
   if(!selected||date<selected.start_date||date>=selected.end_date_exclusive||sources.some(s=>s.service_date>date))throw Error('Choose an open period and a posting date on or after every service date.');
   const previews:PostingPreview[]=[];
   for(let start=0;start<sources.length;start+=4){
    if(!current())return;
    const group=await Promise.all(sources.slice(start,start+4).map(async source=>{
     const expected={tenant_id,property_id,reservation_id:source.reservation_id,service_date:source.service_date,mapping_id:setup.current_mapping!.mapping_id,period_id:period,posting_date:date};
     return readPostingPreview(await hotelRpc<unknown>('preview_service_journal',{p_tenant:tenant_id,p_property:property_id,p_reservation:source.reservation_id,p_service_date:source.service_date,p_mapping:expected.mapping_id,p_period:period,p_posting_date:date}),expected);
    }));previews.push(...group);
   }
   if(!current())return;
   validateNightlyBatch({version:1,actor:previews[0].actor_id,tenant:tenant_id,property:property_id,request:crypto.randomUUID(),items:previews.map(preview=>({request_id:crypto.randomUUID(),preview}))});
   setReview({sources,period,date,previews});
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Unable to review this batch.');}
  finally{if(alive.current&&epoch.current===started){mutex.current=false;setPreparing(false);}}
 }
 const visible=permitted&&!loading&&!preparing&&setup?.tenant_id===tenant_id&&setup.property_id===property_id&&review?.sources===sources&&review.period===period&&review.date===date?review.previews:null;
 return <section className="card" aria-label="Nightly batch review" aria-busy={loading||preparing}><h3>Review nightly posting batch</h3><button className="secondary" onClick={onClose}>Back to reconciliation</button>
  <p>{sources.length} selected sources. All entries save together. Posting does not settle payments or close an operating day.</p>
  {loading&&<p role="status">Loading batch accounting setup…</p>}{error&&<p role="alert" className="pilot-error">{error}</p>}
  {permitted&&setup&&<form onSubmit={prepare}><label className="field">Batch accounting period<select disabled={preparing} value={period} onChange={e=>{changed();setPeriod(e.target.value);}}><option value="">Choose an open period</option>{setup.periods.filter(p=>!p.closed).map(p=><option key={p.period_id} value={p.period_id}>{p.start_date} through {p.end_date_exclusive} (end excluded)</option>)}</select></label><label className="field">Batch posting date<input type="date" disabled={preparing} value={date} onChange={e=>{changed();setDate(e.target.value);}}/></label><button className="primary" disabled={loading||preparing}>{preparing?'Preparing batch review…':'Review all selected sources'}</button></form>}
  {visible&&<><p>{visible.length} sources reviewed. Confirm the dates, accounts and amounts below.</p>{visible.map(p=><details key={p.service_date+'/'+p.reservation_id}><summary>{p.service_date} · {p.reservation_id} · {accountingUsd(p.total_minor)}</summary><p>Posting date {p.posting_date} · Mapping version {p.mapping_version}</p><table className="pilot-table"><caption>Proposed batch lines for {p.reservation_id} on {p.service_date}</caption><thead><tr><th>Account</th><th>Component</th><th>Side</th><th>USD</th></tr></thead><tbody>{p.lines.map((line,i)=><tr key={i}><td>{line.account_code} · {line.current_account_name}</td><td>{line.component}</td><td>{line.side}</td><td>{accountingUsd(line.amount_minor)}</td></tr>)}</tbody></table>{!p.lines.length&&<p>No journal lines required for this source.</p>}</details>)}</>}
  <NightlyBatchAction membership={membership} review={visible}/>
 </section>;
}
