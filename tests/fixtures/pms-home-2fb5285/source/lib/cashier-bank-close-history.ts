import type {HandoffScope} from './cashier-handoff';
export function readBankCloseHistory(value:unknown,scope:HandoffScope,bank:string,before:string|null) {
 const fail=()=>{throw Error('Closing history does not match this bank.');};
 if(!value||typeof value!=='object')return fail();const r=value as Record<string,unknown>;
 if(r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||r.bank_id!==bank||r.bank_verified!==false||!Array.isArray(r.entries)||r.entries.length>50||typeof r.has_more!=='boolean')return fail();
 let previous=before;const entries=r.entries.map((item:unknown)=>{
  if(!item||typeof item!=='object')return fail();const e=item as Record<string,unknown>,review=e.review as Record<string,unknown>|null,reopening=e.reopening as Record<string,unknown>|null;
  if(typeof e.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(e.id)||previous!==null&&e.id>=previous||e.tenant_id!==scope.tenant||e.property_id!==scope.property||e.bank_id!==bank||typeof e.start_date!=='string'||typeof e.end_date!=='string'||e.start_date>=e.end_date||!review||review.tenant_id!==scope.tenant||review.property_id!==scope.property||review.bank_id!==bank||review.start_date!==e.start_date||review.end_date_exclusive!==e.end_date||typeof review.opening_minor!=='string'||! /^-?\d+$/.test(review.opening_minor)||typeof review.closing_minor!=='string'||! /^-?\d+$/.test(review.closing_minor))return fail();
  if(reopening!==null&&(!reopening||reopening.tenant_id!==scope.tenant||reopening.property_id!==scope.property||reopening.close_id!==e.id||typeof reopening.reason!=='string'))return fail();
  previous=e.id;return {id:e.id,start:e.start_date,end:e.end_date,opening:review.opening_minor,closing:review.closing_minor,reason:reopening===null?null:reopening.reason as string};
 });
 if(r.has_more?(entries.length!==50||r.next_cursor!==previous):r.next_cursor!==null)return fail();
 return {entries,cursor:r.has_more?previous:null};
}
