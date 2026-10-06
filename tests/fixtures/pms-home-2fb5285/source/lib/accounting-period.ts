export type PeriodReview={schema_version:2;tenant_id:string;property_id:string;period_id:string;start_date:string;end_date_exclusive:string;closed:boolean;currency:'USD';journal_count:number;journal_fingerprint:string;debit_minor:string;credit_minor:string;pending_service_count:number;pending_correction_count:number;pending_payment_count:number;basis:'recorded_journals_service_and_payment_sources';review_token:string};
export function readPeriodReview(value:unknown,tenant:string,property:string,period:string):PeriodReview{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Period review unavailable.');const v=value as PeriodReview;
 const date=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 const amount=(s:unknown)=>typeof s==='string'&&/^(0|[1-9][0-9]{0,39})$/.test(s);
 if(v.schema_version!==2||v.tenant_id!==tenant||v.property_id!==property||v.period_id!==period||v.currency!=='USD'||v.basis!=='recorded_journals_service_and_payment_sources'||typeof v.closed!=='boolean'||!date(v.start_date)||!date(v.end_date_exclusive)||v.start_date>=v.end_date_exclusive||![v.journal_count,v.pending_service_count,v.pending_correction_count,v.pending_payment_count].every(n=>Number.isSafeInteger(n)&&n>=0)||![v.journal_fingerprint,v.review_token].every(s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s))||!amount(v.debit_minor)||!amount(v.credit_minor))throw Error('Period review does not match the selected accounting period.');
 return v;
}

