'use client';
import {useEffect,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {parseRepairSummary,type RepairSummary as Summary} from '@/lib/repair-work-orders';
type Props={actor:string;tenant:string;property:string;revision?:number};
export function RepairSummary(props:Props){return <Overview key={props.actor+':'+props.tenant+':'+props.property} {...props}/>}
function Overview({tenant,property,revision=0}:Props){
 const [snapshot,setSnapshot]=useState<Summary|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let current=true;setSnapshot(null);setError('');hotelRpc<unknown>('repair_summary',{p_tenant:tenant,p_property:property}).then(raw=>{const value=parseRepairSummary(raw,{tenant,property});if(current)setSnapshot(value)}).catch(e=>{if(current)setError(e instanceof Error?e.message:'Repair overview unavailable.')});return()=>{current=false};},[tenant,property,revision,reload]);
 return <section className="card repair-panel" aria-label="Repair overview"><h2>Repair overview</h2>
 <button className="secondary" type="button" disabled={!snapshot&&!error} onClick={()=>setReload(v=>v+1)}>Refresh repair overview</button>
 {error?<p role="alert">{error}</p>:!snapshot?<p role="status">Loading repair overview…</p>:<>
 <p>All unfinished repairs in this property · {snapshot.business_date} ({snapshot.time_zone})</p>
 <dl>{([['open','Unfinished repairs'],['urgent','Urgent'],['overdue','Overdue'],['unassigned','Unassigned'],['awaiting_verification','Awaiting verification']] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{snapshot.counts[key]}</dd></div>)}</dl>
 <p>Overdue means due before the property’s current date. Counts overlap and exclude completed or cancelled repairs. Queue filters do not change this overview.</p>
 <p>Updated <time dateTime={snapshot.generated_at}>{new Date(snapshot.generated_at).toLocaleString()}</time>. Refresh for current counts.</p>
 </>}
 </section>;
}
