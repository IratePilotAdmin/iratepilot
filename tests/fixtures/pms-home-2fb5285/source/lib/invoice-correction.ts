import type {HandoffScope} from './cashier-handoff';
type Target={id:string;amount:string;date:string};
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid invoice correction review.');return v as Record<string,unknown>}
export function validateInvoiceCorrectionReview(value:unknown,scope:HandoffScope,reservation:string,target:Target,period:string,date:string){
 const v=object(value),a=object(v.application),p=object(v.period),invoice=object(v.invoice_document);
 const isoDate=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 if(!isoDate(date)||!isoDate(target.date)||!isoDate(p.starts_on)||!isoDate(p.ends_before)||date<target.date||date<p.starts_on||date>=p.ends_before||!/^[1-9][0-9]{0,11}$/.test(target.amount)||invoice.tenant_id!==scope.tenant||invoice.property_id!==scope.property||invoice.actor_id!==scope.actor||invoice.invoice_id!==a.invoice_id||invoice.reservation_id!==reservation)throw Error('Invoice correction dates or invoice identity do not match.');
 if(v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.actor_id!==scope.actor||v.effective_on!==date||v.moves_money!==false||v.ready_to_post!==false||v.restored_opening_minor!==target.amount||v.reopened_invoice_minor!==target.amount||a.id!==target.id||a.tenant_id!==scope.tenant||a.property_id!==scope.property||a.reservation_id!==reservation||a.amount_minor!==Number(target.amount)||a.effective_on!==target.date||p.id!==period||p.tenant_id!==scope.tenant||p.property_id!==scope.property||p.closed!==false)throw Error('Invoice correction review does not match the selected activity.');
 return v;
}
export function sameCorrectionReview(a:unknown,b:unknown):boolean{
 const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([x],[y])=>x.localeCompare(y)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v)??'undefined';
 return canonical(a)===canonical(b);
}
