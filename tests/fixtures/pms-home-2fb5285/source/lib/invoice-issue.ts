import {guestFormData} from './guests';
import {readInvoiceSources} from './invoice-sources';
type Scope={tenant:string;property:string;reservation:string;actor:string};
export function readInvoiceIssueReceipt(value:unknown,request:ReturnType<typeof prepareInvoiceIssue>){
 const r=value as Record<string,unknown>,a=request.args;
 if(!r||r.schema_version!==1||r.tenant_id!==a.p_tenant||r.property_id!==a.p_property||r.reservation_id!==a.p_reservation||r.actor_id!==request.actor||r.request_id!==a.p_request||r.invoice_id!==a.p_request||r.currency!=='USD'||r.amount_minor!==request.amount_minor||r.due_on!==a.p_due_on||typeof r.replayed!=='boolean')throw Error('Invoice receipt does not match the reviewed request.');
 if(typeof r.number!=='string'||!/^[1-9][0-9]{0,11}$/.test(r.number)||typeof r.issued_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.issued_on)||!Number.isFinite(Date.parse(r.issued_on+'T00:00:00Z'))||new Date(r.issued_on+'T00:00:00Z').toISOString().slice(0,10)!==r.issued_on||r.issued_on>a.p_due_on||typeof r.created_at!=='string'||!Number.isFinite(Date.parse(r.created_at)))throw Error('Invoice receipt has invalid numbering or dates.');
 return {invoice_id:a.p_request,number:r.number,issued_on:r.issued_on,due_on:a.p_due_on,amount_minor:request.amount_minor,replayed:r.replayed};
}
export function prepareInvoiceIssue(scope:Scope,request:string,source:unknown,form:FormData,selections:{source_key:string;amount_minor:string}[]){
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 if(![...Object.values(scope),request].every(v=>uuid.test(v)))throw Error('Invoice request scope is invalid.');
 const preview=readInvoiceSources(source,scope),due=form.get('due_on');
 if(typeof due!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T00:00:00Z'))||new Date(due+'T00:00:00Z').toISOString().slice(0,10)!==due)throw Error('Choose a valid invoice due date.');
 const billing=guestFormData(form,'billing_',true),issuer=guestFormData(form,'issuer_',true);
 if(!(billing.legal_name||billing.company_name)||!(issuer.legal_name||issuer.company_name))throw Error('Issuer and recipient names are required.');
 if(!Array.isArray(selections)||!selections.length||selections.length>10000)throw Error('Select charges to invoice.');
 const seen=new Set<string>();let total=BigInt(0);
 const lines=selections.map(line=>{const original=preview.lines.find(v=>v.source_key===line.source_key);if(!original||seen.has(line.source_key)||typeof line.amount_minor!=='string'||!/^[1-9][0-9]{0,11}$/.test(line.amount_minor)||BigInt(line.amount_minor)>BigInt(original.available_minor))throw Error('Review selected invoice charges.');seen.add(line.source_key);total+=BigInt(line.amount_minor);return {source_key:line.source_key,amount_minor:line.amount_minor};});
 if(total>BigInt('999999999999'))throw Error('Invoice total exceeds supported amount.');
 return {actor:scope.actor,amount_minor:total.toString(),args:{p_tenant:scope.tenant,p_property:scope.property,p_reservation:scope.reservation,p_request:request,p_source_hash:preview.source_hash,p_due_on:due,p_billing_party:billing,p_issuer:issuer,p_lines:lines,p_confirmed:true}};
}
