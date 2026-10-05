import {validateAdjustmentRequest, type AdjustmentLine} from '@/lib/accounting-adjustment-request';
export type JournalDetail = {
  schema_version:1;tenant_id:string;property_id:string;journal_id:string;request_id:string;
  period_id:string;posting_date:string;currency:'USD';description:string;
  source_kind:string;source_id:string;source_version:number;created_at:string;created_by:string;
  reversal_of:string|null;direct_reversal_id:string|null;
  lines:(AdjustmentLine & {line_no:number;account_code:string;current_account_name:string;account_kind:string})[];
  debit_total_minor:string;credit_total_minor:string;
};
const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function readJournalDetail(value:unknown,tenant:string,property:string,journal:string):JournalDetail {
  if(!value||typeof value!=='object')throw Error('Journal details unavailable.');
  const v=value as JournalDetail;
  if(v.schema_version!==1||v.tenant_id!==tenant||v.property_id!==property||v.journal_id!==journal||v.currency!=='USD'||![v.journal_id,v.request_id,v.period_id,v.source_id,v.created_by].every(uuid))throw Error('Journal does not match this property and reference.');
  if(typeof v.source_kind!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(v.source_kind)||!Number.isSafeInteger(v.source_version)||v.source_version<1||typeof v.created_at!=='string'||!Number.isFinite(Date.parse(v.created_at))||!(v.reversal_of===null||uuid(v.reversal_of))||!(v.direct_reversal_id===null||uuid(v.direct_reversal_id)))throw Error('Invalid journal history.');
  if(!Array.isArray(v.lines))throw Error('Journal lines unavailable.');
  const lines=v.lines.map((line,index)=>{
    if(!line||line.line_no!==index+1||typeof line.account_code!=='string'||typeof line.current_account_name!=='string'||!['asset','liability','equity','income','expense'].includes(line.account_kind))throw Error('Invalid journal line details.');
    return {account_id:line.account_id,side:line.side,amount_minor:line.amount_minor};
  });
  validateAdjustmentRequest({version:1,actor:v.created_by,tenant,property,request:v.request_id,command:{period_id:v.period_id,posting_date:v.posting_date,currency:'USD',description:v.description,source_kind:'manual_journal',source_id:v.request_id,source_version:1,lines}});
  let debit=BigInt(0),credit=BigInt(0);
  for(const line of lines){if(line.side==='debit')debit+=BigInt(line.amount_minor);else credit+=BigInt(line.amount_minor);}
  if(v.debit_total_minor!==debit.toString()||v.credit_total_minor!==credit.toString())throw Error('Journal totals do not match its lines.');
  return v;
}
