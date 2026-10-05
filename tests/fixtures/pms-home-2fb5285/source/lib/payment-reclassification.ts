import type {PaymentScope} from './payment-accounting';
import type {AdjustmentLine} from './accounting-adjustment-request';
export type AllocationState={tenant_id:string;property_id:string;entry_id:string;reservation_id:string;original_journal_id:string;clearing_account_id:string;original_amount_minor:string;available_minor:string;allocations:{account_id:string;allocated_minor:string;adjusted_minor:string;available_minor:string}[]};
export type AllocationView=AllocationState&{schema_version:1;actor_id:string;role:string};
export type TransferReview={schema_version:1;tenant_id:string;property_id:string;actor_id:string;role:string;entry_id:string;from_account_id:string;to_account_id:string;amount_minor:string;allocation_state:AllocationState;latest_posting_date:string;period:{id:string;start:string;end_exclusive:string};accounts:{id:string;code:string;name:string;kind:string}[];command:{currency:'USD';description:string;period_id:string;posting_date:string;source_kind:'payment_reclassification';source_id:string;source_version:number;lines:AdjustmentLine[]}};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const money=(v:unknown,zero=true):v is string=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,11})$/:/^[1-9][0-9]{0,11}$/).test(v);
function allocationState(value:unknown,scope:PaymentScope,entry:string):AllocationState{
 if(!value||typeof value!=='object')throw Error('Payment allocations unavailable.');const s=value as AllocationState;
 if(![scope.tenant,scope.property,scope.actor,entry,s.reservation_id,s.original_journal_id,s.clearing_account_id].every(uuid)||s.tenant_id!==scope.tenant||s.property_id!==scope.property||s.entry_id!==entry||!money(s.original_amount_minor,false)||!money(s.available_minor)||!Array.isArray(s.allocations)||!s.allocations.length||s.allocations.length>20)throw Error('Payment allocation scope is invalid.');
 let allocated=BigInt(0),available=BigInt(0);const seen=new Set([s.clearing_account_id]);for(const a of s.allocations){if(!a||!uuid(a.account_id)||seen.has(a.account_id)||!money(a.allocated_minor)||!money(a.adjusted_minor)||!money(a.available_minor)||BigInt(a.allocated_minor)-BigInt(a.adjusted_minor)!==BigInt(a.available_minor))throw Error('Payment allocation does not reconcile.');seen.add(a.account_id);allocated+=BigInt(a.allocated_minor);available+=BigInt(a.available_minor);}
 if(allocated!==BigInt(s.original_amount_minor)||available!==BigInt(s.available_minor))throw Error('Payment allocation totals do not match.');return s;
}
export function readAllocationView(value:unknown,scope:PaymentScope,entry:string):AllocationView{allocationState(value,scope,entry);const v=value as AllocationView;if(v.schema_version!==1||v.actor_id!==scope.actor||!['owner','manager'].includes(v.role))throw Error('Payment allocation access changed.');return v;}
export function readTransferReview(value:unknown,scope:PaymentScope):TransferReview{
 if(!value||typeof value!=='object')throw Error('Transfer review unavailable.');const r=value as TransferReview,c=r.command;
 if(r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||!['owner','manager'].includes(r.role)||![r.entry_id,r.from_account_id,r.to_account_id].every(uuid)||r.from_account_id===r.to_account_id||!money(r.amount_minor,false))throw Error('Transfer review scope is invalid.');
 const s=allocationState(r.allocation_state,scope,r.entry_id),from=s.allocations.find(a=>a.account_id===r.from_account_id);if(r.to_account_id===s.clearing_account_id||!from||BigInt(r.amount_minor)>BigInt(from.available_minor))throw Error('Transfer exceeds the available control allocation.');
 if(!c||c.currency!=='USD'||c.source_kind!=='payment_reclassification'||c.source_id!==r.entry_id||!Number.isSafeInteger(c.source_version)||c.source_version<1||!uuid(c.period_id)||!date(c.posting_date)||!date(r.latest_posting_date)||c.posting_date<r.latest_posting_date||!r.period||r.period.id!==c.period_id||!date(r.period.start)||!date(r.period.end_exclusive)||c.posting_date<r.period.start||c.posting_date>=r.period.end_exclusive||typeof c.description!=='string'||c.description.trim()!==c.description||c.description.length<1||c.description.length>500||/[\x00-\x1f\x7f]/.test(c.description))throw Error('Transfer period or reason is invalid.');
 if(!Array.isArray(c.lines)||c.lines.length!==2||!Array.isArray(r.accounts)||r.accounts.length!==2)throw Error('Transfer needs two reviewed accounts.');
 for(let i=0;i<2;i++){const id=i===0?r.from_account_id:r.to_account_id,line=c.lines[i],account=r.accounts[i];if(!line||line.account_id!==id||line.side!==(i===0?'debit':'credit')||line.amount_minor!==r.amount_minor||!account||account.id!==id||typeof account.code!=='string'||typeof account.name!=='string'||!['asset','liability'].includes(account.kind))throw Error('Transfer lines do not match the reviewed accounts.');}
 if(new TextEncoder().encode(JSON.stringify(r)).length>65536)throw Error('Transfer review is too large.');return r;
}

export type TransferRequest=PaymentScope&{version:1;request:string;review:TransferReview};
const canonical=(v:unknown):string=>Array.isArray(v)?JSON.stringify(v.map(canonical)):v&&typeof v==='object'?JSON.stringify(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])])):JSON.stringify(v);
export function transferRequestKey(s:PaymentScope){if(![s.actor,s.tenant,s.property].every(uuid))throw Error('Verified transfer accounting scope required.');return `iratepilot-pms-payment-transfer:${s.actor}:${s.tenant}:${s.property}`;}
export function validateTransferRequest(value:unknown):TransferRequest{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid saved transfer request.');const r=value as TransferRequest;
 if(Object.keys(r).sort().join(',')!=='actor,property,request,review,tenant,version'||r.version!==1||!uuid(r.request))throw Error('Invalid transfer request identity.');transferRequestKey(r);readTransferReview(r.review,r);return r;
}
export function readTransferRequest(storage:Pick<Storage,'getItem'>,scope:PaymentScope){const raw=storage.getItem(transferRequestKey(scope));if(raw===null)return null;if(raw.length>70000)throw Error('Saved transfer request is too large.');const r=validateTransferRequest(JSON.parse(raw));if(r.actor!==scope.actor||r.tenant!==scope.tenant||r.property!==scope.property)throw Error('Saved transfer request belongs to another property or account.');return r;}
export function retainTransferRequest(storage:Pick<Storage,'getItem'|'setItem'>,request:TransferRequest){const r=validateTransferRequest(request),key=transferRequestKey(r),prior=storage.getItem(key),raw=JSON.stringify(r);if(prior!==null&&canonical(validateTransferRequest(JSON.parse(prior)))!==canonical(r))throw Error('Recover the previous transfer request before starting another.');storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('Unable to retain the transfer request for recovery.');}
export function clearTransferRequest(storage:Pick<Storage,'getItem'|'removeItem'>,request:TransferRequest){const r=validateTransferRequest(request),key=transferRequestKey(r),prior=storage.getItem(key);if(prior===null)return;if(canonical(validateTransferRequest(JSON.parse(prior)))!==canonical(r))throw Error('A different transfer request is retained.');storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('Unable to clear the recovered transfer request.');}
export function transferRequestParams(r:TransferRequest){validateTransferRequest(r);return {p_tenant:r.tenant,p_property:r.property,p_request:r.request,p_review:r.review,p_confirmed:true};}
export function matchesTransferReceipt(value:unknown,r:TransferRequest):boolean{
 validateTransferRequest(r);if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
 return v.schema_version===1&&v.tenant_id===r.tenant&&v.property_id===r.property&&v.actor_id===r.actor&&v.request_id===r.request&&uuid(v.journal_id)&&v.entry_id===r.review.entry_id&&v.from_account_id===r.review.from_account_id&&v.to_account_id===r.review.to_account_id&&v.amount_minor===r.review.amount_minor&&typeof v.replayed==='boolean';
}
export function transferRequestStatus(value:unknown,r:TransferRequest):'missing'|'posted'{
 validateTransferRequest(r);if(!value||typeof value!=='object')throw Error('Transfer recovery response unavailable.');const v=value as Record<string,unknown>;
 if(v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.actor_id!==r.actor||v.request_id!==r.request||typeof v.found!=='boolean')throw Error('Transfer recovery scope does not match.');
 if(v.found){if(canonical(v.review)!==canonical(r.review)||!matchesTransferReceipt(v.result,r))throw Error('Saved transfer receipt does not match the retained review.');return 'posted';}
 if(v.review!==null||v.result!==null)throw Error('Unexpected data in missing transfer receipt.');return 'missing';
}
export function transferRetirementStatus(value:unknown,r:TransferRequest):'missing'|'retired'{
 validateTransferRequest(r);if(!value||typeof value!=='object')throw Error('Transfer cancellation response unavailable.');const v=value as Record<string,unknown>;
 if(v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.actor_id!==r.actor||v.request_id!==r.request||typeof v.retired!=='boolean')throw Error('Transfer cancellation scope does not match.');
 if(v.retired){if(canonical(v.review)!==canonical(r.review))throw Error('Cancelled transfer request does not match the retained review.');return 'retired';}
 if(v.review!==null)throw Error('Unexpected data in missing cancellation receipt.');return 'missing';
}

