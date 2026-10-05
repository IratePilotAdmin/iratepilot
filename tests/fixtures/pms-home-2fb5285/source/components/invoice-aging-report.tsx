'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,type Membership} from '@/lib/pilot';
import {downloadReport} from '@/lib/report-export';
import {readInvoiceAging} from '@/lib/invoice-aging';
import {loadCompleteInvoiceAging} from '@/lib/invoice-aging-pages';
const money=(v:string)=>{const s=v.padStart(3,'0');return '$'+s.slice(0,-2)+'.'+s.slice(-2);};
const labels={not_due:'Not due',days_1_30:'1–30 days',days_31_60:'31–60 days',days_61_90:'61–90 days',days_91_plus:'91+ days'};
export function InvoiceAgingReport(props:{membership:Membership;businessDate:string}){return <Report key={JSON.stringify(props.membership)} {...props}/>;}
function Report({membership,businessDate}:{membership:Membership;businessDate:string}){
 const [date,setDate]=useState(businessDate),[report,setReport]=useState<ReturnType<typeof readInvoiceAging>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [page,setPage]=useState(0);
 const alive=useRef(false),lock=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function load(exportCsv=false){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setReport(null);
  try{
   const user=await hotelClient().auth.getUser();if(user.error||!user.data.user)throw Error('Sign in to view invoice aging.');if(!alive.current)return;
   const actor=user.data.user.id;
   const verified=await loadCompleteInvoiceAging({tenant:membership.tenant_id,property:membership.property_id,actor,as_of:date},async(offset,snapshot)=>{
    if(!alive.current)throw Error('Report closed.');
    const current=await hotelClient().auth.getUser();if(current.error||current.data.user?.id!==actor)throw Error('Sign-in changed. Reload this report.');
    const page=await hotelRpc<unknown>('invoice_aging_page',{p_tenant:membership.tenant_id,p_property:membership.property_id,p_as_of:date,p_offset:offset,p_snapshot:snapshot});
    const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==actor)throw Error('Sign-in changed. Reload this report.');
    if(!alive.current)throw Error('Report closed.');return page;
   });
   if(!alive.current)return;setReport(verified);setPage(0);
   if(exportCsv)downloadReport('invoice-aging-'+date,[['Invoice aging','As of',date,'Currency','USD'],['Outstanding',money(verified.outstanding_minor)],...Object.entries(verified.totals).map(([bucket,value])=>[labels[bucket as keyof typeof labels],money(value)]),[],['Invoice','Recipient','Issued','Due','Days overdue','Period','Issued USD','Applied USD','Credits USD','Outstanding USD'],...verified.rows.map(row=>[row.number,row.recipient,row.issued_on,row.due_on,row.days_overdue,labels[row.bucket],money(row.issued_minor).slice(1),money(row.allocated_minor).slice(1),money(row.credited_minor).slice(1),money(row.outstanding_minor).slice(1)])]);
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Unable to load invoice aging.');}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <section className="card pilot-reports"><h2>Invoice aging</h2><p>Outstanding issued invoices, after payment allocations and credits effective on the selected date.</p><form onSubmit={e=>{e.preventDefault();void load();}}><label className="field">As of<input type="date" required disabled={busy} value={date} onChange={e=>{setDate(e.target.value);setReport(null);setError('');}}/></label><button className="primary" disabled={busy}>{busy?'Loading…':'Load invoice aging'}</button></form><button disabled={busy||!report} onClick={()=>void load(true)}>Export invoice aging CSV</button>{error&&<p role="alert">{error}</p>}{report&&<><h3>Outstanding as of {report.as_of}: {money(report.outstanding_minor)} USD</h3><dl className="detail-grid">{Object.entries(report.totals).map(([bucket,value])=><div key={bucket}><dt>{labels[bucket as keyof typeof labels]}</dt><dd>{money(value)}</dd></div>)}</dl>{report.rows.length===0?<p>No issued invoices on this date.</p>:<div className="pilot-table-wrap"><table className="pilot-table"><caption>Issued invoice balances · USD</caption><thead><tr>{['Invoice','Recipient','Due','Overdue','Issued','Applied payments','Credits','Outstanding'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{report.rows.slice(page*100,(page+1)*100).map(row=><tr key={row.invoice_id}><td>{row.number}</td><td>{row.recipient}</td><td>{row.due_on}</td><td>{labels[row.bucket]}</td><td>{money(row.issued_minor)}</td><td>{money(row.allocated_minor)}</td><td>{money(row.credited_minor)}</td><td>{money(row.outstanding_minor)}</td></tr>)}</tbody></table><nav aria-label="Invoice aging pages"><button disabled={busy||page===0} onClick={()=>setPage(value=>value-1)}>Previous invoices</button><span role="status">Showing {page*100+1}–{Math.min((page+1)*100,report.rows.length)} of {report.rows.length} invoices</span><button disabled={busy||(page+1)*100>=report.rows.length} onClick={()=>setPage(value=>value+1)}>Next invoices</button></nav></div>}</>}</section>;
}
