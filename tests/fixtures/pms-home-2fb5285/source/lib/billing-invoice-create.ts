export const invoiceAddressFields=[['address_line1','Address line 1',200],['address_line2','Address line 2',200],['city','City',100],['region','State / region',100],['postal_code','Postal code',32],['country_code','Country code (2 letters)',2],['tax_identifier','Tax ID / VAT number (optional)',80]] as const;
export type InvoiceParty={legal_name:string}&Partial<Record<typeof invoiceAddressFields[number][0],string>>;
export type InvoiceScope={actor:string;tenant:string;property:string;account:string};
export type InvoiceLine={route_id:string;reservation_id:string;source_booking_id:string;source_key:string;available_minor:string;transferred_minor:string;invoiced_minor:string;credited_minor:string};
export type InvoiceReview={schema_version:1;tenant_id:string;property_id:string;account_id:string;account_name:string;property_name:string;business_date:string;currency:'USD';available_minor:string;review_hash:string;lines:InvoiceLine[];money_moved:false;invoice_issued:false};
export type InvoiceRequest=InvoiceScope&{version:1;request:string;due:string;bill:InvoiceParty;issuer:InvoiceParty;lines:{route_id:string;amount_minor:string}[];hash:string;total:string;cancellation?:string};
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const money=(x:unknown):x is string=>typeof x==='string'&&/^(0|[1-9][0-9]{0,14})$/.test(x);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const name=(x:unknown):x is string=>typeof x==='string'&&x===x.trim()&&x.length>0&&x.length<=200;
function validParty(value:unknown):value is InvoiceParty{if(!value||typeof value!=='object'||Array.isArray(value))return false;const p=value as Record<string,unknown>;if(!name(p.legal_name)||/[\x00-\x1f\x7f]/.test(p.legal_name))return false;return Object.entries(p).every(([key,v])=>{if(key==='legal_name')return true;const field=invoiceAddressFields.find(f=>f[0]===key);return !!field&&typeof v==='string'&&v.length>0&&v===v.trim()&&v.length<=field[2]&&!/[\x00-\x1f\x7f]/.test(v)&&(key!=='country_code'||/^[A-Z]{2}$/.test(v))})}
function fail():never{throw Error('Invoice details could not be verified. Refresh before continuing.')}
export function invoiceReview(value:unknown,scope:InvoiceScope):InvoiceReview{
 const v=value as InvoiceReview;
 if(!v||v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.account_id!==scope.account||v.currency!=='USD'||v.money_moved!==false||v.invoice_issued!==false||!name(v.account_name)||!name(v.property_name)||!date(v.business_date)||!money(v.available_minor)||!/^([a-f0-9]{64})$/.test(v.review_hash??'')||!Array.isArray(v.lines)||v.lines.length>10000)fail();
 let total=0n;const seen=new Set<string>();
 for(const l of v.lines){if(!l||!uuid(l.route_id)||!uuid(l.reservation_id)||seen.has(l.route_id)||typeof l.source_booking_id!=='string'||typeof l.source_key!=='string'||!money(l.available_minor)||!money(l.transferred_minor)||!money(l.invoiced_minor)||!money(l.credited_minor)||BigInt(l.credited_minor)>BigInt(l.invoiced_minor)||BigInt(l.available_minor)<=0n||BigInt(l.available_minor)+BigInt(l.invoiced_minor)-BigInt(l.credited_minor)!==BigInt(l.transferred_minor))fail();seen.add(l.route_id);total+=BigInt(l.available_minor)}
 if(total!==BigInt(v.available_minor))fail();return v;
}
export function invoiceRequest(value:unknown,scope:InvoiceScope):InvoiceRequest{
 const v=value as InvoiceRequest;if(!v||v.version!==1||(['actor','tenant','property','account'] as const).some(key=>v[key]!==scope[key])||!uuid(v.request)||!date(v.due)||!validParty(v.bill)||!validParty(v.issuer)||!money(v.total)||!/^([a-f0-9]{64})$/.test(v.hash??'')||!Array.isArray(v.lines)||!v.lines.length||v.lines.length>10000)fail();
 let total=0n;const seen=new Set<string>();for(const l of v.lines){if(!l||!uuid(l.route_id)||seen.has(l.route_id)||!money(l.amount_minor)||BigInt(l.amount_minor)<=0n)fail();seen.add(l.route_id);total+=BigInt(l.amount_minor)}
 if(total!==BigInt(v.total)||total>999999999999n)fail();if(v.cancellation!==undefined&&(typeof v.cancellation!=='string'||v.cancellation.trim()!==v.cancellation||v.cancellation.length<4||v.cancellation.length>500))fail();return v;
}
export function invoiceArgs(r:InvoiceRequest){return {p_tenant:r.tenant,p_property:r.property,p_account:r.account,p_request:r.request,p_due:r.due,p_bill:r.bill,p_issuer:r.issuer,p_lines:r.lines,p_review_hash:r.hash,p_confirmed:true}}
export function invoiceReceipt(value:unknown,r:InvoiceRequest):string{
 const v=value as Record<string,unknown>;if(!v||v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.account_id!==r.account||v.request_id!==r.request||v.invoice_id!==r.request||v.amount_minor!==r.total||v.currency!=='USD'||v.due_on!==r.due||v.review_hash!==r.hash||v.money_moved!==false||typeof v.invoice_number!=='string'||!/^BILL-[1-9][0-9]*$/.test(v.invoice_number))fail();return v.invoice_number;
}
export function invoiceStatus(value:unknown,r:InvoiceRequest):string|null{
 const v=value as {tenant_id:string;property_id:string;account_id:string;request_id:string;found:boolean;payload:Record<string,unknown>|null;receipt:unknown};
 if(!v||v.tenant_id!==r.tenant||v.property_id!==r.property||v.account_id!==r.account||v.request_id!==r.request||typeof v.found!=='boolean')fail();
 if(!v.found){if(v.payload!==null||v.receipt!==null)fail();return null}
 const equal=(a:unknown,b:unknown):boolean=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&equal(x[k],y[k]))};
 if(!equal(v.payload,{account_id:r.account,due_on:r.due,billing_party:r.bill,issuer:r.issuer,lines:r.lines,review_hash:r.hash}))fail();return invoiceReceipt(v.receipt,r);
}
