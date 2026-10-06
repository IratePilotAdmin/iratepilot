'use client';
import {useEffect,useRef,useState} from 'react';
import {readRegistrationDocument,registrationDocumentHash,type RegistrationDocument} from '@/lib/registration-document';
import {publishRegistrationFromBrowser} from '@/lib/registration-staff-client';

type Publication={documentHash:string;publishedBy:string;publishedAt:number};
type Props={scopeKey:string;role:string;publish:(document:RegistrationDocument)=>Promise<Publication>};
export function PropertyRegistrationDocuments({tenant,property,actor,accessToken,role}:{tenant:string;property:string;actor:string;accessToken:string;role:string}){
 return <RegistrationDocumentEditor scopeKey={tenant+'/'+property+'/'+actor} role={role} publish={document=>publishRegistrationFromBrowser({tenant,property,accessToken},document)}/>;
}
export function RegistrationDocumentEditor(props:Props){
 if(!['owner','manager'].includes(props.role))return <p>An owner or manager can publish registration documents.</p>;
 return <Editor key={props.scopeKey+'/'+props.role} {...props}/>;
}
function Editor({publish}:Props){
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[review,setReview]=useState<RegistrationDocument|null>(null),[saved,setSaved]=useState<Publication|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false);
 const active=useRef(true),sending=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 async function save(){
  if(!review||sending.current||saved)return;
  sending.current=true;setBusy(true);setAttempted(true);setError('');let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const expected=await registrationDocumentHash(review);
   if(!active.current)return;
   const result=await Promise.race([publish(review),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Publishing could not be confirmed in time. Retry this same document.')),30000)})]);
   if(result.documentHash!==expected||typeof result.publishedBy!=='string'||!result.publishedBy||!Number.isSafeInteger(result.publishedAt)||result.publishedAt<=0)throw Error('The published document could not be verified. Retry this same document.');
   if(active.current)setSaved(result);
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Publishing could not be confirmed. Retry this same document.')}
  finally{if(timer!==undefined)clearTimeout(timer);sending.current=false;if(active.current)setBusy(false)}
 }
 return <section className="card" aria-label="Registration document settings"><h2>Registration document</h2>
  <p>Enter the property’s registration text. Guests will review this exact version before signing.</p>
  {!review?<form onSubmit={e=>{e.preventDefault();try{setReview(readRegistrationDocument({version:1,title,body}));setError('')}catch(err){setError(err instanceof Error?err.message:'Review the document text.')}}}>
   <label className="field">Document title<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label className="field">Registration text<textarea required rows={12} maxLength={20000} value={body} onChange={e=>setBody(e.target.value)}/></label>
   <button className="primary" type="submit">Review document</button>
  </form>:<><h3>{review.title}</h3><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{review.body}</div>
   {saved?<><p role="status">Document published. Existing signed versions stay unchanged.</p><button onClick={()=>{setReview(null);setSaved(null);setAttempted(false);setError('')}}>Prepare another version</button></>:<>
    <p>Publishing makes this version available for new registration links.</p>
    <button className="primary" disabled={busy} onClick={()=>void save()}>{busy?'Publishing…':attempted?'Retry publishing this version':'Publish this version'}</button>
    {!attempted&&<button onClick={()=>setReview(null)}>Edit text</button>}
   </>}
  </>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
