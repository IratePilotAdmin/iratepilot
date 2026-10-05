'use client';
import {useEffect,useState} from 'react';
import type {FinancialPostingSelection} from '@/lib/financial-migration-posting';
import {validateSplitSaveRequest,type SplitSaveRequest} from '@/lib/financial-split-save';
import {FinancialSplitReviewWorkflow} from './financial-split-review-workflow';
import {FinancialSplitPosting} from './financial-split-posting';
type Props={selection:FinancialPostingSelection;assessment:Record<string,unknown>;onCompleted:()=>void;onRecoveryLock?:(locked:boolean)=>void};
export function FinancialSplitWorkflow(props:Props){return <Workflow key={JSON.stringify(props.selection)} {...props}/>}
function Workflow({selection,assessment,onCompleted,onRecoveryLock}:Props){
 const [saved,setSaved]=useState<SplitSaveRequest|null>(null),[ready,setReady]=useState(false),[locked,setLocked]=useState(false),[error,setError]=useState('');
 const {scope,batch}=selection,suffix=[scope.tenant,scope.property,scope.actor,batch].join(':'),key='irp.split.ready.v1:'+suffix;
 useEffect(()=>{try{const pending=sessionStorage.getItem('irp.split.post.v1:'+suffix),stored=sessionStorage.getItem(key),request=pending?JSON.parse(pending).reconciliation:stored?JSON.parse(stored):null;if(request){validateSplitSaveRequest(request);const s=request.selection;if(s.scope.tenant!==scope.tenant||s.scope.property!==scope.property||s.scope.actor!==scope.actor||s.batch!==batch)throw Error('Stored split migration belongs to another workspace.');setSaved(request);}setReady(true);}catch(e){setError(e instanceof Error?e.message:'Unable to restore split migration.');}},[key]);
 useEffect(()=>{onRecoveryLock?.(!ready||locked)},[ready,locked,onRecoveryLock]);
 function accept(request:SplitSaveRequest){validateSplitSaveRequest(request);sessionStorage.setItem(key,JSON.stringify(request));setSaved(request);}
 function completed(){sessionStorage.removeItem(key);onCompleted();}
 function cancelled(){sessionStorage.removeItem(key);setSaved(null);setLocked(false);}
 return <section aria-label="Split migration workflow">{!ready?<p role="status">Restoring split migration…</p>:saved?<FinancialSplitPosting saved={saved} onCompleted={completed} onCancelled={cancelled} onRecoveryLock={setLocked}/>:<FinancialSplitReviewWorkflow selection={selection} assessment={assessment} onSaved={accept} onRecoveryLock={setLocked}/>} {error&&<p role="alert">{error}</p>}</section>;
}
