'use client';
import {useEffect,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {parseRepairDetail,type RepairDetail} from '@/lib/repair-work-orders';
export function RepairHistory({tenant,property,order}:{tenant:string;property:string;order:string}){
 const [request,setRequest]=useState({after:0,revision:0});
 const [data,setData]=useState<RepairDetail|null>(null),[error,setError]=useState('');
 useEffect(()=>{let current=true;setData(null);setError('');
  hotelRpc<unknown>('repair_detail',{p_tenant:tenant,p_property:property,p_order:order,p_after_version:request.after})
   .then(value=>{const result=parseRepairDetail(value,{tenant,property},order,request.after);if(current)setData(result)})
   .catch(reason=>{if(current)setError(reason instanceof Error?reason.message:'Unable to load repair history.')});
  return()=>{current=false};
 },[tenant,property,order,request]);
 function load(after:number){setData(null);setError('');setRequest(r=>({after,revision:r.revision+1}))}
 return <section aria-label="Repair history">
  <h4>Repair history</h4>
  {error?<><p role="alert">{error}</p><button type="button" className="secondary" onClick={()=>load(0)}>Retry history</button></>:!data?<p role="status">Loading repair history…</p>:<>
   <ol start={request.after+1}>{data.events.map(event=><li key={event.version}><strong>{event.action.charAt(0).toUpperCase()+event.action.slice(1)}</strong><p>{event.reason}</p><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></li>)}</ol>
   {data.has_more&&<button type="button" className="secondary" onClick={()=>load(data.next_after_version!)}>Next history page</button>}
   {request.after>0&&<button type="button" className="secondary" onClick={()=>load(0)}>Back to first history page</button>}
  </>}
 </section>;
}
