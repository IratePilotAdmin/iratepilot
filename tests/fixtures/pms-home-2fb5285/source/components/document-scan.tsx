'use client';
import {useEffect,useRef,useState} from 'react';
import {DocumentCamera} from '@/components/document-camera';
import type {Worker} from 'tesseract.js';
import {documentContact} from '@/lib/document-contact';
import {documentScanHasSuggestions} from '@/lib/document-scan-quality';
import type {GuestData} from '@/lib/guests';
export function DocumentScan({onRead,disabled=false,mode='guest_record'}:{onRead:(data:Partial<GuestData>)=>void;disabled?:boolean;mode?:'guest_record'|'arrival'}){
 const [scanner,setScanner]=useState(false),[scanText,setScanText]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const worker=useRef<Worker|null>(null),generation=useRef(0),locked=useRef(false);
 const pending=useRef<(()=>void)|null>(null);
 function stopWorker(value:Worker|null){try{void value?.terminate().catch(()=>{})}catch{/* Cleanup must not block another scan. */}}
 useEffect(()=>()=>{generation.current++;pending.current?.();pending.current=null;stopWorker(worker.current);worker.current=null},[]);
 function cancel(showMessage=false){generation.current++;pending.current?.();pending.current=null;stopWorker(worker.current);worker.current=null;locked.current=false;setBusy(false);if(showMessage)setMessage('Reading stopped. You can retry or enter details manually.')}
 async function scan(file:File|undefined):Promise<boolean>{
  if(!file||locked.current||disabled)return false;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024){setMessage('Choose a JPG, PNG or WebP photo up to 15 MB.');return false}
  const photo=file;locked.current=true;setBusy(true);setMessage('Reading document on this device…');const seq=++generation.current;let active:Worker|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  const stopped=new Promise<boolean>(resolve=>{pending.current=()=>resolve(false)});
  const timeout=new Promise<boolean>((_,reject)=>{timer=setTimeout(()=>reject(Error('Reading timed out. Try a clearer photo or enter details manually.')),30000)});
  async function read(){
   const {createWorker}=await import('tesseract.js');if(seq!==generation.current)return false;
   active=await createWorker('eng',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr',langPath:'/ocr',workerBlobURL:false,cacheMethod:'none',logger:progress=>{if(seq===generation.current)setMessage(progress.status==='recognizing text'?'Reading document: '+Math.round(progress.progress*100)+'%':'Preparing scanner…')}});
   if(seq!==generation.current){stopWorker(active);return false}
   worker.current=active;const {data}=await active.recognize(photo);if(seq!==generation.current)return false;
   const contact=documentContact(data.text);const found=documentScanHasSuggestions(contact,data.confidence);
   if(found)onRead(contact);setMessage(found?'Scan complete. Review every suggested field against the document.':'No reliable details found yet. Move closer, reduce glare, and hold steady.');return found;
  }
  try{return await Promise.race([read(),stopped,timeout])}
  catch(error){if(seq===generation.current)setMessage(error instanceof Error&&error.message.startsWith('Reading timed out.')?error.message:'This photo could not be read. Use a clear, upright photo without glare, or enter details manually.');return false}
  finally{clearTimeout(timer);stopWorker(active);if(worker.current===active)worker.current=null;if(seq===generation.current){generation.current++;pending.current=null;locked.current=false;setBusy(false)}}
 }
 return <section className="pilot-settings" aria-label={mode==='arrival'?'Optional guest contact scan':'Guest document scan'}><h3>Scan ID or passport</h3><p>Open the camera, hold the ID front or passport photo page steady, and scanning starts automatically when the view is steady and sharp. Tablets prefer the rear camera; computers use a webcam. Review every suggestion against the document before submitting.</p><DocumentCamera onCapture={scan} onCancel={cancel} disabled={disabled||busy}/><div className="form-grid"><label className="field">Upload a photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||busy} onChange={e=>{void scan(e.target.files?.[0]);e.target.value=''}}/></label><button type="button" className="secondary" disabled={disabled||busy} onClick={()=>{setScanner(v=>!v);setScanText('')}}>Use USB / text scanner</button></div>{scanner&&<div><label className="field">Scanner input<textarea autoComplete="off" spellCheck={false} value={scanText} maxLength={10000} disabled={disabled||busy} onChange={e=>setScanText(e.target.value)}/></label><p>Click this box, then scan. Supports decoded AAMVA barcode text and passport MRZ lines from keyboard-mode scanners. Image-only scanners can use photo upload.</p><button type="button" className="secondary" disabled={disabled||busy||!scanText.trim()} onClick={()=>{const fields=documentContact(scanText);if(Object.keys(fields).length){onRead(fields);setMessage('Scanner suggestions ready. Review the permitted contact fields before submitting.');setScanText('')}else setMessage('Scanner format not recognized. Check keyboard mode or upload its image.')}}>Read scanner data</button></div>}{busy&&<button type="button" className="secondary" onClick={()=>cancel(true)}>Stop reading</button>}<output aria-live="polite">{message}</output><p className="muted">{mode==='arrival'?'Scanning runs only on this device. The photo and raw scanner data are discarded. Only the guest-reviewed name and address fields shown below are sent to the property after submission; document numbers, birth dates and document images are not saved. Scanning does not verify document authenticity.':'Photos and raw scanner text stay on this device and are discarded. Reviewed guest and document fields are saved to this property. Missing information stays blank; enter phone and email separately. English printed text and supported machine-readable documents can be read. Scanning does not verify document authenticity.'}</p></section>;
}
