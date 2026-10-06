import {calculateCashFlow,type CashFlowJournal} from './cash-flow';
import {signedLedgerDecimal} from './profit-loss';
import {reportDecimal,type ReportCell} from './report-export';
export type CashScope={tenant_id:string;property_id:string};
export type CashConfiguration=CashScope&{configured:true;id:string;version:number;cash_account_ids:string[];account_snapshot:{account_id:string;code:string;name:string;kind:'asset';active:boolean}[];reason:string;actor_id:string;created_at:string};
export type NoCashConfiguration=CashScope&{configured:false;version:0};
export type CashReview=CashScope&{id:string;configuration_id:string;journal_id:string;version:number;allocations:NonNullable<CashFlowJournal['allocations']>;reason:string;actor_id:string;created_at:string};
export type CashReportJournal=Omit<CashFlowJournal,"lines">&{posting_date:string;description:string;currency:'USD';source_kind:string;source_id:string;source_version:string;review:CashReview|null;lines:(CashFlowJournal['lines'][number]&{line_no:number})[]};
export type CashReport=CashScope&{start:string;end:string;end_exclusive:true;currency:'USD';configuration:CashConfiguration;opening_minor:string;net_change_minor:string;closing_minor:string;journal_count:number;line_count:number;journals:CashReportJournal[];rows_truncated:false;classification_available:true;totals:ReturnType<typeof calculateCashFlow>};
function bad():never{throw Error('Cash-flow data does not match this property, configuration and period or does not reconcile.');}
const obj=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:bad();
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const version=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
const signed=(v:unknown):v is string=>typeof v==='string'&&/^(0|-?[1-9][0-9]{0,40})$/.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function readCashConfiguration(value:unknown,scope:CashScope):CashConfiguration|NoCashConfiguration{
 const v=obj(value);if(v.tenant_id!==scope.tenant_id||v.property_id!==scope.property_id)bad();
 if(v.configured===false&&v.version===0)return v as NoCashConfiguration;
 if(v.configured!==true||!text(v.id)||!version(v.version)||!text(v.reason)||!text(v.actor_id)||!text(v.created_at)||!Number.isFinite(Date.parse(v.created_at))||!Array.isArray(v.cash_account_ids)||v.cash_account_ids.length<1||v.cash_account_ids.length>100||!v.cash_account_ids.every(text)||new Set(v.cash_account_ids).size!==v.cash_account_ids.length||!Array.isArray(v.account_snapshot)||v.account_snapshot.length!==v.cash_account_ids.length)bad();
 const seen=new Set();for(const item of v.account_snapshot){const a=obj(item);if(!text(a.account_id)||!v.cash_account_ids.includes(a.account_id)||seen.has(a.account_id)||!text(a.code)||!text(a.name)||a.kind!=='asset'||typeof a.active!=='boolean')bad();seen.add(a.account_id);}
 return v as CashConfiguration;
}
export function readCashReport(value:unknown,scope:CashScope&{start:string;end:string;configuration_id:string}):CashReport{
 const v=obj(value);if(v.tenant_id!==scope.tenant_id||v.property_id!==scope.property_id||v.start!==scope.start||v.end!==scope.end||!date(v.start)||!date(v.end)||v.end<=v.start||(Date.parse(v.end)-Date.parse(v.start))/86400000>366||v.end_exclusive!==true||v.currency!=='USD'||v.rows_truncated!==false||v.classification_available!==true||!Array.isArray(v.journals)||v.journals.length>10000||v.journal_count!==v.journals.length||!Number.isSafeInteger(v.line_count)||Number(v.line_count)>100000||!signed(v.opening_minor)||!signed(v.net_change_minor)||!signed(v.closing_minor))bad();
 const configuration=readCashConfiguration(v.configuration,scope);if(!configuration.configured||configuration.id!==scope.configuration_id)bad();
 let count=0;const reviewIds=new Set();
 for(const value of v.journals){const j=obj(value);if(!text(j.id)||!date(j.posting_date)||j.posting_date<v.start||j.posting_date>=v.end||!text(j.description)||j.currency!=='USD'||!text(j.source_kind)||!text(j.source_id)||typeof j.source_version!=='string'||!/^[1-9][0-9]*$/.test(j.source_version)||!Array.isArray(j.lines)||!Array.isArray(j.allocations))bad();
  const lines=new Set();for(const line of j.lines){const l=obj(line);if(!version(l.line_no)||Number(l.line_no)>1000||lines.has(l.line_no))bad();lines.add(l.line_no);count++;}
  if(j.review===null){if(j.allocations.length)bad();}else{const r=obj(j.review);if(r.tenant_id!==scope.tenant_id||r.property_id!==scope.property_id||r.configuration_id!==configuration.id||r.journal_id!==j.id||!text(r.id)||reviewIds.has(r.id)||!version(r.version)||!text(r.reason)||!text(r.actor_id)||!text(r.created_at)||!Number.isFinite(Date.parse(r.created_at))||!Array.isArray(r.allocations)||r.allocations.length!==j.allocations.length)bad();reviewIds.add(r.id);
   for(let i=0;i<r.allocations.length;i++){const a=obj(r.allocations[i]),b=obj(j.allocations[i]);if(a.category!==b.category||a.amount_minor!==b.amount_minor)bad();}
  }
 }
 if(count!==v.line_count)bad();
 const totals=calculateCashFlow(v.journals as CashReportJournal[],configuration.cash_account_ids,v.opening_minor);
 if(totals.net_change_minor!==v.net_change_minor||totals.closing_minor!==v.closing_minor)bad();
 return {...v,configuration,totals} as CashReport;
}
export function cashFlowRows(r:CashReport):ReportCell[][]{
 const money=(value:string)=>reportDecimal(signedLedgerDecimal(value));
 return [['iRatePilot PMS','Cash flow'],['Tenant reference',r.tenant_id],['Property reference',r.property_id],['From',r.start],['Until (exclusive)',r.end],['Currency','USD'],['Configuration reference',r.configuration.id],['Configuration version',String(r.configuration.version)],['Configuration reason',r.configuration.reason],['Configuration reviewed by',r.configuration.actor_id],['Configuration reviewed at',r.configuration.created_at],['Basis','Posted journals and reviewed cash-account designations; unposted activity excluded.'],['Classification',r.totals.classification_complete?'All cash movements classified':'Incomplete: unclassified movements remain'],['Opening cash USD',money(r.opening_minor)],['Operating USD',money(r.totals.categories.operating)],['Investing USD',money(r.totals.categories.investing)],['Financing USD',money(r.totals.categories.financing)],['Unclassified USD',money(r.totals.unclassified_minor)],['Unclassified journal count',String(r.totals.unclassified_journals)],['Net change USD',money(r.net_change_minor)],['Closing cash USD',money(r.closing_minor)],[],['Cash account reference','Code','Name','Active at configuration review'],...r.configuration.account_snapshot.map(a=>[a.account_id,a.code,a.name,String(a.active)]),[],['Journal reference','Posting date','Description','Status','Cash change USD','Review reference','Review version','Review reason','Review actor','Review time'],...r.journals.map((j,i)=>[j.id,j.posting_date,j.description,r.totals.rows[i].status,money(r.totals.rows[i].cash_change_minor),j.review?.id??'',j.review?String(j.review.version):'',j.review?.reason??'',j.review?.actor_id??'',j.review?.created_at??'']),[],['Journal reference','Category','Signed flow USD'],...r.journals.flatMap(j=>(j.allocations??[]).map(a=>[j.id,a.category,money(a.amount_minor)]))];
}

