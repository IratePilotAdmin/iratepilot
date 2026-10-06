'use client';
import {useEffect,useState} from 'react';
import type {FinancialPostingSelection} from '@/lib/financial-migration-posting';
import {validateSplitSaveRequest,type SplitSaveRequest} from '@/lib/financial-split-save';
import type {prepareSplitEntries} from '@/lib/financial-split-entry';
import {FinancialSplitPreview} from './financial-split-preview';
import {FinancialSplitSave} from './financial-split-save';
type Props={selection:FinancialPostingSelection;assessment:Record<string,unknown>;onSaved:(request:SplitSaveRequest)=>void;onRecoveryLock?:(locked:boolean)=>void};
export function FinancialSplitReviewWorkflow(props:Props){return <Workflow key={JSON.stringify(props.selection)} {...props}/>}
function Workflow({selection,assessment,onSaved,onRecoveryLock}:Props){
 const [draft,setDraft]=useState<SplitSaveRequest|null>(null),[ready,setReady]=useState(false),[locked,setLocked]=useState(false),[error,setError]=useState('');
 const {scope,batch}=selection,key=['irp.split.save.v1',scope.tenant,scope.property,scope.actor,batch].join(':');
 useEffect(()=>{onRecoveryLock?.(!ready||locked)},[ready,locked,onRecoveryLock]);
 useEffect(()=>{try{const stored=sessionStorage.getItem(key);if(stored){const request=JSON.parse(stored) as SplitSaveRequest;validateSplitSaveRequest(request);if(request.selection.scope.tenant!==scope.tenant||request.selection.scope.property!==scope.property||request.selection.scope.actor!==scope.actor||request.selection.batch!==batch)throw Error('Stored split review belongs to another workspace.');setDraft(request);}setReady(true);}catch(e){setError(e instanceof Error?e.message:'Unable to restore split review.');}},[key]);
 function reviewed(review:Record<string,unknown>){try{const request={id:crypto.randomUUID(),selection,assessment,allocations:review.allocations as ReturnType<typeof prepareSplitEntries>,review};validateSplitSaveRequest(request);setDraft(request);setError('');}catch(e){setError(e instanceof Error?e.message:'Invalid split review.');}}
 return <section aria-label="Split review workflow">{!ready?<p role="status">Restoring split review…</p>:draft?<FinancialSplitSave draft={draft} onSaved={onSaved} onRecoveryLock={setLocked} onCancelled={()=>{setDraft(null);setLocked(false);setError('')}}/>:<FinancialSplitPreview selection={selection} assessment={assessment} onReviewed={reviewed} onRecoveryLock={setLocked}/>} {error&&<p role="alert">{error}</p>}</section>;
}
