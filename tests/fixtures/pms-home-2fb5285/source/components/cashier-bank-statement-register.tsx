"use client";
import {CashierBankAccountingStatus} from './cashier-bank-accounting-status';
import {CashierBankDebitReview} from './cashier-bank-debit-review';
import {CashierBankStatementVoid} from './cashier-bank-statement-void';
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,usd} from '@/lib/pilot';
import type {HandoffScope} from '@/lib/cashier-handoff';
import {readStatementEntries} from '@/lib/cashier-bank-reconciliation';
export function CashierBankStatementRegister({scope,account,refreshVersion=0,onChanged}:{scope:HandoffScope;account:string;refreshVersion?:number;onChanged?:()=>void}){
 const [page,setPage]=useState<ReturnType<typeof readStatementEntries>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const alive=useRef(false),lock=useRef(false),refreshQueued=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function load(next=false){if(lock.current){if(!next)refreshQueued.current=true;return;}lock.current=true;setBusy(true);setError('');try{
  const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen reconciliation.');const before=next?page?.next??null:null;
  const result=readStatementEntries(await hotelRpc('cashier_bank_statement_entries',{p_tenant:scope.tenant,p_property:scope.property,p_account:account,p_before:before}),scope,account,before);
  const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen reconciliation.');if(alive.current)setPage(result);
 }catch(e){if(alive.current){setPage(null);setError(e instanceof Error?e.message:'Unable to load statement entries.')}}finally{lock.current=false;if(alive.current){setBusy(false);if(refreshQueued.current){refreshQueued.current=false;void load()}}}}
 useEffect(()=>{void load()},[refreshVersion]);
 return <section><h3>Statement register</h3><button disabled={busy} onClick={()=>void load()}>Refresh statement entries</button>{error&&<p role="alert">{error}</p>}{page&&<>{page.entries.length?<div className="pilot-table-wrap"><table className="pilot-table"><thead><tr><th>Date</th><th>Reference</th><th>Credit / debit</th><th>Description</th><th>Status</th></tr></thead><tbody>{page.entries.map(e=><tr key={e.id}><td>{e.date}</td><td>{e.reference}<details><summary>Entry reference</summary>{e.id}</details></td><td>{BigInt(e.amount)>BigInt(0)?'Credit':'Debit'} {usd(Math.abs(Number(e.amount)))}</td><td>{e.description}</td><td>{e.status==='voided'?<>Voided<p>{e.voidReason}</p></>:'Recorded'}<CashierBankAccountingStatus key={'status:'+scope.actor+':'+e.id+':'+e.status} scope={scope} statement={e.id} amount={e.amount} bank={account}/>{e.status==='recorded'&&BigInt(e.amount)<BigInt(0)&&<CashierBankDebitReview key={'debit:'+scope.actor+':'+e.id} scope={scope} statement={e.id} bank={account} amount={(-BigInt(e.amount)).toString()}/>}<CashierBankStatementVoid key={scope.actor+':'+e.id} scope={scope} statement={e.id} voided={e.status==='voided'} onSaved={()=>{void load();onChanged?.()}}/></td></tr>)}</tbody></table></div>:<p>No statement entries on this page.</p>}{page.next&&<button disabled={busy} onClick={()=>void load(true)}>Next statement page</button>}</>}</section>
}
