'use client';
import {useMemo,useState} from 'react';
import type {Membership} from '@/lib/pilot';
import type {SetupCommand} from '@/lib/accounting-setup-request';
import {AccountingSetupAction} from '@/components/accounting-setup-action';
export function AccountingSetupForm({membership}:{membership:Membership}){
 const [kind,setKind]=useState('account'),[code,setCode]=useState(''),[name,setName]=useState(''),[accountKind,setAccountKind]=useState('asset'),[start,setStart]=useState(''),[end,setEnd]=useState('');
 const command=useMemo<SetupCommand>(()=>kind==='account'?{kind:'account',code,name,accountKind}:{kind:'period',start,end},[kind,code,name,accountKind,start,end]);
 if(membership.role!=='owner')return <AccountingSetupAction membership={membership} preview={null}/>;
 return <section aria-label="Create accounting setup"><h3>Add account or period</h3><label className="field">Create<select value={kind} onChange={e=>setKind(e.target.value)}><option value="account">Account</option><option value="period">Accounting period</option></select></label>{kind==='account'?<><label className="field">Account code<input value={code} maxLength={32} onChange={e=>setCode(e.target.value)}/></label><label className="field">Account name<input value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label><label className="field">Account type<select value={accountKind} onChange={e=>setAccountKind(e.target.value)}>{['asset','liability','equity','income','expense'].map(k=><option key={k}>{k}</option>)}</select></label></>:<><label className="field">Period starts<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="field">Period ends (excluded)<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><p>The end date belongs to the next period. Existing periods cannot overlap.</p></>}<AccountingSetupAction membership={membership} preview={command}/></section>;
}
