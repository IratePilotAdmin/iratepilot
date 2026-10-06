'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
import {pickupEvidencePage,type PickupFact} from '@/lib/pickup-evidence';
import {pickupMoney} from '@/lib/pickup-money';
export function PickupEvidence({tenant,property,capture,roomType,day,currency,label,roomTypeName,capturedAt}:{tenant:string;property:string;capture:string;roomType:string;day:string;currency:string;label?:string;roomTypeName?:string;capturedAt?:string}){
 const [facts,setFacts]=useState<PickupFact[]>([]),[next,setNext]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),running=useRef(false);
 useEffect(()=>()=>{generation.current++;},[]);
 async function load(older=false){
  if(running.current)return;running.current=true;const id=++generation.current;setBusy(true);setError('');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const data=await Promise.race([hotelRpc('pickup_evidence',{p_tenant:tenant,p_property:property,p_capture:capture,p_room_type:roomType,p_day:day,p_after:older?next:null,p_limit:50}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Loading took too long. Try again.')),15000)})]);
   if(id!==generation.current)return;
   const page=pickupEvidencePage(data,{tenant,property,capture,roomType,day},older?next:null);
   setFacts(previous=>older?[...previous,...page.facts]:page.facts);setNext(page.next);setLoaded(true);
  }catch(e){if(id===generation.current){setFacts([]);setNext(null);setLoaded(false);setError(e instanceof Error?e.message:'Evidence could not load.');}}
  finally{clearTimeout(timer);if(id===generation.current){generation.current++;running.current=false;setBusy(false);}}
 }
 return <section aria-label="Saved reservation evidence"><h3>{label??"Saved capture"} - {roomTypeName??"Room type"} - stay night {day}</h3>{capturedAt&&<p>Captured at {capturedAt}</p>}<p>Historical reservation references and room charges at capture time. Later reservation changes are not shown here.</p><button className="secondary" disabled={busy} onClick={()=>void load()}>{busy?'Loading evidence…':'Load reservation evidence'}</button>{error&&<p role="alert" className="pilot-error">{error}</p>}{loaded&&<><p role="status">{facts.length} reservation records loaded. Snapshot totals reconciled by the server.</p><div className="pilot-table-wrap"><table className="pilot-table"><thead><tr><th>Reservation reference</th><th>Saved revision</th><th>Room charge</th></tr></thead><tbody>{facts.map(f=><tr key={f.reservation_id}><td>{f.reservation_id}</td><td>{f.source_version}</td><td>{pickupMoney(f.room_revenue_minor,currency)}</td></tr>)}</tbody></table></div>{next&&<button className="secondary" disabled={busy} onClick={()=>void load(true)}>Load more reservations</button>}</>}</section>;
}
