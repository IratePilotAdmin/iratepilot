import type {HandoffScope} from './cashier-handoff';
export type BankCloseRequest={id:string;kind:'close'|'reopen';bank:string;review:Record<string,unknown>|null;close:string|null;reason:string|null};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export function readBankCloseRequest(value:unknown,scope:HandoffScope,bank:string):BankCloseRequest {
 if(!value||typeof value!=='object')throw Error('Invalid saved bank request.');const p=value as BankCloseRequest;
 if(!uuid(p.id)||p.bank!==bank||!uuid(bank))throw Error('Saved bank request belongs to another bank.');
 if(p.kind==='close') {
  const r=p.review;if(!r||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||r.bank_id!==bank||p.close!==null||p.reason!==null)throw Error('Saved closing review does not match this property.');
 } else if(p.kind==='reopen') {
  if(!uuid(p.close)||p.review!==null||typeof p.reason!=='string'||p.reason!==p.reason.trim()||p.reason.length<4||p.reason.length>500||/[\u0000-\u001f\u007f]/.test(p.reason))throw Error('Saved reopening request is invalid.');
 } else throw Error('Invalid saved bank request type.');
 return p;
}
export function readBankCloseReceipt(value:unknown,p:BankCloseRequest,scope:HandoffScope){
 if(!value||typeof value!=='object')throw Error('Invalid bank request receipt.');const r=value as Record<string,unknown>;
 if(r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||typeof r.replayed!=='boolean')throw Error('Bank receipt belongs to another user or property.');
 if(p.kind==='close') {
  if(r.id!==p.id||r.bank_id!==p.bank||r.bank_verified!==false||!same(r.review,p.review))throw Error('Closing receipt does not match the saved request.');
 }else if(r.request_id!==p.id||r.close_id!==p.close||r.reason!==p.reason)throw Error('Reopening receipt does not match the saved request.');
 return r;
}
function same(a:unknown,b:unknown):boolean {
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x);return keys.length===Object.keys(y).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(y,k)&&same(x[k],y[k]));
}
export function readBankCloseRequestStatus(value:unknown,p:BankCloseRequest,scope:HandoffScope){
 if(!value||typeof value!=='object')throw Error('Invalid bank request status.');const r=value as Record<string,unknown>;
 if(r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||r.request_id!==p.id||r.kind!==p.kind||typeof r.found!=='boolean'||typeof r.cancelled!=='boolean'||typeof r.close_reopened!=='boolean'||r.found&&r.cancelled)throw Error('Bank request status does not match.');
 if(r.found)readBankCloseReceipt(r.result,p,scope);else if(r.result!==null)throw Error('Unexpected bank request result.');
 return {found:r.found,cancelled:r.cancelled,reopened:r.close_reopened};
}
