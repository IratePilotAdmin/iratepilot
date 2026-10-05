'use client';
import {useEffect,useRef,useState} from 'react';
type DocumentOption={documentHash:string;title:string;publishedAt:number};
type Props={tenant:string;property:string;actor:string;list:(after:string|null)=>Promise<unknown>;onChoose:(document:DocumentOption)=>void};
export function RegistrationDocumentPicker(props:Props){return <Picker key={props.tenant+'/'+props.property+'/'+props.actor} {...props}/>}
function Picker({tenant,property,list,onChoose}:Props){
 const [documents,setDocuments]=useState<DocumentOption[]>([]),[next,setNext]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(true),pending=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 async function load(){
  if(pending.current||(loaded&&!next))return;pending.current=true;setBusy(true);setError('');let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const result=await Promise.race([list(next),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Documents could not be loaded in time. Retry.')),30000)})]);
   if(!result||typeof result!=='object')throw Error('Document list could not be verified.');
   const page=result as {tenant:string;property:string;documents:DocumentOption[];next:string|null};
   if(page.tenant!==tenant||page.property!==property||!Array.isArray(page.documents)||page.documents.length>50)throw Error('Document list does not match this property.');
   let previous=next??'';
   for(const d of page.documents){if(!d||typeof d.documentHash!=='string'||!/^[a-f0-9]{64}$/.test(d.documentHash)||d.documentHash<=previous||typeof d.title!=='string'||!d.title.trim()||d.title.length>200||!Number.isSafeInteger(d.publishedAt)||d.publishedAt<=0)throw Error('Document list could not be verified.');previous=d.documentHash}
   if(page.next!==null&&(page.documents.length!==50||page.next!==previous))throw Error('Document page could not be verified.');
   if(active.current){setDocuments(old=>[...old,...page.documents]);setNext(page.next);setLoaded(true)}
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Documents could not be loaded.')}
  finally{if(timer!==undefined)clearTimeout(timer);pending.current=false;if(active.current)setBusy(false)}
 }
 return <section aria-label="Choose registration document"><h3>Choose registration document</h3>
  {documents.length>0&&<><label className="field">Published document<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><option value="">Select a version</option>{documents.map((d,i)=><option key={d.documentHash} value={d.documentHash}>{d.title} — {new Date(d.publishedAt).toLocaleString()} (option {i+1})</option>)}</select></label><button disabled={!selected||busy} onClick={()=>{const d=documents.find(item=>item.documentHash===selected);if(d)onChoose(d)}}>Use selected document</button></>}
  {loaded&&documents.length===0&&<p>No registration documents are published for this property. Ask an owner or manager to add one.</p>}
  {(!loaded||next)&&<button disabled={busy} onClick={()=>void load()}>{busy?'Loading documents…':error?'Retry loading documents':loaded?'Load more versions':'Load published documents'}</button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
