'use client';
import {useEffect,useState} from 'react';
import {hotelRpc} from '@/lib/pilot';
type Cursor={time:string;request:string};
type Entry={request_id:string;actor_id:string;created_at:string;previous_role:string|null;next_role:string|null;reason:string};
type Page={events:Entry[];next:Cursor|null};
function read(value:unknown,tenant:string,property:string,user:string):Page{
 const v=value as Record<string,unknown>;
 if(!v||v.tenant!==tenant||v.property!==property||v.user!==user||!Array.isArray(v.events)||v.events.length>50)throw Error('History does not match this staff member.');
 const ids=new Set<string>();
 for(const e of v.events){if(!e||e.tenant_id!==tenant||e.property_id!==property||e.user_id!==user||typeof e.request_id!=='string'||ids.has(e.request_id)||typeof e.actor_id!=='string'||typeof e.created_at!=='string'||!Number.isFinite(Date.parse(e.created_at))||![null,'staff','manager'].includes(e.previous_role)||![null,'staff','manager'].includes(e.next_role)||e.previous_role===e.next_role||typeof e.reason!=='string'||e.reason.length>500)throw Error('Unable to verify access history.');ids.add(e.request_id)}
 const next=v.next as Cursor|null,last=v.events.at(-1);
 if(next!==null&&(!next||v.events.length!==50||next.time!==last.created_at||next.request!==last.request_id))throw Error('Unable to verify the next history page.');
 return {events:v.events,next};
}
export function PropertyAccessHistory({tenant,property,user,label}:{tenant:string;property:string;user:string;label:string}){
 const [cursor,setCursor]=useState<Cursor|null>(null),[page,setPage]=useState<Page|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let current=true;setPage(null);setError('');hotelRpc('property_access_history',{p_tenant:tenant,p_property:property,p_user:user,p_before_time:cursor?.time??null,p_before_request:cursor?.request??null}).then(value=>{if(current)setPage(read(value,tenant,property,user))}).catch(e=>{if(current)setError(e instanceof Error?e.message:'Unable to load history.')});return()=>{current=false}},[tenant,property,user,cursor,refresh]);
 const role=(value:string|null)=>value===null?'No access':value==='manager'?'Manager':'Staff';
 return <section aria-label={`Access history for ${label}`}><h3>Access history — {label}</h3>{error&&<p className="pilot-error" role="alert">{error}</p>}{!page&&!error&&<p role="status">Loading history…</p>}{page?.events.length===0&&<p>No property-access changes recorded.</p>}{page&&<ol>{page.events.map(e=><li key={e.request_id}><strong>{role(e.previous_role)} → {role(e.next_role)}</strong><p>{e.reason}</p><small><time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time> · Changed by account {e.actor_id}</small></li>)}</ol>}<div className="pilot-actions"><button className="secondary" onClick={()=>{setCursor(null);setRefresh(v=>v+1)}}>Latest history</button>{page?.next&&<button className="secondary" onClick={()=>setCursor(page.next)}>Older changes</button>}</div></section>;
}
