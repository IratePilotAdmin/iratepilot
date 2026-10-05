'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {SubmitEvent} from 'react';
import {lostFoundRpc} from '@/lib/lost-found-request';
import {LostFoundHistory} from '@/components/lost-found-history';

type Item={id:string;tenant_id:string;property_id:string;description:string;found_location:string;storage_location:string;current_storage_location?:string;storage_version?:number;latest_storage_move?:null|{from_location:string;to_location:string;reason:string;moved_at:string};found_on:string;status:'held'|'returned';return_record:null|{handover_reference:string;returned_at:string}};
type Page={items:Item[];next:null|{time:string;id:string}};
type Props={actor:string;tenant:string;property:string;businessDate:string;canWrite:boolean;onBusyChange?:(busy:boolean)=>void};
type Pending={operation:'register_found_item'|'return_found_item'|'move_found_item';args:Record<string,string>};
function formValue(data:FormData,name:string){const value=data.get(name);return typeof value==='string'?value.trim():''}
export function LostFoundPanel(props:Props){return <Panel key={[props.actor,props.tenant,props.property].join('/')} {...props}/>}
function Panel({actor,tenant,property,businessDate,canWrite,onBusyChange}:Props){
 const storageKey=['irp-lost-found-v1',actor,tenant,property].join('/');
 const [initial]=useState(()=>{try{
  const raw=sessionStorage.getItem(storageKey);if(!raw)return {pending:null,error:''};
  const p=JSON.parse(raw) as Pending;
  if(!['register_found_item','return_found_item','move_found_item'].includes(p.operation)||p.args?.p_tenant!==tenant||p.args?.p_property!==property||typeof p.args.p_request!=='string')throw Error();
  return {pending:p,error:''};
 }catch{return {pending:null,error:'The unfinished item record could not be read. Restore browser storage before saving another item.'}}});
 const [pending,setPending]=useState<Pending|null>(initial.pending),[items,setItems]=useState<Item[]>([]),[next,setNext]=useState<Page['next']>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(initial.error),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false),[selected,setSelected]=useState<Item|null>(null);
 const [filterState,setFilterState]=useState({search:'',status:''});
 const alive=useRef(false),lock=useRef(false);
 const [registering,setRegistering]=useState(false);
 const [itemAction,setItemAction]=useState<'return'|'move'>('return');
 const [search,setSearch]=useState(''),[status,setStatus]=useState('');
 const appliedFilters=useRef({search:'',status:''});
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false)},[busy,onBusyChange]);
 const load=useCallback(async(cursor:Page['next']=null,filters=appliedFilters.current)=>{
  const result=await lostFoundRpc<Page>('found_items',{p_tenant:tenant,p_property:property,p_before_time:cursor?.time??null,p_before_id:cursor?.id??null,p_search:filters.search||null,p_status:filters.status||null});
  if(!result||!Array.isArray(result.items)||result.items.some(i=>i.tenant_id!==tenant||i.property_id!==property||!['held','returned'].includes(i.status)))throw Error('The item list could not be verified. Refresh before continuing.');
  if(alive.current){appliedFilters.current=filters;setFilterState(filters);setItems(old=>cursor?[...old,...result.items.filter(i=>!old.some(o=>o.id===i.id))]:result.items);setNext(result.next);setLoaded(true)}
 },[property,tenant]);
 const run=useCallback(async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError(initial.error);try{await action()}catch(e){if(alive.current)setError(e instanceof Error?e.message:'The item action failed.')}finally{lock.current=false;if(alive.current)setBusy(false)}},[initial.error]);
 useEffect(()=>{void run(()=>load())},[load,run]);
 function verifyStored(p:Pending,required=true){
  const raw=sessionStorage.getItem(storageKey);
  if(!raw&&!required)return;
  const current=raw?JSON.parse(raw):null;
  if(!current||current.operation!==p.operation||!current.args||Object.keys(current.args).length!==Object.keys(p.args).length||Object.entries(p.args).some(([key,value])=>current.args[key]!==value))throw Error('A different item record is pending. Reopen Lost and found to review it.');
 }
 async function save(p:Pending){
  if(!canWrite||initial.error)return;
  verifyStored(p,false);
  sessionStorage.setItem(storageKey,JSON.stringify(p));setPending(p);
  const result=await lostFoundRpc<Record<string,unknown>>(p.operation,p.args);
  if(result?.tenant_id!==tenant||result.property_id!==property||result.request_id!==p.args.p_request||(p.operation!=='register_found_item'&&result.item_id!==p.args.p_item))throw Error('Save could not be confirmed. Retry this same record; do not enter a replacement.');
  if(!alive.current)return;
  verifyStored(p);
  sessionStorage.removeItem(storageKey);
  setPending(null);setSelected(null);setRegistering(false);setNotice(p.operation==='register_found_item'?'Found item registered.':p.operation==='move_found_item'?'Storage location updated.':'Return recorded.');
  await load();
 }
 async function cancelUnsavedMove(p:Pending){
  if(!canWrite||initial.error||p.operation!=='move_found_item')return;
  verifyStored(p);
  const result=await lostFoundRpc<{tenant_id:string;property_id:string;item_id:string;request_id:string;outcome:string}>('cancel_found_item_move',{p_tenant:tenant,p_property:property,p_item:p.args.p_item,p_request:p.args.p_request});
  if(result?.tenant_id!==tenant||result.property_id!==property||result.item_id!==p.args.p_item||result.request_id!==p.args.p_request||!['saved','cancelled'].includes(result.outcome))throw Error('Move resolution could not be confirmed. Retry before starting another move.');
  if(!alive.current)return;
  verifyStored(p);
  sessionStorage.removeItem(storageKey);
  setPending(null);setSelected(null);setNotice(result.outcome==='saved'?'The move already saved. Its record has been kept.':'Unsaved move cancelled.');
  await load();
 }
 function submit(event:SubmitEvent<HTMLFormElement>,operation:Pending['operation']){
  event.preventDefault();if(pending||initial.error||!canWrite||lock.current)return;
  const data=new FormData(event.currentTarget);
  const args:Record<string,string>={p_tenant:tenant,p_property:property,p_request:crypto.randomUUID()};
  if(operation==='register_found_item')for(const name of ['description','found_location','storage_location','found_on'])args['p_'+name]=formValue(data,name);
  else {if(!selected)return;args.p_item=selected.id;
   if(operation==='move_found_item'){
    if(!Number.isSafeInteger(selected.storage_version)||selected.storage_version!<0){setError('Refresh this item before moving it.');return}
    args.p_expected_version=String(selected.storage_version);args.p_location=formValue(data,'location');args.p_reason=formValue(data,'reason');
    if(args.p_location===selected.current_storage_location){setError('Choose a different storage location.');return}
   }else args.p_reference=formValue(data,'reference')
  }
  const limits=operation==='register_found_item'?{p_description:500,p_found_location:200,p_storage_location:200}:operation==='move_found_item'?{p_location:200,p_reason:500}:{p_reference:200};
  for(const [field,limit] of Object.entries(limits))if(!args[field]||args[field].length>limit){setError('Complete the item details using nonblank text within the displayed field limits.');return}
  if(operation==='register_found_item'){
   const date=args.p_found_on;
   const parsed=new Date(date+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.startsWith('0000')||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date){setError('Enter a valid date found.');return}
  }
  setNotice('');void run(()=>save({operation,args}));
 }
 return <section className="lost-found-panel" aria-label="Lost and found">
  <div className="section-top"><h2>Lost and found</h2>{canWrite&&<button className="primary" disabled={busy||!!pending} aria-expanded={registering} onClick={()=>setRegistering(v=>!v)}>{registering?'Hide item form':'Add found item'}</button>}<button className="secondary" disabled={busy} onClick={()=>void run(()=>load())}>Refresh items</button></div>
  {error&&<p role="alert">{error}</p>}{notice&&<output>{notice}</output>}{busy&&<output>Updating items…</output>}
  <form onSubmit={e=>{e.preventDefault();setSelected(null);void run(()=>load(null,{search:search.trim(),status}))}}><fieldset className="lost-found-search" disabled={busy} style={{border:0,padding:0}}><label className="field">Search items or locations<input type="search" maxLength={200} value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="field">Item status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All items</option><option value="held">Held</option><option value="returned">Returned</option></select></label><button className="secondary" type="submit">Search items</button></fieldset></form>
  {pending&&<section className="card"><h3>Unconfirmed item record</h3><p>{pending.operation==='register_found_item'?pending.args.p_description:pending.operation==='move_found_item'?'New storage: '+pending.args.p_location:'Return reference: '+pending.args.p_reference}</p><p>Retry this same record to check or finish saving it.</p><button className="primary" disabled={busy||!canWrite||!!initial.error} onClick={()=>void run(()=>save(pending))}>Retry item record</button></section>}
  {pending?.operation==='move_found_item'&&<section className="card"><p>If the move did not save, you can cancel that request and start again. A move that already saved will be kept.</p><button className="secondary" disabled={busy||!canWrite||!!initial.error} onClick={()=>void run(()=>cancelUnsavedMove(pending))}>Cancel unsaved move</button></section>}
  {canWrite&&!pending&&<form hidden={!registering} className="card" onSubmit={e=>submit(e,'register_found_item')}><h3>Register a found item</h3><fieldset className="lost-found-fields" disabled={busy||!!initial.error} style={{border:0,padding:0}}>
   <label className="field">Item description<input name="description" required maxLength={500}/></label>
   <label className="field">Found at<input name="found_location" required maxLength={200}/></label>
   <label className="field">Stored at<input name="storage_location" required maxLength={200}/></label>
   <label className="field">Date found<input name="found_on" type="date" required defaultValue={businessDate}/></label>
   <button className="primary" type="submit">Register item</button>
  </fieldset></form>}
  {loaded&&items.length===0&&<p>{filterState.search||filterState.status?'No items match this search.':'No found items recorded for this property.'}</p>}
  {items.map(item=><article className="card" key={item.id}><h3>{item.description}</h3><p><strong>{item.status==='held'?'Held':'Returned'}</strong> · Found {item.found_on} at {item.found_location}</p><p>Stored at: {item.current_storage_location??item.storage_location}</p>
   {item.return_record?<p>Return reference: {item.return_record.handover_reference} · {new Date(item.return_record.returned_at).toLocaleString()}</p>:canWrite&&<button className="secondary" disabled={busy||!!pending} onClick={()=>{setSelected(item);setItemAction('return')}}>Record return of {item.description}</button>}
  {canWrite&&itemAction==='return'&&selected?.id===item.id&&!pending&&<form className="lost-found-return" onSubmit={e=>submit(e,'return_found_item')}><h3>Return: {selected.description}</h3><p>Confirm the claimant and complete the handover before recording the return. Use your handover receipt reference; do not enter an ID number.</p><fieldset disabled={busy||!!initial.error} style={{border:0,padding:0}}><label className="field">Handover reference<input name="reference" required maxLength={200}/></label><button className="primary" type="submit">Confirm item returned</button><button className="secondary" type="button" onClick={()=>setSelected(null)}>Cancel</button></fieldset></form>}
   {item.latest_storage_move&&<details><summary>Latest storage move</summary><p>{item.latest_storage_move.from_location} → {item.latest_storage_move.to_location}</p><p>{item.latest_storage_move.reason} · {new Date(item.latest_storage_move.moved_at).toLocaleString()}</p></details>}
   {Number.isSafeInteger(item.storage_version)&&<LostFoundHistory key={item.id+'/'+item.storage_version} tenant={tenant} property={property} item={item.id} actor={actor}/>}
   {canWrite&&item.status==='held'&&Number.isSafeInteger(item.storage_version)&&<button className="secondary" disabled={busy||!!pending} onClick={()=>{setSelected(item);setItemAction('move')}}>Move {item.description}</button>}
   {canWrite&&itemAction==='move'&&selected?.id===item.id&&!pending&&<form className="lost-found-move" onSubmit={e=>submit(e,'move_found_item')}><h3>Move: {item.description}</h3><p>Current storage: {item.current_storage_location??item.storage_location}. Record the new location after moving the item.</p><fieldset disabled={busy||!!initial.error} style={{border:0,padding:0}}><label className="field">New storage location<input name="location" required maxLength={200}/></label><label className="field">Reason for move<input name="reason" required maxLength={500}/></label><button className="primary" type="submit">Save storage move</button><button className="secondary" type="button" onClick={()=>setSelected(null)}>Cancel</button></fieldset></form>}
  </article>)}
  {next&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>load(next))}>Load more items</button>}
 </section>;
}
