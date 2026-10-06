import type {HandoffScope} from './cashier-handoff';
export type UnifiedSaveRequest={id:string;scope:HandoffScope;batch:string;review:Record<string,unknown>};
export function validateUnifiedSaveRequest(request:UnifiedSaveRequest){
 const r=object(request.review),s=request.scope;
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(request.id)||r.schema_version!==1||r.tenant_id!==s.tenant||r.property_id!==s.property||r.actor_id!==s.actor||r.ready_to_commit!==false||r.financial_records_written!==false||object(object(r.assessment).posting_review).batch_id!==request.batch||!Array.isArray(r.allocations)||!r.allocations.length)throw Error('Saved request does not match the reviewed migration.');
 return request;
}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid migration recovery response.');return v as Record<string,unknown>};
const canonical=(v:unknown):string=>{if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';return JSON.stringify(v)};
export function readUnifiedSaveStatus(value:unknown,request:{id:string;scope:HandoffScope;batch:string;review:Record<string,unknown>}){
 const v=object(value),s=request.scope;
 if(v.schema_version!==1||v.tenant_id!==s.tenant||v.property_id!==s.property||v.actor_id!==s.actor||v.request_id!==request.id||typeof v.found!=='boolean'||v.ready_to_commit!==false||v.financial_records_written!==false)throw Error('Migration recovery does not match this request.');
 if(!v.found){if(v.outcome!==null||v.batch_id!==null||v.review!==null||v.reason!==null)throw Error('Unrecorded request contains saved data.');return {outcome:'missing' as const};}
 if(v.outcome==='saved'){
  if(v.batch_id!==request.batch||v.reason!==null||canonical(v.review)!==canonical(request.review))throw Error('Saved migration differs from the reviewed request.');
  return {outcome:'saved' as const};
 }
 if(v.outcome==='cancelled'&&v.batch_id===null&&v.review===null&&typeof v.reason==='string'&&v.reason.trim().length>=4)return {outcome:'cancelled' as const};
 throw Error('Invalid migration recovery outcome.');
}
