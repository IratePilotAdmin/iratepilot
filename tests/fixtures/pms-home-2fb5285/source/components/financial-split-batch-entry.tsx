'use client';
import {useState} from 'react';
import {FinancialSplitEntry} from './financial-split-entry';
import type {SplitSource,prepareSplitEntries} from '@/lib/financial-split-entry';
type Allocation=ReturnType<typeof prepareSplitEntries>;
type Props={sources:(SplitSource&{invoices:{id:string;label:string}[]})[];disabled?:boolean;onPrepared:(allocations:Allocation)=>void;onEdited?:()=>void};
export function FinancialSplitBatchEntry(props:Props){return <Batch key={JSON.stringify(props.sources)} {...props}/>}
function Batch({sources,disabled=false,onPrepared,onEdited}:Props){
 const [prepared,setPrepared]=useState<Record<string,Allocation>>({});
 const valid=sources.length>0&&new Set(sources.map(s=>s.source)).size===sources.length;
 const complete=valid&&sources.every(s=>prepared[s.source]);
 function invalidate(source:string){setPrepared(previous=>{const next={...previous};delete next[source];return next});onEdited?.();}
 return <section aria-label="Allocate migration batch"><h3>Allocate imported balances</h3><p>Review each source, then review the complete batch. Editing a source clears its prior review.</p>{!valid?<p role="alert">The batch needs unique source balances.</p>:sources.map(source=><div key={source.source}><FinancialSplitEntry source={source} invoices={source.invoices} disabled={disabled} onEdited={()=>invalidate(source.source)} onPrepared={value=>{onEdited?.();setPrepared(previous=>({...previous,[source.source]:value}))}}/>{prepared[source.source]&&<p role="status">Source allocation reviewed: {source.source}</p>}</div>)}<button type="button" disabled={disabled||!complete} onClick={()=>{if(complete)onPrepared(sources.flatMap(s=>prepared[s.source]))}}>Review complete split batch</button></section>;
}
