"use client";
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import type {HandoffScope} from '@/lib/cashier-handoff';
import {bankCloseMoney} from '@/lib/cashier-bank-close';
import {readBankCloseHistory} from '@/lib/cashier-bank-close-history';
type Props={scope:HandoffScope;bank:string;onReopen?:(id:string)=>void};
export function CashierBankCloseHistory({scope,bank,onReopen}:Props) {
 return <History key={[scope.tenant,scope.property,scope.actor,bank].join(':')} scope={scope} bank={bank} onReopen={onReopen}/>;
}
function History({scope,bank,onReopen}:Props) {
 const [page,setPage]=useState<ReturnType<typeof readBankCloseHistory>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(false),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function load(before:string|null) {
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try {
   const auth=await hotelClient().auth.getUser();if(auth.error||auth.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen reconciliation.');
   const next=readBankCloseHistory(await hotelRpc('bank_close_history',{p_tenant:scope.tenant,p_property:scope.property,p_bank:bank,p_before:before}),scope,bank,before);
   const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen reconciliation.');
   if(alive.current)setPage(next);
  }catch(e){if(alive.current){setPage(null);setError(e instanceof Error?e.message:'Unable to load closing history.')}}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <section><h3>Bank closing history</h3><button type="button" disabled={busy} onClick={()=>void load(null)}>Load closing history</button>{error&&<p role="alert">{error}</p>}{page&&<><p>Recorded closes and reopening reasons. Bank balances are not independently verified.</p>{page.entries.length===0?<p>No recorded closes for this bank.</p>:<ul>{page.entries.map(entry=><li key={entry.id}><strong>{entry.start} to {entry.end} (exclusive)</strong><p>Opening {bankCloseMoney(entry.opening)} · Closing {bankCloseMoney(entry.closing)}</p><p>{entry.reason===null?'Closed':'Reopened: '+entry.reason}</p><small>Close reference: {entry.id}</small>{entry.reason===null&&onReopen&&<button type="button" disabled={busy} onClick={()=>onReopen(entry.id)}>Select close for reopening</button>}</li>)}</ul>}{page.cursor&&<button type="button" disabled={busy} onClick={()=>void load(page.cursor)}>Next history page</button>}</>}</section>;
}
