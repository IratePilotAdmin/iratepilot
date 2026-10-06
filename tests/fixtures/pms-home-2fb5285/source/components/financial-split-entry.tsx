'use client';
import {useState} from 'react';
import {prepareSplitEntries,type SplitEntry,type SplitSource} from '@/lib/financial-split-entry';
import {bankCloseMoney} from '@/lib/cashier-bank-close';
type Props={source:SplitSource;invoices:{id:string;label:string}[];disabled?:boolean;onEdited?:()=>void;onPrepared:(allocations:ReturnType<typeof prepareSplitEntries>)=>void};
export function FinancialSplitEntry(props:Props){return <>
 {['prepayment','security'].includes(props.source.category)&&<p>Import this {props.source.category==='security'?'security deposit':'prepayment'} only if it is additional to balances already recorded here. To match an existing deposit, choose “Match invoices and deposits, or add balances” before reviewing the batch.</p>}
 <Entry key={[props.source.source,props.source.amount,props.source.category].join(':')} {...props}/>
 </>}
function Entry({source,invoices,disabled=false,onEdited,onPrepared}:Props){
 const [entries,setEntries]=useState<SplitEntry[]>([{invoice:'',amount:'',evidence:''}]),[error,setError]=useState('');
 function change(index:number,field:keyof SplitEntry,value:string){onEdited?.();setEntries(previous=>previous.map((entry,i)=>i===index?{...entry,[field]:value}:entry));setError('');}
 function prepare(){try{onPrepared(prepareSplitEntries(source,entries,invoices.map(i=>i.id)));setError('');}catch(e){setError(e instanceof Error?e.message:'Review the allocated amounts.');}}
 return <section aria-label={'Split source '+source.source}><h4>{source.source}</h4><p>Original {source.category} balance: {bankCloseMoney(source.amount)}</p><fieldset disabled={disabled}><legend>Allocate the original balance</legend>{entries.map((entry,index)=><div key={index}><label className="field">Destination {index+1}<select value={entry.invoice} onChange={e=>change(index,'invoice',e.target.value)}><option value="">New opening balance</option>{source.category==='receivable'&&invoices.map(invoice=><option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></label><label className="field">Amount (USD) {index+1}<input inputMode="decimal" value={entry.amount} onChange={e=>change(index,'amount',e.target.value)}/></label><label className="field">Supporting reference {index+1}<textarea maxLength={1000} value={entry.evidence} onChange={e=>change(index,'evidence',e.target.value)}/></label>{entries.length>1&&<button type="button" onClick={()=>{onEdited?.();setEntries(previous=>previous.filter((_,i)=>i!==index));setError('')}}>Remove portion {index+1}</button>}</div>)}<button type="button" disabled={entries.length>=invoices.length+1||source.category!=='receivable'} onClick={()=>{onEdited?.();setEntries(previous=>[...previous,{invoice:'',amount:'',evidence:''}]);setError('')}}>Add portion</button><button type="button" onClick={prepare}>Review source allocation</button></fieldset>{error&&<p role="alert">{error}</p>}</section>;
}
