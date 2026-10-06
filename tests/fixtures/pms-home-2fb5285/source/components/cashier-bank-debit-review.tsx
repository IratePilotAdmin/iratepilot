"use client";
import {useEffect,useRef,useState} from 'react';
import {hotelClient,hotelRpc,usd} from '@/lib/pilot';
import type {HandoffScope} from '@/lib/cashier-handoff';
import {readAccountingSetup,type AccountingSetup} from '@/lib/accounting';
import {readCashierLedgerMappings} from '@/lib/cashier-ledger-mappings';
import {readBankDebitPreview} from '@/lib/cashier-bank-debit';
import {CashierLedgerMappingSelect} from './cashier-ledger-mapping-select';
import {CashierLedgerPeriodSelect} from './cashier-ledger-period-select';
import {CashierBankDebitAction} from './cashier-bank-debit-action';
type Mapping=ReturnType<typeof readCashierLedgerMappings>['entries'][number];
export function CashierBankDebitReview({scope,statement,bank,amount}:{scope:HandoffScope;statement:string;bank:string;amount:string}){
 const [mapping,setMapping]=useState<Mapping|null>(null),[setup,setSetup]=useState<AccountingSetup|null>(null),[expense,setExpense]=useState(''),[posting,setPosting]=useState<{period:string;date:string}|null>(null),[preview,setPreview]=useState<Record<string,unknown>|null>(null),[pending,setPending]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const alive=useRef(false),lock=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const selection=mapping&&expense&&posting?{scope,statement,mapping:mapping.id,expense,bank:mapping.bank.id,amount,...posting}:null;
 async function run(kind:'accounts'|'preview'){if(lock.current||pending)return;lock.current=true;setBusy(true);setError('');setPreview(null);if(kind==='accounts'){setExpense('');setSetup(null)}try{const user=await hotelClient().auth.getUser();if(user.error||user.data.user?.id!==scope.actor)throw Error('Sign-in changed. Refresh bank statements.');
 const args={p_tenant:scope.tenant,p_property:scope.property};let accounts:AccountingSetup|null=null,result:Record<string,unknown>|null=null;
 if(kind==='accounts')accounts=readAccountingSetup(await hotelRpc('gl_setup',args),scope.tenant,scope.property);else{if(!selection)throw Error('Choose accounts and a posting date.');result=readBankDebitPreview(await hotelRpc('preview_bank_debit',{...args,p_statement:statement,p_mapping:selection.mapping,p_expense:selection.expense,p_period:selection.period,p_date:selection.date}),selection)}
 const again=await hotelClient().auth.getUser();if(again.error||again.data.user?.id!==scope.actor)throw Error('Sign-in changed. Refresh bank statements.');if(alive.current){if(accounts)setSetup(accounts);if(result)setPreview(result)}
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Unable to prepare bank expense.')}finally{lock.current=false;if(alive.current)setBusy(false)}}
 return <details><summary>Post bank debit expense</summary><p>Statement debit: {usd(Number(amount))}. Use this for bank fees or other expenses that have not already been recorded.</p><CashierLedgerMappingSelect scope={scope} bank={bank} disabled={busy||pending} onSelect={v=>{setMapping(v);setPreview(null)}}/><button type="button" disabled={busy||pending} onClick={()=>void run('accounts')}>Load expense accounts</button>{setup&&<label>Expense account<select disabled={busy||pending} value={expense} onChange={e=>{setExpense(e.target.value);setPreview(null)}}><option value="">Choose an expense account</option>{setup.accounts.filter(a=>a.active&&a.kind==='expense').map(a=><option key={a.account_id} value={a.account_id}>{a.code} {a.name}</option>)}</select></label>}<CashierLedgerPeriodSelect scope={scope} disabled={busy||pending} onSelect={v=>{setPosting(v);setPreview(null)}}/><button type="button" disabled={!selection||busy||pending} onClick={()=>void run('preview')}>Preview bank expense</button>{error&&<p role="alert">{error}</p>}{preview&&<section aria-label="Bank expense preview"><p>Debit {setup?.accounts.find(a=>a.account_id===expense)?.name}: {usd(Number(amount))}</p><p>Credit {mapping?.bank.name}: {usd(Number(amount))}</p><p>Posting date: {posting?.date}</p></section>}<CashierBankDebitAction scope={scope} statement={statement} selection={selection} preview={preview} onPending={setPending}/></details>
}
