'use client';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import {readFinancialPostingReview,type FinancialPostingSelection} from '@/lib/financial-migration-posting';
import {splitEntrySources} from '@/lib/financial-split-entry';
import {readLiabilityDestinations,type UnifiedDestination,prepareUnifiedEntries} from '@/lib/financial-unified-entry';
import {readUnifiedReview} from '@/lib/financial-unified-review';
import {validateUnifiedSaveRequest,type UnifiedSaveRequest} from '@/lib/financial-unified-save';
import {FinancialUnifiedEntry} from './financial-unified-entry';
import {FinancialUnifiedSave} from './financial-unified-save';
import {FinancialUnifiedPosting} from './financial-unified-posting';
type Props={selection:FinancialPostingSelection;assessment:Record<string,unknown>;onCompleted:()=>void;onRecoveryLock?:(locked:boolean)=>void};
type Allocations=ReturnType<typeof prepareUnifiedEntries>;
export function FinancialUnifiedWorkflow(props:Props){return <Workflow key={JSON.stringify(props.selection)} {...props}/>}
function Workflow({selection,assessment,onCompleted,onRecoveryLock}:Props){
 const {scope,batch}=selection,suffix=[scope.tenant,scope.property,scope.actor,batch].join(':'),readyKey='irp.unified.ready.v1:'+suffix;
 const [ready,setReady]=useState(false),[saved,setSaved]=useState<UnifiedSaveRequest|null>(null),[draft,setDraft]=useState<UnifiedSaveRequest|null>(null),[destinations,setDestinations]=useState<UnifiedDestination[]|null>(null),[parts,setParts]=useState<Record<string,Allocations>>({}),[busy,setBusy]=useState(false),[recovery,setRecovery]=useState(false),[error,setError]=useState('');
 const alive=useRef(false),lock=useRef(false);
 const posting=readFinancialPostingReview(assessment.posting_review,selection),sources=splitEntrySources(assessment,selection);
 useEffect(()=>{alive.current=true;try{
  const pendingPost=sessionStorage.getItem('irp.unified.post.v1:'+suffix),stored=sessionStorage.getItem(readyKey),pendingSave=sessionStorage.getItem('irp.unified.save.v1:'+suffix);
  const r=pendingPost?JSON.parse(pendingPost).reconciliation:stored?JSON.parse(stored):pendingSave?JSON.parse(pendingSave):null;
  if(r){validateUnifiedSaveRequest(r);if(r.scope.tenant!==scope.tenant||r.scope.property!==scope.property||r.scope.actor!==scope.actor||r.batch!==batch)throw Error('Stored migration belongs to another workspace.');if(pendingPost||stored)setSaved(r);else setDraft(r);}setReady(true);
 }catch(e){setError(e instanceof Error?e.message:'Unable to restore migration.')}return()=>{alive.current=false}},[readyKey]);
 useEffect(()=>{onRecoveryLock?.(!ready||busy||recovery)},[ready,busy,recovery,onRecoveryLock]);
 async function identify(){const u=await hotelClient().auth.getUser();if(u.error||u.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen migration.');}
 async function run(kind:'destinations'|'preview'){
  if(!ready||lock.current||recovery||saved)return;lock.current=true;setBusy(true);setError('');
  try{await identify();if(kind==='destinations'){
   const reservations=[...new Set(posting.rows.filter(r=>r.category!=='receivable').map(r=>r.reservation))],choices:UnifiedDestination[]=[];
   for(const reservation of reservations){const value=await hotelRpc('financial_liability_candidates',{p_tenant:scope.tenant,p_property:scope.property,p_reservation:reservation,p_as_of:posting.cutover});choices.push(...readLiabilityDestinations(value,scope,reservation,posting.cutover));}
   await identify();if(alive.current){setDestinations(choices);setParts({});setDraft(null);}
  }else{
   if(!destinations||posting.rows.some(r=>!parts[r.source]))throw Error('Review every source allocation first.');
   const allocations=posting.rows.flatMap(r=>parts[r.source]);const value=readUnifiedReview(await hotelRpc('preview_unified_financial_migration',{p_tenant:scope.tenant,p_property:scope.property,p_assessment:assessment,p_allocations:allocations}),selection,assessment,allocations);
   await identify();if(alive.current)setDraft({id:crypto.randomUUID(),scope,batch,review:value});
  }}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to review migration.')}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 function accept(r:UnifiedSaveRequest){sessionStorage.setItem(readyKey,JSON.stringify(r));setSaved(r);setDraft(null);}
 function completed(){sessionStorage.removeItem(readyKey);onCompleted();}
 function restart(){sessionStorage.removeItem(readyKey);setSaved(null);setDraft(null);setDestinations(null);setParts({});setRecovery(false);}
 return <section aria-label="Invoice and deposit migration workflow">{!ready?<p role="status">Restoring migration…</p>:saved?<FinancialUnifiedPosting saved={saved} onCompleted={completed} onCancelled={restart} onRecoveryLock={setRecovery}/>:<><button type="button" disabled={busy||recovery} onClick={()=>void run('destinations')}>Load existing deposits</button>{destinations&&posting.rows.map(row=>{
  const choices=row.category==='receivable'?(sources.find(s=>s.source===row.source)?.invoices??[]).map(i=>({kind:'invoice' as const,id:i.id,reservation:row.reservation,category:row.category,label:i.label,available:row.amount})):destinations;
  return <FinancialUnifiedEntry key={row.source} source={row} destinations={choices} disabled={busy||recovery} onEdited={()=>{setDraft(null);setParts(p=>{const next={...p};delete next[row.source];return next})}} onPrepared={a=>{setDraft(null);setParts(p=>({...p,[row.source]:a}))}}/>;
 })}{destinations&&<button type="button" disabled={busy||recovery||posting.rows.some(r=>!parts[r.source])} onClick={()=>void run('preview')}>Review combined migration</button>}{draft&&<FinancialUnifiedSave draft={draft} onSaved={accept} onCancelled={restart} onRecoveryLock={setRecovery}/>}</>}{error&&<p role="alert">{error}</p>}</section>;
}
