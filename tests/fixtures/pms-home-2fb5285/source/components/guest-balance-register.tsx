'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import {readBalanceRegister,validateBalanceFilter,balanceDecimal,balanceRegisterRows,balanceCollectionReview,type BalanceFilter,type BalanceReport} from '@/lib/guest-balance-register';
import {downloadReport} from '@/lib/report-export';
import {ReportCsvCopy} from '@/components/report-csv-copy';
export function GuestBalanceRegister({membership,businessDate}:{membership:Membership;businessDate:string}){
 const {tenant_id,property_id,role}=membership,permitted=role==='owner'||role==='manager';
 const [status,setStatus]=useState<BalanceFilter['status']>('all'),[field,setField]=useState<BalanceFilter['field']>('all'),[start,setStart]=useState(businessDate.slice(0,8)+'01'),[end,setEnd]=useState(businessDate),[data,setData]=useState<BalanceReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(0);
 const generation=useRef(0),alive=useRef(false),mutex=useRef(false),currentScope=useRef(''),currentRole=useRef(role);currentScope.current=tenant_id+'/'+property_id;currentRole.current=role;
 useEffect(()=>{alive.current=true;generation.current++;mutex.current=false;setData(null);setError('');setBusy(false);setPage(0);return()=>{alive.current=false;generation.current++;};},[tenant_id,property_id,role]);
 function changed(){setData(null);setError('');setPage(0);}
 async function load(event:React.FormEvent){event.preventDefault();if(mutex.current||!permitted)return;mutex.current=true;setBusy(true);setData(null);setError('');setPage(0);const token=generation.current,scope=currentScope.current;
  const current=()=>alive.current&&generation.current===token&&currentScope.current===scope&&(currentRole.current==='owner'||currentRole.current==='manager');
  try{
   const dated=field==='arrival'||field==='departure',filter:BalanceFilter={status,field,start:dated?start:null,end:dated?end:null};validateBalanceFilter(filter);
   const identity=await hotelClient().auth.getUser();if(identity.error||!identity.data.user)throw Error('Verify sign-in before loading balances.');if(!current())return;const actor=identity.data.user.id;
   const value=await hotelRpc<unknown>('guest_balance_register',{p_tenant:tenant_id,p_property:property_id,p_status:status,p_date_field:field,p_start:filter.start,p_end:filter.end});if(!current())return;
   const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reopen the report.');if(!current())return;
   setData(readBalanceRegister(value,{actor,tenant:tenant_id,property:property_id},filter));
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Unable to load current balances.');}
  finally{if(current()){mutex.current=false;setBusy(false);}}
 }
 const visible=permitted&&!busy&&data?.tenant_id===tenant_id&&data.property_id===property_id&&data.status_filter===status&&data.date_filter.field===field&&((field==='all'||field==='undated')||(data.date_filter.start===start&&data.date_filter.end_exclusive===end))?data:null;
 function exportCsv(){if(!visible)return;try{downloadReport('guest-balances-'+property_id+'-'+visible.business_date,balanceRegisterRows(visible));}catch(cause){setError(cause instanceof Error?cause.message:'Unable to export balances.');}}
 if(!permitted)return <p>Guest balance reports are available to owners and managers.</p>;
 return <section className="card pilot-reports" aria-label="Guest balance register" aria-busy={busy}><h2>Current guest balances</h2><p>Includes stays without scheduled follow-up. These are current balances, not historical balances, invoice aging or the general ledger. Recorded payments do not verify settlement. Security deposits are separate.</p>
  <form className="pilot-report-filters" onSubmit={load}><label className="field">Reservation status<select disabled={busy} value={status} onChange={e=>{changed();setStatus(e.target.value as BalanceFilter['status']);}}>{['all','Confirmed','In house','Checked out','Cancelled'].map(value=><option key={value} value={value}>{value==='all'?'All statuses':value}</option>)}</select></label><label className="field">Stay date selection<select disabled={busy} value={field} onChange={e=>{changed();setField(e.target.value as BalanceFilter['field']);}}><option value="all">All stay dates</option><option value="arrival">Scheduled arrival</option><option value="departure">Scheduled departure</option><option value="undated">Missing arrival or departure</option></select></label>
   {(field==='arrival'||field==='departure')&&<><label className="field">From<input type="date" required disabled={busy} value={start} onChange={e=>{changed();setStart(e.target.value);}}/></label><label className="field">Until (exclusive)<input type="date" required disabled={busy} value={end} onChange={e=>{changed();setEnd(e.target.value);}}/></label></>}
   <button className="primary" disabled={busy}>{busy?'Loading balances…':'Load guest balances'}</button>
  </form><p>Each report supports up to 1,000 stays and 10,000 folio entries. Use status and stay dates to narrow larger selections. Oversized reports are rejected without partial totals.</p>
  {error&&<p role="alert" className="pilot-error">{error}</p>}
  {visible&&<><p>{visible.property.name} · Generated {visible.generated_at} · {visible.rows.length} stays</p>{visible.summary.unknown_count>0&&<p role="status">{visible.summary.unknown_count} stays have unknown amounts and are excluded from money totals.</p>}{visible.summary.unfrozen_count>0&&<p>{visible.summary.unfrozen_count} stays have no frozen folio opening. Known amounts for these stays use current booked value.</p>}
   <div className="pilot-report-totals"><div>Known positive balances <strong>${balanceDecimal(visible.summary.known_positive_balances_minor)}</strong></div><div>Known credits <strong>${balanceDecimal(visible.summary.known_credit_balances_minor)}</strong></div><div>Known net balance <strong>${balanceDecimal(visible.summary.known_net_balance_minor)}</strong></div></div>
   <button className="secondary" onClick={exportCsv}>Export guest balances CSV</button><ReportCsvCopy rows={()=>balanceRegisterRows(visible)}/>
   <nav aria-label="Balance report pages"><button disabled={!page} onClick={()=>setPage(n=>n-1)}>Previous page</button><span>Page {page+1} of {Math.max(1,Math.ceil(visible.rows.length/100))}</span><button disabled={(page+1)*100>=visible.rows.length} onClick={()=>setPage(n=>n+1)}>Next page</button></nav>
   <div className="pilot-table-wrap"><table className="pilot-table"><caption>Current guest balance rows</caption><thead><tr>{['Reference','Status','Arrival','Departure','Opening basis','Charges USD','Recorded paid USD','Balance USD','Review'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.rows.slice(page*100,(page+1)*100).map(row=><tr key={row.reservation_id}><td>{row.reference}<small>{row.reservation_id}</small></td><td>{row.cancellation_disposition==='no_show'?'No show':row.status}</td><td>{row.arrival??'—'}</td><td>{row.departure??'—'}</td><td>{row.opening_mode==='frozen'?'Frozen folio':row.opening_mode==='reservation_preview'?'Current booked value':'Unavailable'}</td>{[row.charges_minor,row.recorded_paid_minor,row.balance_minor].map((amount,i)=><td key={i}>{amount===null?'Unknown':balanceDecimal(amount)}</td>)}<td>{balanceCollectionReview(row)||'—'}</td></tr>)}</tbody></table></div>{!visible.rows.length&&<p>No stays match this selection.</p>}
  </>}
 </section>;
}
