import type {PaymentScope} from './billing-payment-entry';
export type MatchRequest=PaymentScope&{version:1;request:string;invoice:string;payment:string;amount:string;cancellation?:string};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
export function matchRequest(value:unknown,scope:PaymentScope):MatchRequest{
 const r=value as MatchRequest;
 if(!r||r.version!==1||(['actor','tenant','property','account'] as const).some(k=>r[k]!==scope[k]||!uuid(r[k]))||!uuid(r.request)||!uuid(r.invoice)||!uuid(r.payment)||typeof r.amount!=='string'||!/^[1-9][0-9]{0,11}$/.test(r.amount))throw Error('Saved invoice match could not be verified.');if(r.cancellation!==undefined&&(typeof r.cancellation!=='string'||r.cancellation!==r.cancellation.trim()||r.cancellation.length<4||r.cancellation.length>500))throw Error('Enter a cancellation reason of 4–500 characters.');return r;
}
export function matchResult(value:unknown,r:MatchRequest,status=false):'matched'|'cancelled'|null{
 const v=value as Record<string,unknown>;
 if(!v||v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.account_id!==r.account||v.request_id!==r.request||v.currency!=='USD'||v.money_moved!==false||(status&&typeof v.found!=='boolean'))throw Error('Invoice match response could not be verified.');
 if(status&&v.found===false){if(v.allocation!==null)throw Error('Unexpected invoice match result.');return null}
 const a=v.allocation as Record<string,unknown>;
 if(!a||!uuid(a.id)||a.invoice_id!==r.invoice||a.payment_id!==r.payment||a.amount_minor!==r.amount||a.money_moved!==false||typeof a.cancelled!=='boolean')throw Error('Invoice match details differ.');return a.cancelled?'cancelled':'matched';
}
