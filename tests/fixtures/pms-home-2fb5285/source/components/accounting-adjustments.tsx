'use client';
import {useEffect,useState} from 'react';
import {hotelRpc,type Membership} from '@/lib/pilot';
import {readAccountingSetup,type AccountingSetup} from '@/lib/accounting';
import {readJournalDetail,type JournalDetail} from '@/lib/accounting-journal';
import {AccountingManualForm} from '@/components/accounting-manual-form';
import {AccountingReversalForm} from '@/components/accounting-reversal-form';
import {AccountingAdjustmentAction} from '@/components/accounting-adjustment-action';
export function AccountingAdjustments({membership,businessDate,journalId}:{membership:Membership;businessDate:string;journalId?:string}){
  const {tenant_id,property_id,role}=membership;
  const [loaded,setLoaded]=useState<{setup:AccountingSetup;journal:JournalDetail|null;journalId:string|undefined}|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0);
  const permitted=role==='owner'||role==='manager';
  useEffect(()=>{let current=true;setLoaded(null);setError('');setBusy(permitted);
    if(permitted)Promise.all([
      hotelRpc<unknown>('gl_setup',{p_tenant:tenant_id,p_property:property_id}),
      journalId?hotelRpc<unknown>('gl_journal_detail',{p_tenant:tenant_id,p_property:property_id,p_journal:journalId}):Promise.resolve(null)
    ]).then(([setup,journal])=>{const result={setup:readAccountingSetup(setup,tenant_id,property_id),journal:journalId?readJournalDetail(journal,tenant_id,property_id,journalId):null,journalId};if(current)setLoaded(result);})
      .catch(cause=>{if(current)setError(cause instanceof Error?cause.message:'Unable to load adjustment details.');})
      .finally(()=>{if(current)setBusy(false);});
    return()=>{current=false;};
  },[tenant_id,property_id,permitted,journalId,revision]);
  const visible=permitted&&!busy&&!error&&loaded?.setup.tenant_id===tenant_id&&loaded.setup.property_id===property_id&&loaded.journalId===journalId?loaded:null;
  return <section className="card pilot-reports"><h2>Accounting adjustments</h2>
    {permitted&&<button className="secondary" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Refresh adjustment workspace</button>}
    {busy&&permitted&&<p role="status">Loading accounts and journal details…</p>}{error&&<p role="alert" className="pilot-error">{error}</p>}
    {visible?(visible.journal?<AccountingReversalForm key={tenant_id+'/'+property_id+'/'+journalId+'/'+revision} membership={membership} setup={visible.setup} journal={visible.journal} businessDate={businessDate}/>:<AccountingManualForm key={tenant_id+'/'+property_id+'/'+revision} membership={membership} setup={visible.setup} businessDate={businessDate}/>):!busy&&<AccountingAdjustmentAction membership={membership} preview={null}/>}
  </section>;
}
