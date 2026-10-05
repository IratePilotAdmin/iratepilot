'use client';
import {useEffect, useRef, useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {RepairHistory} from '@/components/repair-history';
import {RepairActions} from '@/components/repair-actions';
import {parseRepairQueue, repairStates, type RepairQueue as Queue, type RepairState,type RepairOrder,type RepairAttention} from '@/lib/repair-work-orders';

const labels: Record<RepairState, string> = {reported:'Reported', assigned:'Assigned', in_progress:'In progress', awaiting_verification:'Awaiting verification', completed:'Completed', cancelled:'Cancelled'};
export function RepairQueue({actor, tenant, property,onChanged}: {actor: string; tenant: string; property: string;onChanged?:()=>void}) {
  // A property switch discards all previously displayed rows before its first render.
  return <PropertyRepairQueue key={actor+':'+tenant+':'+property} actor={actor} tenant={tenant} property={property} onChanged={onChanged}/>;
}
function PropertyRepairQueue({actor,tenant, property,onChanged}: {actor:string;tenant: string; property: string;onChanged?:()=>void}) {
  const [filter, setFilter] = useState<RepairState | ''>('');
  const [priority,setPriority]=useState<RepairOrder['priority']|''>(''),[mine,setMine]=useState(false);
  const [attention,setAttention]=useState<RepairAttention|''>('');
  const [history,setHistory]=useState<string|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [page, setPage] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [request, setRequest] = useState<{after:string|null; revision:number}>({after:null, revision:0});
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setPage(null); setLoading(true); setError('');
    hotelRpc<unknown>('repair_queue', {p_tenant:tenant, p_property:property, p_after:request.after, p_state:filter || null, p_limit:50,p_priority:priority||null,p_assignee:mine?actor:null,p_attention:attention||null})
      .then(value => {
        const result = parseRepairQueue(value, {tenant,property}, {after:request.after,state:filter || null,limit:50,priority:priority||null,assignee:mine?actor:null,attention:attention||null});
        if (current === generation.current) setPage(result);
      })
      .catch(reason => {if (current === generation.current) setError(reason instanceof Error ? reason.message : 'Unable to load repairs. Please try again.');})
      .finally(() => {if (current === generation.current) setLoading(false);});
    return () => {++generation.current;};
  }, [actor,tenant,property,filter,priority,mine,attention,request]);
  function firstPage() {setPage(null);setLoading(true);setRequest(r=>({after:null,revision:r.revision+1}));}
  return <section className="card repair-panel" aria-label="Repair work orders" aria-busy={loading}>
    <h2>Repair work orders</h2>
    <p>Track reported problems separately from room closures and housekeeping readiness.</p>
    <RepairActions actor={actor} tenant={tenant} property={property} order={selected} onSaved={()=>{firstPage();onChanged?.();}}/>
    <label>Work to review <select value={attention} onChange={e=>{setAttention(e.target.value as RepairAttention|'');firstPage()}}><option value="">All work</option><option value="unfinished">Unfinished</option><option value="overdue">Overdue</option><option value="unassigned">Unassigned</option></select></label>
    {attention&&<p>This view excludes completed and cancelled repairs. Overdue means due before the property’s current date. All selected filters apply together.</p>}
    <label>Repair status <select value={filter} onChange={event=>{setFilter(event.target.value as RepairState | '');firstPage();}}>
      <option value="">All statuses</option>{repairStates.map(state=><option key={state} value={state}>{labels[state]}</option>)}
    </select></label>
    <label>Repair priority <select value={priority} onChange={e=>{setPriority(e.target.value as RepairOrder['priority']|'');firstPage()}}><option value="">All priorities</option>{['low','normal','high','urgent'].map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}</select></label>
    <label>Assigned work <select value={mine?'mine':'all'} onChange={e=>{setMine(e.target.value==='mine');firstPage()}}><option value="all">All staff</option><option value="mine">Assigned to me</option></select></label>
    <button type="button" className="secondary" disabled={loading} onClick={firstPage}>Refresh repairs</button>
    {loading && <p role="status">Loading repairs…</p>}
    {error && <><p role="alert">{error}</p><button type="button" className="secondary" disabled={loading} onClick={()=>{setPage(null);setLoading(true);setError('');setRequest(r=>({...r,revision:r.revision+1}));}}>Retry loading repairs</button></>}
    {!loading && !error && page && <>
      {page.orders.length === 0 ? <p>No repairs match this view.</p> : <ul>{page.orders.map(order=><li key={order.id}>
        <h3>{order.location}</h3><p>{order.description}</p>
        <button type="button" className="secondary" onClick={()=>setSelected(order.id)}>Update repair</button>
        <p>{labels[order.state]} · {order.priority.charAt(0).toUpperCase()+order.priority.slice(1)} priority{order.due_on ? ' · Due '+order.due_on : ''}</p>
        <button type="button" className="secondary" aria-expanded={history===order.id} onClick={()=>setHistory(history===order.id?null:order.id)}>{history===order.id?'Hide history':'View history'}</button>
        {history===order.id&&<RepairHistory key={order.id} tenant={tenant} property={property} order={order.id}/>}
      </li>)}</ul>}
      {request.after && <button type="button" className="secondary" onClick={firstPage}>Back to first page</button>}
      {page.has_more && <button type="button" className="secondary" onClick={()=>{setPage(null);setLoading(true);setRequest(r=>({after:page.next_after,revision:r.revision+1}));}}>Next repairs</button>}
    </>}
  </section>;
}
