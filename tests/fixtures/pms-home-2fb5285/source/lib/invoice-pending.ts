type Scope={tenant:string;property:string;reservation:string;actor:string};
type Pending=Scope&{request:string;amount_minor:string;due_on:string};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function readPendingInvoiceStatus(value:unknown,pending:Pending){
 const r=value as Record<string,unknown>;
 if(!r||r.schema_version!==1||r.tenant_id!==pending.tenant||r.property_id!==pending.property||r.actor_id!==pending.actor||r.request_id!==pending.request||typeof r.found!=='boolean')throw Error('Invoice recovery response changed.');
 if(!r.found){if(r.result!==null)throw Error('Invalid missing invoice receipt.');return null;}
 const receipt=r.result as Record<string,unknown>;
 if(!receipt||receipt.schema_version!==1||receipt.tenant_id!==pending.tenant||receipt.property_id!==pending.property||receipt.actor_id!==pending.actor||receipt.reservation_id!==pending.reservation||receipt.request_id!==pending.request||receipt.invoice_id!==pending.request||receipt.amount_minor!==pending.amount_minor||receipt.due_on!==pending.due_on||receipt.currency!=='USD'||receipt.replayed!==true||typeof receipt.number!=='string'||!/^[1-9][0-9]{0,11}$/.test(receipt.number))throw Error('Recovered invoice does not match the saved request.');
 return {invoice_id:pending.request,number:receipt.number,amount_minor:pending.amount_minor};
}
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function key(scope:Scope){if(!Object.values(scope).every(v=>uuid.test(v)))throw Error('Invalid pending invoice scope.');return 'irp.invoice.pending.v1:'+ [scope.tenant,scope.property,scope.reservation,scope.actor].join(':');}
function validate(value:unknown,scope:Scope):Pending{
 const r=value as Pending;if(!r||typeof r!=='object'||Object.entries(scope).some(([k,v])=>r[k as keyof Scope]!==v)||typeof r.request!=='string'||!uuid.test(r.request)||typeof r.amount_minor!=='string'||!/^[1-9][0-9]{0,11}$/.test(r.amount_minor)||typeof r.due_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.due_on)||!Number.isFinite(Date.parse(r.due_on+'T00:00:00Z'))||new Date(r.due_on+'T00:00:00Z').toISOString().slice(0,10)!==r.due_on)throw Error('Saved invoice request is invalid. Keep it for recovery.');
 return {...scope,request:r.request,amount_minor:r.amount_minor,due_on:r.due_on};
}
/** Store only the receipt lookup fields, never guest addresses or internal folio data. */
export function savePendingInvoice(store:Store,scope:Scope,value:Pending){const storageKey=key(scope),pending=validate(value,scope),existing=store.getItem(storageKey);if(existing!==null){const saved=validate(JSON.parse(existing),scope);if(JSON.stringify(saved)!==JSON.stringify(pending))throw Error('Resolve the existing invoice request first.');}
 const encoded=JSON.stringify(pending);store.setItem(storageKey,encoded);if(store.getItem(storageKey)!==encoded)throw Error('Unable to preserve the invoice request.');return pending;
}
export function loadPendingInvoice(store:Store,scope:Scope){const raw=store.getItem(key(scope));return raw===null?null:validate(JSON.parse(raw),scope);}
/** Clear only after the caller has validated a matching server receipt. */
export function clearPendingInvoice(store:Store,scope:Scope,request:string){const saved=loadPendingInvoice(store,scope);if(saved&&saved.request!==request)throw Error('A different invoice request is pending.');store.removeItem(key(scope));if(store.getItem(key(scope))!==null)throw Error('Unable to clear the recovered invoice request.');}
