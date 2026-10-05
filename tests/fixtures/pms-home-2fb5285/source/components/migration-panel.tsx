'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,FileUp,ArrowRight} from 'lucide-react';
import {FinancialMigrationWorkspace} from './financial-migration-workspace';
import {hotelRpc,usd,type RoomType} from '@/lib/pilot';
import {readImportCsv,importHeaders} from '@/lib/import-csv';

type ImportRow={row_number:number;source_id:string;valid:boolean;errors:string[];normalized:{guest_name:string;arrival:string;departure:string;guest_total_minor:number;room_type_id:string;guests:number;accommodation_minor:number;taxes_minor:number}|null};
type Batch={batch_id:string;provider:string;status:string;row_count:number;valid_count:number;error_count:number;created_at?:string;rows?:ImportRow[];latest_attempt?:{status:string;rows?:ImportRow[]}|null};

type MigrationPanelProps={actor?:string;tenant:string;property:string;role:string;types:RoomType[];onCommitted:()=>Promise<void>};
export function MigrationPanel(props:MigrationPanelProps){
 return <MigrationWorkspace key={props.tenant+'/'+props.property+'/'+props.role} {...props}/>;
}
function MigrationWorkspace({actor,tenant,property,role,types,onCommitted}:MigrationPanelProps){
 const [batches,setBatches]=useState<Batch[]>([]),[preview,setPreview]=useState<Batch|null>(null),[provider,setProvider]=useState(''),[csv,setCsv]=useState(''),[filename,setFilename]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
 const alive=useRef(true),fileGeneration=useRef(0);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const stageRequest=useRef<{input:string;id:string}|null>(null),actionRequest=useRef<{action:string;batch:string;id:string}|null>(null);
 const allowed=['owner','manager'].includes(role),scope={p_tenant:tenant,p_property:property};
 useEffect(()=>{let live=true;if(allowed)hotelRpc<Batch[]>('list_imports',{p_tenant:tenant,p_property:property}).then(rows=>live&&setBatches(rows)).catch(e=>live&&setError(e.message));return()=>{live=false}},[tenant,property,allowed]);
 async function reload(){setBatches(await hotelRpc<Batch[]>('list_imports',scope))}
 async function action(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Unable to complete migration action.')}finally{setBusy(false)}}
 async function refreshAfterSave(){try{await reload()}catch{setError('Saved, but the import list could not refresh. Use Refresh before starting another batch.')}}
 async function stage(){
  const rows=readImportCsv(csv,types),input=provider+'\n'+csv;
  if(stageRequest.current?.input!==input)stageRequest.current={input,id:crypto.randomUUID()};
  const result=await hotelRpc<Batch>('stage_import',{...scope,p_request:stageRequest.current.id,p_provider:provider,p_rows:rows});
  setPreview(result);setConfirm(false);setNotice(result.status==='committed'?'This batch was already imported. Its saved receipt has been restored.':result.status==='discarded'?'This batch was already discarded.':'Preview saved. No reservations have been imported.');await refreshAfterSave();
 }
 async function finish(actionName:'commit'|'discard'){
  if(!preview)return;
  if(actionRequest.current?.action!==actionName||actionRequest.current?.batch!==preview.batch_id)actionRequest.current={action:actionName,batch:preview.batch_id,id:crypto.randomUUID()};
  const result=await hotelRpc<Batch>(actionName+'_import',{...scope,p_batch:preview.batch_id,p_request:actionRequest.current.id});
  actionRequest.current=null;setConfirm(false);
  if(result.status==='validation_failed'){
   setPreview({...preview,latest_attempt:{status:result.status,rows:result.rows}});
   setError('Inventory or source records changed. No reservations were imported. Review the new errors before retrying.');return;
  }
  setPreview({...preview,status:result.status,latest_attempt:null});
  setNotice(actionName==='commit'?`Imported ${preview.row_count} reservations. Payments remain unrecorded.`:'Batch discarded. Its review history is retained.');
  stageRequest.current=null;
  await refreshAfterSave();
  if(actionName==='commit'&&alive.current)try{await onCommitted()}catch{setError('Import committed, but the workspace could not refresh. Refresh before taking another action.')}
 }
 function template(){const url=URL.createObjectURL(new Blob([importHeaders.join(',')+'\r\n'],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='iratepilot-future-reservations.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 if(!allowed)return <section className="card pilot-empty">An owner or manager can prepare a PMS migration.</section>;
 const rows=preview?.latest_attempt?.status==='validation_failed'?preview.latest_attempt.rows:preview?.rows;
 const validCount=rows?.filter(r=>r.valid).length??preview?.valid_count??0,errorCount=rows?.filter(r=>!r.valid).length??preview?.error_count??0;
 return <>
  {actor&&<FinancialMigrationWorkspace key={actor+':'+tenant+':'+property} scope={{actor,tenant,property}}/>}
  <section className="card pilot-settings"><span className="pilot-eyebrow">SWITCH AT YOUR OWN PACE</span><h2>Bring your future reservations</h2><p>Prepare your room types and inventory first. Upload a CSV, review every row, then commit the complete batch. Your current PMS can stay in place while you prepare.</p>
   {error&&<div className="pilot-error" role="alert">{error}</div>}{notice&&<output className="pilot-notice">{notice}</output>}
   <div className="pilot-actions"><button className="secondary" onClick={template}><Download size={16}/>Download CSV template</button><span>Up to 500 stays · USD · 1–30 nights</span></div>
   <form onSubmit={e=>{e.preventDefault();void action(stage)}}>
    <label className="field">Source PMS code<input value={provider} onChange={e=>{setProvider(e.target.value);setPreview(null);setConfirm(false)}} required disabled={busy} pattern="[a-z0-9][a-z0-9_-]{0,79}" maxLength={80} placeholder="For example: opera-export"/><small>Keep this code and each source reservation ID unchanged when retrying an import.</small></label>
    <label className="field">Reservation CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{const file=e.target.files?.[0],generation=++fileGeneration.current;setPreview(null);setConfirm(false);setCsv('');setFilename('');if(!file)return;setError('');if(file.size>1024*1024){setError('The CSV must be 1 MB or smaller.');return}void file.text().then(value=>{if(alive.current&&generation===fileGeneration.current){setCsv(value);setFilename(file.name)}}).catch(()=>{if(alive.current&&generation===fileGeneration.current)setError('Unable to read this file.')})}}/></label>
    <p>{filename||'Choose a CSV using the template columns.'} Room-type names must match: {types.map(t=>t.name).join(', ')||'add room types in Property settings'}.</p>
    <p>Use YYYY-MM-DD dates, USD currency, and dollar amounts such as 125.00. Accommodation plus taxes is the stay value. This import records no deposits, payments, or historical guest data.</p>
    <button className="primary" disabled={busy||!csv||!types.length}><FileUp size={17}/>{busy?'Working…':'Validate and preview'}</button>
   </form>
  </section>
  {preview&&<section className="card"><div className="section-top"><div><h2>Import review</h2><p>{preview.provider} · {preview.row_count} rows · {preview.status}</p></div><span className={'pill '+(errorCount?'amber':'green')}>{validCount} valid / {errorCount} need attention</span></div>
   {preview.latest_attempt?.status==='validation_failed'&&<p className="pilot-error">Showing the latest commit attempt. The original preview remains saved.</p>}
   <div className="pilot-table-wrap"><table className="pilot-table"><thead><tr><th>Row / reference</th><th>Guest</th><th>Stay</th><th>Room type</th><th>Charges (USD)</th><th>Result</th></tr></thead><tbody>{rows?.map(r=><tr key={r.row_number}><td>{r.row_number}<small>{r.source_id}</small></td><td>{r.normalized?.guest_name??'—'}{r.normalized&&<small>{r.normalized.guests} guests</small>}</td><td>{r.normalized?.arrival??'—'}<small>{r.normalized?.departure??''}</small></td><td>{types.find(t=>t.id===r.normalized?.room_type_id)?.name??'—'}</td><td>{r.normalized?<>{usd(r.normalized.guest_total_minor)}<small>Room {usd(r.normalized.accommodation_minor)} + tax {usd(r.normalized.taxes_minor)}</small></>:'—'}</td><td>{r.valid?'Ready':r.errors.join('; ')}</td></tr>)}</tbody></table></div>
   {preview.status==='staged'&&<div className="pilot-settings"><p>Commit rechecks every stay night. If any row fails, the entire batch stays uncommitted.</p>{!preview.error_count&&<label className="pilot-check"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/>I reviewed the source IDs, room mapping, stay dates, and charges.</label>}<div className="pilot-actions"><button className="primary" disabled={busy||!!preview.error_count||!confirm} onClick={()=>void action(()=>finish('commit'))}>Commit {preview.row_count} reservations <ArrowRight size={16}/></button><button className="secondary" disabled={busy} onClick={()=>void action(()=>finish('discard'))}>Discard this batch</button></div></div>}
  </section>}
  <section className="card"><div className="section-top"><h2>Migration history</h2><button className="secondary" disabled={busy} onClick={()=>void action(reload)}>Refresh</button></div>{batches.map(b=><div className="pilot-list-row" key={b.batch_id}><div><strong>{b.provider}</strong><small>{b.row_count} reservations · {b.status}{b.created_at?' · '+new Date(b.created_at).toLocaleDateString():''}</small></div><button className="text-button" disabled={busy} onClick={()=>void action(async()=>{setPreview(await hotelRpc<Batch>('import_detail',{...scope,p_batch:b.batch_id}));setConfirm(false)})}>Review</button></div>)}{!batches.length&&<p className="pilot-empty">No migration batches yet.</p>}</section>
 </>;
}

