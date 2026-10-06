'use client';
import {useEffect,useRef,useState} from 'react';
import {lostFoundRpc} from '@/lib/lost-found-request';
type Move={tenant_id:string;property_id:string;item_id:string;revision:number;from_location:string;to_location:string;reason:string;moved_at:string;moved_by:string};
type Page={tenant_id:string;property_id:string;item_id:string;moves:Move[];next:number|null};
export function LostFoundHistory({tenant,property,item,actor}:{tenant:string;property:string;item:string;actor:string}){
 const [moves,setMoves]=useState<Move[]>([]),[next,setNext]=useState<number|null>(null),[open,setOpen]=useState(false),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),locked=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function load(before:number|null=null){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');
  try{
   const page=await lostFoundRpc<Page>('found_item_moves',{p_tenant:tenant,p_property:property,p_item:item,p_before_revision:before});
   if(page?.tenant_id!==tenant||page.property_id!==property||page.item_id!==item||!Array.isArray(page.moves)||page.moves.some(m=>m.tenant_id!==tenant||m.property_id!==property||m.item_id!==item||!Number.isSafeInteger(m.revision)||m.revision<1))throw Error('Movement history could not be verified.');
   if(alive.current){setMoves(old=>before?[...old,...page.moves.filter(m=>!old.some(o=>o.revision===m.revision))]:page.moves);setNext(page.next);setLoaded(true)}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Movement history could not load.')}
  finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 return <section aria-label="Storage movement history"><button className="secondary" aria-expanded={open} onClick={()=>{setOpen(v=>!v);if(!open&&!loaded)void load()}}>{open?'Hide storage history':'View storage history'}</button>
 {open&&<div>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading storage history…</p>}
 {loaded&&!moves.length&&<p>No storage moves recorded.</p>}
 <ol>{moves.map(m=><li key={m.revision}><p><strong>{m.from_location} → {m.to_location}</strong></p><p>{m.reason} · {new Date(m.moved_at).toLocaleString()}</p><details><summary>Recorded by {m.moved_by===actor?'you':'staff'}</summary><p>Staff reference: {m.moved_by}</p><p>Move {m.revision}</p></details></li>)}</ol>
 {error&&<button className="secondary" disabled={busy} onClick={()=>void load(next)}>Retry history</button>}
 {next&&!error&&<button className="secondary" disabled={busy} onClick={()=>void load(next)}>Load older moves</button>}
 </div>}
 </section>;
}
