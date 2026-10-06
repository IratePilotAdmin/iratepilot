'use client';
import {AccountingPostingReview} from '@/components/accounting-posting-review';
import {NightlyBatchReview} from '@/components/nightly-batch-review';
import {useEffect,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {accountingUsd,readSourceReconciliation,type SourceReconciliation} from '@/lib/accounting';
type Source=SourceReconciliation['entries'][number];
const sourceKey=(entry:Source)=>entry.service_date+'/'+entry.reservation_id;
export function AccountingReconciliation({membership,start,end,corrections=false,businessDate}:{membership:Membership;start:string;end:string;corrections?:boolean;businessDate?:string}){
 const [selected,setSelected]=useState<Source|null>(null),[picked,setPicked]=useState<string[]>([]),[batch,setBatch]=useState<Source[]|null>(null);
 const {tenant_id,property_id,role}=membership;const [data,setData]=useState<SourceReconciliation|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[page,setPage]=useState(0);
 useEffect(()=>{let current=true;setSelected(null);setPicked([]);setBatch(null);setData(null);setError('');setPage(0);if(role!=='owner'&&role!=='manager'){setLoading(false);return;}setLoading(true);
  hotelRpc<unknown>(corrections?'forward_journal_reconciliation':'service_journal_reconciliation',{p_tenant:tenant_id,p_property:property_id,p_start:start,p_end:end}).then(value=>{const parsed=readSourceReconciliation(value,{tenant_id,property_id,start,end},corrections);if(current)setData(parsed);}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to load reconciliation.');}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};
 },[tenant_id,property_id,role,start,end,corrections,revision]);
 if(role!=='owner'&&role!=='manager')return <p>Reconciliation is available to owners and managers.</p>;
 const visible=!loading&&!error&&data?.tenant_id===tenant_id&&data.property_id===property_id&&data.start_date===start&&data.end_date_exclusive===end&&data.basis===(corrections?'saved_service_forward_entries':'saved_service_day_entries')?data:null;
 const batchEnabled=!corrections&&!!businessDate;
 function closeReview(){setSelected(null);setBatch(null);setPicked([]);setRevision(n=>n+1);}
 if(visible&&selected&&visible.entries.includes(selected))return <AccountingPostingReview key={property_id+'/'+(selected.adjustment_id??selected.reservation_id)+'/'+selected.service_date} membership={membership} source={selected} onClose={closeReview}/>;
 if(visible&&batchEnabled&&batch&&businessDate&&batch.every(source=>visible.entries.includes(source)))return <NightlyBatchReview key={tenant_id+'/'+property_id+'/'+revision} membership={membership} sources={batch} businessDate={businessDate} onClose={closeReview}/>;
 const entries=visible?.entries.slice(page*100,(page+1)*100)??[];
 function toggle(source:Source,checked:boolean){const key=sourceKey(source);setPicked(previous=>checked?previous.includes(key)||previous.length>=100?previous:[...previous,key]:previous.filter(value=>value!==key));}
 function reviewBatch(){if(!visible||!batchEnabled)return;const sources=visible.entries.filter(source=>source.status==='pending'&&picked.includes(sourceKey(source)));if(sources.length>0&&sources.length<=100)setBatch(sources);}
 return <section aria-busy={loading}><h2>{corrections?'Correction reconciliation':'Nightly source reconciliation'}</h2><p>Saved source entries for {start} through {end} (end excluded). Posting status does not represent payment settlement.</p><button className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh reconciliation</button>
  {loading&&<p role="status">Loading reconciliation…</p>}{error&&<p role="alert" className="pilot-error">{error}</p>}
  {visible&&<><p>{visible.pending_count} pending · {visible.posted_count} posted · {visible.processed_empty_count??visible.processed_zero_count} processed without journal lines</p>
   {batchEnabled&&<div className="pilot-actions"><button className="secondary" disabled={!entries.some(source=>source.status==='pending')} onClick={()=>setPicked(entries.filter(source=>source.status==='pending').map(sourceKey))}>Select pending sources on this page</button><button className="secondary" disabled={!picked.length} onClick={()=>setPicked([])}>Clear batch selection</button><button className="primary" disabled={!picked.length} onClick={reviewBatch}>Review selected nightly batch ({picked.length}/100)</button></div>}
   <nav aria-label="Reconciliation pages"><button disabled={!page} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil(visible.entries.length/100))}</span><button disabled={(page+1)*100>=visible.entries.length} onClick={()=>setPage(n=>n+1)}>Next</button></nav>
   <div className="pilot-table-wrap"><table className="pilot-table"><caption>Source posting status</caption><thead><tr>{[...(batchEnabled?['Batch']:[]),'Service date','Reservation','Amount USD','Status','Posting date','Journal','Review'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{entries.map(e=><tr key={e.adjustment_id??sourceKey(e)}>
    {batchEnabled&&<td>{e.status==='pending'?<input type="checkbox" aria-label={'Include '+e.reservation_id+' on '+e.service_date+' in nightly batch'} checked={picked.includes(sourceKey(e))} disabled={!picked.includes(sourceKey(e))&&picked.length>=100} onChange={event=>toggle(e,event.target.checked)}/>:<span>—</span>}</td>}
    <td>{e.service_date}</td><td>{e.reservation_id}</td><td>{e.source_total_minor.startsWith('-')?'-'+accountingUsd(e.source_total_minor.slice(1)):accountingUsd(e.source_total_minor)}</td><td>{e.status==='pending'?'Pending':e.status==='posted'?'Posted':'Processed · no journal lines'}</td><td>{e.posting_date??'—'}</td><td>{e.journal_id??'—'}</td><td>{e.status==='pending'&&<button className="text-button" onClick={()=>setSelected(e)}>Review posting</button>}</td>
   </tr>)}</tbody></table>{!visible.entries.length&&<p>No saved sources in this period.</p>}</div>
  </>}
 </section>;
}
