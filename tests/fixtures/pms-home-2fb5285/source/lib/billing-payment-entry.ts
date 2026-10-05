export type PaymentScope={actor:string;tenant:string;property:string;account:string};
export type PaymentSource={payment_id:string;reference:string;method:'cash'|'external';amount_minor:string;reduced_minor:string;allocated_minor:string;available_minor:string};
export function paymentSources(value:unknown,scope:PaymentScope):PaymentSource[]{
 const v=value as {schema_version:number;tenant_id:string;property_id:string;account_id:string;currency:string;complete:boolean;money_moved:boolean;receipts:PaymentSource[]};
 if(!v||v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.account_id!==scope.account||v.currency!=='USD'||v.complete!==true||v.money_moved!==false||!Array.isArray(v.receipts)||v.receipts.length>10000)fail();
 const seen=new Set<string>();for(const r of v.receipts){if(!r||!uuid(r.payment_id)||seen.has(r.payment_id)||typeof r.reference!=='string'||!['cash','external'].includes(r.method)||[r.amount_minor,r.reduced_minor,r.allocated_minor,r.available_minor].some(x=>typeof x!=='string'||!/^(0|[1-9][0-9]{0,14})$/.test(x)))fail();if(BigInt(r.amount_minor)!==BigInt(r.reduced_minor)+BigInt(r.allocated_minor)+BigInt(r.available_minor))fail();seen.add(r.payment_id)}return v.receipts;
}
export type PaymentRequest=PaymentScope&{version:1;request:string;method:'external'|'cash';session:string|null;kind:'external_payment'|'external_refund';amount:string;target:string|null;reference:string;reason:string;cancellation?:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v===v.trim()&&v.length>=4&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
function fail():never{throw Error('Payment details could not be verified. Check the saved request before continuing.')}
export function paymentRequest(value:unknown,scope:PaymentScope):PaymentRequest{
 const r=value as PaymentRequest;
 if(!r||r.version!==1||(['actor','tenant','property','account'] as const).some(k=>r[k]!==scope[k]||!uuid(r[k]))||!uuid(r.request)||!['external','cash'].includes(r.method)||(r.method==='cash'?!uuid(r.session):r.session!==null)||!['external_payment','external_refund'].includes(r.kind)||(r.kind==='external_refund'?!uuid(r.target):r.target!==null)||typeof r.amount!=='string'||! /^[1-9][0-9]{0,11}$/.test(r.amount)||!text(r.reference,200)||!text(r.reason,500)||(r.cancellation!==undefined&&!text(r.cancellation,500)))fail();
 return r;
}
export function paymentArgs(r:PaymentRequest){return {p_tenant:r.tenant,p_property:r.property,p_account:r.account,p_request:r.request,p_method:r.method,p_session:r.session,p_kind:r.kind,p_amount:r.amount,p_target:r.target,p_reference:r.reference,p_reason:r.reason,p_confirmed:true}}
export function paymentReceipt(value:unknown,r:PaymentRequest):string{
 const v=value as Record<string,unknown>,p=v?.payment as Record<string,unknown>;
 if(!v||v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.account_id!==r.account||v.request_id!==r.request||v.method!==r.method||v.session_id!==r.session||v.currency!=='USD'||v.money_moved!==false||!p||!uuid(p.id)||p.account_id!==r.account||p.kind!==r.kind||p.amount_minor!==r.amount||p.target_id!==r.target||p.money_moved!==false)fail();return p.id as string;
}
export function paymentStatus(value:unknown,r:PaymentRequest):string|null{
 const v=value as Record<string,unknown>;
 if(!v||v.tenant_id!==r.tenant||v.property_id!==r.property||v.account_id!==r.account||v.request_id!==r.request||typeof v.found!=='boolean')fail();
 if(!v.found){if(v.payload!==null||v.receipt!==null)fail();return null}
 const expected={account_id:r.account,method:r.method,session_id:r.session,kind:r.kind,amount_minor:r.amount,target_id:r.target,reference:r.reference,reason:r.reason};
 const p=v.payload as Record<string,unknown>;if(!p||Object.keys(p).length!==Object.keys(expected).length||Object.entries(expected).some(([k,x])=>p[k]!==x))fail();return paymentReceipt(v.receipt,r);
}
