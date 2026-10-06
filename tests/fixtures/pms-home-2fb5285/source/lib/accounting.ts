export type TrialBalanceAccount = {
 account_id:string; account_code:string; account_kind:string;
 opening_debit_minor:string; opening_credit_minor:string;
 period_debit_minor:string; period_credit_minor:string;
 closing_debit_minor:string; closing_credit_minor:string;
};
export type TrialBalance = {schema_version:1;tenant_id:string;property_id:string;currency:'USD';start_date:string;end_date_exclusive:string;accounts:TrialBalanceAccount[];account_count:number;basis:'recorded_general_ledger_journals'};
const amountKeys=['opening_debit_minor','opening_credit_minor','period_debit_minor','period_credit_minor','closing_debit_minor','closing_credit_minor'] as const;
function minor(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,39})$/.test(value)}
export function accountingUsd(value:string){
 if(!minor(value))throw Error('Invalid accounting amount.');
 const padded=value.padStart(3,'0');
 return '$'+padded.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+padded.slice(-2);
}
export function readTrialBalance(value:unknown,scope:{tenant_id:string;property_id:string;start:string;end:string}):TrialBalance{
 if(!value||typeof value!=='object')throw Error('Accounting report is unavailable.');
 const v=value as TrialBalance;
 if(v.schema_version!==1||v.tenant_id!==scope.tenant_id||v.property_id!==scope.property_id||v.start_date!==scope.start||v.end_date_exclusive!==scope.end||v.currency!=='USD'||v.basis!=='recorded_general_ledger_journals'||!Array.isArray(v.accounts)||v.account_count!==v.accounts.length)throw Error('Accounting report does not match this property and date range.');
 const ids=new Set<string>();
 for(const row of v.accounts){
  if(!row||typeof row!=='object'||typeof row.account_id!=='string'||!row.account_id||ids.has(row.account_id)||typeof row.account_code!=='string'||!row.account_code||!['asset','liability','equity','income','expense'].includes(row.account_kind)||!amountKeys.every(k=>minor(row[k])))throw Error('Accounting report contains invalid account data.');
  ids.add(row.account_id);
  const opening=BigInt(row.opening_debit_minor)-BigInt(row.opening_credit_minor);
  const change=BigInt(row.period_debit_minor)-BigInt(row.period_credit_minor);
  const closing=BigInt(row.closing_debit_minor)-BigInt(row.closing_credit_minor);
  if(opening+change!==closing)throw Error('Accounting report balances do not reconcile.');
 }
 for(const prefix of ['opening','period','closing'] as const){
  const debit=v.accounts.reduce((sum,row)=>sum+BigInt(row[`${prefix}_debit_minor`]),BigInt(0));
  const credit=v.accounts.reduce((sum,row)=>sum+BigInt(row[`${prefix}_credit_minor`]),BigInt(0));
  if(debit!==credit)throw Error('Accounting report debits and credits do not reconcile.');
 }
 return v;
}

export function trialBalanceRows(report:TrialBalance):string[][]{
 const decimal=(value:string)=>{if(!minor(value))throw Error('Invalid accounting amount.');const digits=value.padStart(3,'0');return digits.slice(0,-2)+'.'+digits.slice(-2);};
 return [
 ['iRatePilot PMS','Trial balance'],['Tenant reference',report.tenant_id],['Property reference',report.property_id],['From',report.start_date],['Until (exclusive)',report.end_date_exclusive],['Currency','USD'],['Basis','Posted general-ledger journals'],[],
 ['Account reference','Account code','Type','Opening debit USD','Opening credit USD','Activity debit USD','Activity credit USD','Closing debit USD','Closing credit USD'],
 ...report.accounts.map(row=>[row.account_id,row.account_code,row.account_kind,...amountKeys.map(key=>decimal(row[key]))])
 ];
}
export type AccountingSetup={schema_version:1;tenant_id:string;property_id:string;currency:'USD';accounts:{account_id:string;code:string;name:string;kind:string;active:boolean}[];periods:{period_id:string;start_date:string;end_date_exclusive:string;closed:boolean}[];current_mapping:null|{mapping_id:string;version:number;components:Record<string,string>}};
export function readAccountingSetup(value:unknown,tenant:string,property:string):AccountingSetup{
 if(!value||typeof value!=='object')throw Error('Accounting setup is unavailable.');
 const v=value as AccountingSetup;
 if(v.schema_version!==1||v.tenant_id!==tenant||v.property_id!==property||v.currency!=='USD'||!Array.isArray(v.accounts)||!Array.isArray(v.periods))throw Error('Accounting setup does not match this property.');
 const accounts=new Set<string>();
 for(const a of v.accounts){if(!a||typeof a.account_id!=='string'||!a.account_id||accounts.has(a.account_id)||typeof a.code!=='string'||typeof a.name!=='string'||typeof a.active!=='boolean'||!['asset','liability','equity','income','expense'].includes(a.kind))throw Error('Invalid accounting account.');accounts.add(a.account_id);}
 for(const p of v.periods)if(!p||typeof p.period_id!=='string'||typeof p.start_date!=='string'||typeof p.end_date_exclusive!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.start_date)||!/^\d{4}-\d{2}-\d{2}$/.test(p.end_date_exclusive)||p.end_date_exclusive<=p.start_date||typeof p.closed!=='boolean')throw Error('Invalid accounting period.');
 if(v.current_mapping!==null){const m=v.current_mapping;if(!m||typeof m.mapping_id!=='string'||!Number.isSafeInteger(m.version)||m.version<1||!m.components||typeof m.components!=='object'||Array.isArray(m.components)||!Object.hasOwn(m.components,'receivable')||Object.values(m.components).some(id=>typeof id!=='string'||!accounts.has(id)))throw Error('Invalid accounting mappings.');}
 return v;
}
export type LedgerLine={journal_id:string;request_id:string;posting_date:string;description:string;source_kind:string;source_id:string;source_version:number;reversal_of:string|null;line_no:number;account_id:string;account_code:string;current_account_name:string;account_kind:string;debit_minor:string;credit_minor:string};
export type LedgerReport={schema_version:1;tenant_id:string;property_id:string;currency:'USD';start_date:string;end_date_exclusive:string;basis:'posted_journal_lines';lines:LedgerLine[];line_count:number;debit_total_minor:string;credit_total_minor:string;rows_truncated:false};
export function readLedgerReport(value:unknown,scope:{tenant_id:string;property_id:string;start:string;end:string}):LedgerReport{
 if(!value||typeof value!=='object')throw Error('Ledger report is unavailable.');const v=value as LedgerReport;
 if(v.schema_version!==1||v.tenant_id!==scope.tenant_id||v.property_id!==scope.property_id||v.start_date!==scope.start||v.end_date_exclusive!==scope.end||v.currency!=='USD'||v.basis!=='posted_journal_lines'||v.rows_truncated!==false||!Array.isArray(v.lines)||v.line_count!==v.lines.length||v.lines.length>10000||!minor(v.debit_total_minor)||!minor(v.credit_total_minor))throw Error('Ledger report does not match the requested complete scope.');
 let debit=BigInt(0),credit=BigInt(0);const seen=new Set<string>();const journals=new Map<string,bigint>();
 for(const line of v.lines){
  if(!line||typeof line!=='object'||!['journal_id','request_id','posting_date','description','source_kind','source_id','account_id','account_code','current_account_name','account_kind'].every(k=>typeof (line as unknown as Record<string,unknown>)[k]==='string')||!Number.isSafeInteger(line.line_no)||line.line_no<1||line.line_no>1000||!Number.isSafeInteger(line.source_version)||line.source_version<1||!(line.reversal_of===null||typeof line.reversal_of==='string')||line.posting_date<scope.start||line.posting_date>=scope.end||!minor(line.debit_minor)||!minor(line.credit_minor)||(line.debit_minor==='0')===(line.credit_minor==='0'))throw Error('Invalid ledger line.');
  const key=line.journal_id+'/'+line.line_no;if(seen.has(key))throw Error('Duplicate ledger line.');seen.add(key);
  const d=BigInt(line.debit_minor),c=BigInt(line.credit_minor);debit+=d;credit+=c;journals.set(line.journal_id,(journals.get(line.journal_id)??BigInt(0))+d-c);
 }
 if(debit!==BigInt(v.debit_total_minor)||credit!==BigInt(v.credit_total_minor)||debit!==credit||[...journals.values()].some(n=>n!==BigInt(0)))throw Error('Ledger totals do not reconcile.');return v;
}
export function ledgerReportRows(report:LedgerReport):string[][]{
 const decimal=(v:string)=>accountingUsd(v).replaceAll('$','').replaceAll(',','');
 return [['iRatePilot PMS','General ledger'],['Property reference',report.property_id],['From',report.start_date],['Until (exclusive)',report.end_date_exclusive],['Currency','USD'],[],['Date','Journal','Line','Account','Current account name','Description','Debit USD','Credit USD','Source kind','Source reference','Reversal of'],...report.lines.map(l=>[l.posting_date,l.journal_id,String(l.line_no),l.account_code,l.current_account_name,l.description,decimal(l.debit_minor),decimal(l.credit_minor),l.source_kind,l.source_id,l.reversal_of??''])];
}
export type SourceReconciliation={schema_version:1;tenant_id:string;property_id:string;currency:'USD';start_date:string;end_date_exclusive:string;basis:string;entry_count:number;pending_count:number;posted_count:number;processed_zero_count?:number;processed_empty_count?:number;entries:{service_date:string;reservation_id:string;adjustment_id?:string;source_total_minor:string;status:'pending'|'posted'|'processed_zero'|'processed_empty';request_id:string|null;journal_id:string|null;mapping_id:string|null;mapping_version:number|null;posting_date:string|null}[]};
export function readSourceReconciliation(value:unknown,scope:{tenant_id:string;property_id:string;start:string;end:string},corrections:boolean):SourceReconciliation{
 if(!value||typeof value!=='object')throw Error('Reconciliation report unavailable.');const v=value as SourceReconciliation;
 const emptyStatus=corrections?'processed_empty':'processed_zero';
 if(v.schema_version!==1||v.tenant_id!==scope.tenant_id||v.property_id!==scope.property_id||v.start_date!==scope.start||v.end_date_exclusive!==scope.end||v.currency!=='USD'||v.basis!==(corrections?'saved_service_forward_entries':'saved_service_day_entries')||!Array.isArray(v.entries)||v.entries.length>10000||v.entry_count!==v.entries.length)throw Error('Reconciliation report does not match this property and period.');
 const seen=new Set<string>();let pending=0,posted=0,empty=0;
 for(const e of v.entries){
  if(!e||typeof e.service_date!=='string'||e.service_date<scope.start||e.service_date>=scope.end||typeof e.reservation_id!=='string'||typeof e.source_total_minor!=='string'||! /^(0|-?[1-9][0-9]{0,11})$/.test(e.source_total_minor)||(!corrections&&e.source_total_minor.startsWith('-')))throw Error('Invalid reconciliation source.');
  const key=corrections?e.adjustment_id:e.service_date+'/'+e.reservation_id;if(typeof key!=='string'||!key||seen.has(key))throw Error('Duplicate or invalid reconciliation identity.');seen.add(key);
  if(e.status==='pending'){pending++;if(e.request_id!==null||e.journal_id!==null)throw Error('Invalid pending source receipt.');}
  else if(e.status==='posted'){posted++;if(typeof e.request_id!=='string'||typeof e.journal_id!=='string')throw Error('Missing posted source receipt.');}
  else if(e.status===emptyStatus){empty++;if(e.source_total_minor!=='0'||e.journal_id!==null||typeof e.request_id!=='string')throw Error('Invalid empty source receipt.');}
  else throw Error('Unknown reconciliation state.');
 }
 if(v.pending_count!==pending||v.posted_count!==posted||(corrections?v.processed_empty_count:v.processed_zero_count)!==empty)throw Error('Reconciliation counts do not match.');return v;
}
export type PostingPreview={schema_version:1;tenant_id:string;property_id:string;actor_id:string;reservation_id:string;service_date:string;adjustment_id?:string;mapping_id:string;mapping_version:number;period_id:string;posting_date:string;currency:'USD';total_minor:string;already_processed:boolean;existing_request_id:string|null;existing_journal_id:string|null;lines:{component:string;account_id:string;account_code:string;current_account_name:string;side:'debit'|'credit';amount_minor:string}[]};
export function readPostingPreview(value:unknown,expected:{tenant_id:string;property_id:string;reservation_id:string;service_date:string;adjustment_id?:string;mapping_id:string;period_id:string;posting_date:string}):PostingPreview{
 if(!value||typeof value!=='object')throw Error('Posting preview unavailable.');const v=value as PostingPreview;
 if(v.schema_version!==1||v.currency!=='USD'||!Object.entries(expected).every(([k,x])=>(v as unknown as Record<string,unknown>)[k]===x)||typeof v.actor_id!=='string'||!Number.isSafeInteger(v.mapping_version)||v.mapping_version<1||typeof v.already_processed!=='boolean'||!Array.isArray(v.lines)||v.lines.length>1000||typeof v.total_minor!=='string'||!/^(0|-?[1-9][0-9]{0,11})$/.test(v.total_minor))throw Error('Posting preview does not match the selected source.');
 let balance=BigInt(0);for(const l of v.lines){if(!l||typeof l.component!=='string'||typeof l.account_id!=='string'||typeof l.account_code!=='string'||typeof l.current_account_name!=='string'||!['debit','credit'].includes(l.side)||!minor(l.amount_minor)||l.amount_minor==='0')throw Error('Invalid posting preview line.');balance+=(l.side==='debit'?BigInt(1):-BigInt(1))*BigInt(l.amount_minor);}
 if(balance!==BigInt(0)||(v.lines.length===0&&v.total_minor!=='0')||v.lines.length===1)throw Error('Posting preview does not balance.');return v;
}
