import {readInvoicePaymentOptions} from './invoice-payment-options';
type Scope={tenant:string;property:string;invoice:string;actor:string};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
function pendingKey(scope:Scope){const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;if(!Object.values(scope).every(v=>uuid.test(v)))throw Error('Invalid allocation workspace.');return 'irp.invoice.allocation.v1:'+ [scope.tenant,scope.property,scope.invoice,scope.actor].join(':');}
function savedAllocation(value:unknown,scope:Scope):ReturnType<typeof prepareInvoiceAllocation>{
 const r=value as ReturnType<typeof prepareInvoiceAllocation>,a=r?.args,uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 if(!a||r.actor!==scope.actor||a.p_tenant!==scope.tenant||a.p_property!==scope.property||a.p_invoice!==scope.invoice||typeof a.p_request!=='string'||!uuid.test(a.p_request)||typeof a.p_entry!=='string'||!uuid.test(a.p_entry)||!Number.isSafeInteger(a.p_amount_minor)||a.p_amount_minor<1||a.p_amount_minor>999999999999||a.p_confirmed!==true||typeof a.p_reason!=='string'||a.p_reason!==a.p_reason.trim()||a.p_reason.length<4||a.p_reason.length>500||Array.from(a.p_reason).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||typeof a.p_effective_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(a.p_effective_on)||!Number.isFinite(Date.parse(a.p_effective_on+'T00:00:00Z'))||new Date(a.p_effective_on+'T00:00:00Z').toISOString().slice(0,10)!==a.p_effective_on)throw Error('Saved allocation request is invalid. Preserve it for recovery.');
 return {actor:scope.actor,args:{p_tenant:scope.tenant,p_property:scope.property,p_request:a.p_request,p_invoice:scope.invoice,p_entry:a.p_entry,p_effective_on:a.p_effective_on,p_amount_minor:a.p_amount_minor,p_reason:a.p_reason,p_confirmed:true}};
}
export function loadPendingAllocation(store:Store,scope:Scope){const raw=store.getItem(pendingKey(scope));return raw===null?null:savedAllocation(JSON.parse(raw),scope);}
export function savePendingAllocation(store:Store,scope:Scope,request:ReturnType<typeof prepareInvoiceAllocation>){const saved=savedAllocation(request,scope),existing=loadPendingAllocation(store,scope),encoded=JSON.stringify(saved);if(existing&&JSON.stringify(existing)!==encoded)throw Error('Resolve the existing allocation first.');const key=pendingKey(scope);store.setItem(key,encoded);if(store.getItem(key)!==encoded)throw Error('Unable to preserve allocation request.');return saved;}
export function clearPendingAllocation(store:Store,scope:Scope,request:string){const existing=loadPendingAllocation(store,scope);if(existing&&existing.args.p_request!==request)throw Error('A different allocation is pending.');store.removeItem(pendingKey(scope));if(store.getItem(pendingKey(scope))!==null)throw Error('Unable to clear allocation request.');}
export function prepareInvoiceAllocation(scope:Scope,request:string,options:unknown,input:{entry:string;amount:string;effective_on:string;reason:string}){
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;if(![...Object.values(scope),request,input.entry].every(v=>uuid.test(v)))throw Error('Invalid invoice allocation scope.');
 const review=readInvoicePaymentOptions(options,scope),payment=review.payments.find(p=>p.entry_id===input.entry);
 if(!/^\d{1,10}(\.\d{1,2})?$/.test(input.amount))throw Error('Enter a payment amount with at most two decimal places.');
 const [whole,fraction='']=input.amount.split('.'),amount=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
 if(!payment||amount<=BigInt(0)||amount>BigInt(payment.maximum_minor))throw Error('Allocation exceeds the available payment or invoice balance.');
 const date=input.effective_on;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Choose a valid allocation date.');
 const reason=input.reason.trim();if(reason.length<4||reason.length>500||Array.from(reason).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))throw Error('Enter an allocation reason between 4 and 500 characters.');
 return {actor:scope.actor,args:{p_tenant:scope.tenant,p_property:scope.property,p_request:request,p_invoice:scope.invoice,p_entry:input.entry,p_effective_on:date,p_amount_minor:Number(amount),p_reason:reason,p_confirmed:true}};
}
export function readInvoiceAllocationReceipt(value:unknown,request:ReturnType<typeof prepareInvoiceAllocation>){
 const r=value as Record<string,unknown>,a=request.args;
 if(!r||r.schema_version!==1||r.tenant_id!==a.p_tenant||r.property_id!==a.p_property||r.actor_id!==request.actor||r.request_id!==a.p_request||r.invoice_id!==a.p_invoice||r.entry_id!==a.p_entry||r.effective_on!==a.p_effective_on||r.amount_minor!==String(a.p_amount_minor)||r.reason!==a.p_reason||typeof r.replayed!=='boolean')throw Error('Allocation receipt does not match the reviewed payment.');
 return {request:a.p_request,amount_minor:String(a.p_amount_minor),replayed:r.replayed};
}
