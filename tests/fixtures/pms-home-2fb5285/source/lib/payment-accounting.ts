import type {AdjustmentLine} from './accounting-adjustment-request';
export type PaymentScope={actor:string;tenant:string;property:string};
export type PaymentAllocation={account_id:string;amount_minor:string};
export type PaymentReview={schema_version:1;tenant_id:string;property_id:string;actor_id:string;role:string;reservation_id:string;entry_id:string;source_date:string;source_kind:'external_payment'|'external_refund'|'payment_correction';amount_minor:string;clearing_account_id:string;allocations:PaymentAllocation[];accounts:{id:string;code:string;name:string;kind:string}[];target_entry_id:string|null;remaining_allocations:{account_id:string;available_minor:string}[]|null;basis:'recorded_external_payment';verifies_settlement:false;period:{id:string;starts_on:string;ends_before:string};command:{currency:'USD';description:string;lines:AdjustmentLine[];period_id:string;posting_date:string;source_id:string;source_kind:'folio_payment';source_version:1}};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const amount=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,11}$/.test(v);
export function readPaymentReview(value:unknown,scope:PaymentScope):PaymentReview{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Payment review unavailable.');
 const r=value as PaymentReview,c=r.command;
 if(![scope.actor,scope.tenant,scope.property].every(uuid)||r.schema_version!==1||r.actor_id!==scope.actor||r.tenant_id!==scope.tenant||r.property_id!==scope.property||!['owner','manager'].includes(r.role)||![r.reservation_id,r.entry_id,r.clearing_account_id].every(uuid)||!date(r.source_date)||!amount(r.amount_minor)||r.basis!=='recorded_external_payment'||r.verifies_settlement!==false)throw Error('Payment review scope or source is invalid.');
 const incoming=r.source_kind==='external_payment';
 if(!['external_payment','external_refund','payment_correction'].includes(r.source_kind)||!c||c.currency!=='USD'||c.source_kind!=='folio_payment'||c.source_id!==r.entry_id||c.source_version!==1||!uuid(c.period_id)||!date(c.posting_date)||c.posting_date<r.source_date||!r.period||r.period.id!==c.period_id||!date(r.period.starts_on)||!date(r.period.ends_before)||c.posting_date<r.period.starts_on||c.posting_date>=r.period.ends_before)throw Error('Payment review period or journal source is invalid.');
 const description=incoming?'Recorded external payment':r.source_kind==='external_refund'?'Recorded external refund':'Recorded payment correction';
 if(c.description!==description||!Array.isArray(r.allocations)||r.allocations.length<1||r.allocations.length>20||!Array.isArray(c.lines)||c.lines.length!==r.allocations.length+1||!Array.isArray(r.accounts)||r.accounts.length!==c.lines.length)throw Error('Payment review allocations are incomplete.');
 const first=c.lines[0];if(!first||first.account_id!==r.clearing_account_id||first.amount_minor!==r.amount_minor||first.side!==(incoming?'debit':'credit'))throw Error('Payment clearing line does not match.');
 const seen=new Set([r.clearing_account_id]);let total=BigInt(0);
 r.allocations.forEach((a,i)=>{const line=c.lines[i+1];if(!a||!uuid(a.account_id)||seen.has(a.account_id)||!amount(a.amount_minor)||!line||line.account_id!==a.account_id||line.amount_minor!==a.amount_minor||line.side!==(incoming?'credit':'debit'))throw Error('Payment allocation does not match its journal line.');seen.add(a.account_id);total+=BigInt(a.amount_minor);});
 if(total!==BigInt(r.amount_minor))throw Error('Payment allocations do not equal the source amount.');
 r.accounts.forEach((a,i)=>{if(!a||a.id!==c.lines[i].account_id||typeof a.code!=='string'||typeof a.name!=='string'||(i===0?a.kind!=='asset':!['asset','liability'].includes(a.kind)))throw Error('Payment account details do not match.');});
 if(incoming){if(r.target_entry_id!==null||r.remaining_allocations!==null)throw Error('Unexpected payment adjustment linkage.');}
 else{if(!uuid(r.target_entry_id)||r.target_entry_id===r.entry_id||!Array.isArray(r.remaining_allocations)||r.remaining_allocations.length!==r.allocations.length)throw Error('Payment adjustment linkage missing.');r.remaining_allocations.forEach((a,i)=>{if(!a||a.account_id!==r.allocations[i].account_id||!amount(a.available_minor)||BigInt(a.available_minor)<BigInt(r.allocations[i].amount_minor))throw Error('Payment adjustment exceeds the available allocation.');});}
 if(new TextEncoder().encode(JSON.stringify(r)).length>65536)throw Error('Payment review is too large.');return r;
}

export type PaymentRequest=PaymentScope&{version:1;request:string;review:PaymentReview};
const canonical=(v:unknown):string=>Array.isArray(v)?JSON.stringify(v.map(canonical)):v&&typeof v==='object'?JSON.stringify(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])])):JSON.stringify(v);
export function paymentRequestKey(s:PaymentScope){if(![s.actor,s.tenant,s.property].every(uuid))throw Error('Verified payment accounting scope required.');return `iratepilot-pms-payment-journal:${s.actor}:${s.tenant}:${s.property}`;}
export function validatePaymentRequest(value:unknown):PaymentRequest{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid saved payment request.');const r=value as PaymentRequest;
 if(Object.keys(r).sort().join(',')!=='actor,property,request,review,tenant,version'||r.version!==1||!uuid(r.request))throw Error('Invalid payment request identity.');paymentRequestKey(r);readPaymentReview(r.review,r);return r;
}
export function readPaymentRequest(storage:Pick<Storage,'getItem'>,scope:PaymentScope){const raw=storage.getItem(paymentRequestKey(scope));if(raw===null)return null;if(raw.length>70000)throw Error('Saved payment request is too large.');const r=validatePaymentRequest(JSON.parse(raw));if(r.actor!==scope.actor||r.tenant!==scope.tenant||r.property!==scope.property)throw Error('Saved payment request belongs to another property or account.');return r;}
export function retainPaymentRequest(storage:Pick<Storage,'getItem'|'setItem'>,request:PaymentRequest){const r=validatePaymentRequest(request),key=paymentRequestKey(r),prior=storage.getItem(key),raw=JSON.stringify(r);if(prior!==null&&canonical(validatePaymentRequest(JSON.parse(prior)))!==canonical(r))throw Error('Recover the previous payment request before starting another.');storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('Unable to retain the payment request for recovery.');}
export function clearPaymentRequest(storage:Pick<Storage,'getItem'|'removeItem'>,request:PaymentRequest){const r=validatePaymentRequest(request),key=paymentRequestKey(r),prior=storage.getItem(key);if(prior===null)return;if(canonical(validatePaymentRequest(JSON.parse(prior)))!==canonical(r))throw Error('A different payment request is retained.');storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('Unable to clear the recovered payment request.');}
export function paymentRequestParams(r:PaymentRequest){validatePaymentRequest(r);return {p_tenant:r.tenant,p_property:r.property,p_request:r.request,p_review:r.review,p_confirmed:true};}
export function matchesPaymentReceipt(value:unknown,r:PaymentRequest):boolean{
 validatePaymentRequest(r);if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
 return v.schema_version===1&&v.tenant_id===r.tenant&&v.property_id===r.property&&v.actor_id===r.actor&&v.request_id===r.request&&uuid(v.journal_id)&&v.entry_id===r.review.entry_id&&v.reservation_id===r.review.reservation_id&&v.amount_minor===r.review.amount_minor&&v.verifies_settlement===false&&typeof v.replayed==='boolean';
}
export function paymentRequestStatus(value:unknown,r:PaymentRequest):'missing'|'posted'{
 validatePaymentRequest(r);if(!value||typeof value!=='object')throw Error('Payment recovery response unavailable.');const v=value as Record<string,unknown>;
 if(v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.actor_id!==r.actor||v.request_id!==r.request||typeof v.found!=='boolean')throw Error('Payment recovery scope does not match.');
 if(v.found){if(canonical(v.review)!==canonical(r.review)||!matchesPaymentReceipt(v.result,r))throw Error('Saved payment receipt does not match the retained review.');return 'posted';}
 if(v.review!==null||v.result!==null)throw Error('Unexpected data in missing payment receipt.');return 'missing';
}
export function paymentRetirementStatus(value:unknown,r:PaymentRequest):'missing'|'retired'{
 validatePaymentRequest(r);if(!value||typeof value!=='object')throw Error('Payment cancellation response unavailable.');const v=value as Record<string,unknown>;
 if(v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.actor_id!==r.actor||v.request_id!==r.request||typeof v.retired!=='boolean')throw Error('Payment cancellation scope does not match.');
 if(v.retired){if(canonical(v.review)!==canonical(r.review))throw Error('Cancelled payment request does not match the retained review.');return 'retired';}
 if(v.review!==null)throw Error('Unexpected data in missing cancellation receipt.');return 'missing';
}

export type PaymentSource={entry_id:string;reservation_id:string;kind:PaymentReview['source_kind'];amount_minor:string;created_at:string;source_date:string;target_entry_id:string|null;reservation_reference:string;journal_id:string|null;original_posting:null|{journal_id:string;clearing_account_id:string;allocations:PaymentAllocation[]}};
export type PaymentSources={schema_version:1;tenant_id:string;property_id:string;actor_id:string;start_date:string;end_date_exclusive:string;complete:true;rows:PaymentSource[]};
export function readPaymentSources(value:unknown,scope:PaymentScope,start:string,end:string):PaymentSources{
 if(!value||typeof value!=='object')throw Error('Payment records unavailable.');const v=value as PaymentSources;
 if(!date(start)||!date(end)||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>31*86400000||v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.actor_id!==scope.actor||v.start_date!==start||v.end_date_exclusive!==end||v.complete!==true||!Array.isArray(v.rows)||v.rows.length>500)throw Error('Payment record scope or dates do not match.');
 const seen=new Set<string>();for(const row of v.rows){if(!row||!uuid(row.entry_id)||seen.has(row.entry_id)||!uuid(row.reservation_id)||!['external_payment','external_refund','payment_correction'].includes(row.kind)||!amount(row.amount_minor)||!date(row.source_date)||row.source_date<start||row.source_date>=end||typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at))||typeof row.reservation_reference!=='string'||!(row.journal_id===null||uuid(row.journal_id))||(row.kind==='external_payment'?row.target_entry_id!==null:!uuid(row.target_entry_id)))throw Error('Invalid payment source record.');seen.add(row.entry_id);
 if(row.original_posting!==null){const o=row.original_posting;if(row.kind==='external_payment'||!o||!uuid(o.journal_id)||!uuid(o.clearing_account_id)||!Array.isArray(o.allocations)||!o.allocations.length||o.allocations.length>20)throw Error('Invalid original payment allocation.');const ids=new Set([o.clearing_account_id]);for(const a of o.allocations){if(!a||!uuid(a.account_id)||ids.has(a.account_id)||!amount(a.amount_minor))throw Error('Invalid original payment allocation.');ids.add(a.account_id);}}
 }return v;
}
