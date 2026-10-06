"use client";
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc} from '@/lib/pilot';
import type {HandoffScope} from '@/lib/cashier-handoff';
import {readCashierLedgerMappings} from '@/lib/cashier-ledger-mappings';
import {CashierLedgerMappingCreate} from './cashier-ledger-mapping-create';
type Mapping=ReturnType<typeof readCashierLedgerMappings>['entries'][number];
type Props={scope:HandoffScope;bank:string;disabled?:boolean;onSelect:(mapping:Mapping|null)=>void};
export function CashierLedgerMappingSelect(props:Props){return <Selector key={[props.scope.tenant,props.scope.property,props.scope.actor,props.bank].join(':')} {...props}/>}
function Selector({scope,bank,disabled=false,onSelect}:Props){
 const [page,setPage]=useState<ReturnType<typeof readCashierLedgerMappings>|null>(null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(false),lock=useRef(false),callback=useRef(onSelect);callback.current=onSelect;
 useEffect(()=>{alive.current=true;callback.current(null);return()=>{alive.current=false}},[]);
 async function load(next=false){if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');setSelected('');callback.current(null);const before=next?page?.next??null:null;
 try{const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen deposit accounting.');
 const response=await hotelRpc('cashier_bank_ledger_mappings',{p_tenant:scope.tenant,p_property:scope.property,p_bank:bank,p_before:before});
 const result=readCashierLedgerMappings(response,scope,bank,before),again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==scope.actor)throw Error('Sign-in changed. Reopen deposit accounting.');if(alive.current)setPage(result);
 }catch(e){if(alive.current){setPage(null);setError(e instanceof Error?e.message:'Unable to load ledger accounts.')}}finally{lock.current=false;if(alive.current)setBusy(false)}}
 return <><CashierLedgerMappingCreate scope={scope} bank={bank} disabled={disabled||busy} onSaved={()=>{setPage(null);setSelected('');callback.current(null)}}/><fieldset disabled={disabled||busy}><legend>Deposit ledger accounts</legend><button type="button" onClick={()=>void load()}>Load ledger accounts</button>{error&&<p role="alert">{error}</p>}{page&&<>{page.entries.length?<label>Account configuration<select value={selected} onChange={e=>{const mapping=page.entries.find(m=>m.id===e.target.value&&m.usable)??null;setSelected(mapping?.id??'');callback.current(mapping)}}><option value="">Choose accounts</option>{page.entries.map(m=><option key={m.id} value={m.id} disabled={!m.usable}>{m.custody.code} {m.custody.name} → {m.transit.code} {m.transit.name} → {m.bank.code} {m.bank.name}{m.usable?'':' (inactive account)'}</option>)}</select></label>:<p>No ledger accounts are configured for this bank.</p>}{page.next&&<button type="button" onClick={()=>void load(true)}>Next account configurations</button>}</>}</fieldset></>
}
