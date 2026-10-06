import type {BillingPostingDraft} from '@/components/billing-posting-review';
import type {PaymentScope} from './billing-payment-entry';
export type BillingPostingRequest=BillingPostingDraft&{version:1;request:string;cancellation?:string};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const money=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,11}$/.test(v);
function fail():never{throw Error('Ledger posting details could not be verified.')}
export function postingRequest(value:unknown,scope:PaymentScope):BillingPostingRequest{
 const r=value as BillingPostingRequest;
 if(!r||r.version!==1||(['actor','tenant','property','account'] as const).some(k=>r[k]!==scope[k]||!uuid(r[k]))||![r.request,r.payment,r.clearing,r.period].every(uuid)||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date||typeof r.description!=='string'||r.description!==r.description.trim()||r.description.length<4||r.description.length>500||!Array.isArray(r.allocations)||r.allocations.length<1||r.allocations.length>20)fail();
 if(r.accountLabels!==undefined&&(!r.accountLabels||typeof r.accountLabels!=='object'||Array.isArray(r.accountLabels)||Object.entries(r.accountLabels).some(([id,label])=>!uuid(id)||typeof label!=='string'||!label.trim()||label.length>500)))fail();
 if(r.cancellation!==undefined&&(typeof r.cancellation!=='string'||r.cancellation!==r.cancellation.trim()||r.cancellation.length<4||r.cancellation.length>500))fail();
 const v=r.review,lines=v?.lines as {account_id:string;side:string;amount_minor:string}[];
 if(!v||v.tenant_id!==r.tenant||v.property_id!==r.property||v.account_id!==r.account||v.payment_id!==r.payment||v.currency!=='USD'||v.source_kind!=='billing_account_payment'||v.source_version!==1||v.posted!==false||!['external_payment','external_refund','payment_correction'].includes(String(v.payment_kind))||!money(v.amount_minor)||!Array.isArray(lines)||lines.length!==r.allocations.length+1)fail();
 const incoming=v.payment_kind==='external_payment';if(incoming?v.target_id!==null:!uuid(v.target_id))fail();
 const seen=new Set([r.clearing]);let total=0n;
 for(const [i,a] of r.allocations.entries()){if(!a||!uuid(a.account_id)||seen.has(a.account_id)||!money(a.amount_minor))fail();seen.add(a.account_id);total+=BigInt(a.amount_minor);const l=lines[i+1];if(!l||l.account_id!==a.account_id||l.amount_minor!==a.amount_minor||l.side!==(incoming?'credit':'debit'))fail()}
 if(total!==BigInt(v.amount_minor)||lines[0]?.account_id!==r.clearing||lines[0]?.amount_minor!==v.amount_minor||lines[0]?.side!==(incoming?'debit':'credit'))fail();return r;
}
export function postingPayload(r:BillingPostingRequest){return {account_id:r.account,payment_id:r.payment,clearing:r.clearing,allocations:r.allocations,review:r.review,period:r.period,date:r.date,description:r.description}}
export function postingResult(value:unknown,r:BillingPostingRequest,status=false):string|null{
 const v=value as Record<string,unknown>;if(!v||v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.account_id!==r.account||v.request_id!==r.request||v.money_moved!==false)fail();
 if(status){if(typeof v.found!=='boolean')fail();if(!v.found){if(v.payload!==null||v.journal_id!==null)fail();return null}
  const equal=(a:unknown,b:unknown):boolean=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&equal(x[k],y[k]))};if(!equal(v.payload,postingPayload(r)))fail();
 }else if(v.payment_id!==r.payment)fail();if(!uuid(v.journal_id))fail();return v.journal_id as string;
}
