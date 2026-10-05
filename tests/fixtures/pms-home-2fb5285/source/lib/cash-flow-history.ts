import type {CashReview,CashScope} from './cash-flow-report';
export type CashHistoryScope=CashScope&{configuration_id:string;journal_id:string};
export function readCashHistory(value:unknown,scope:CashHistoryScope):CashReview[]{
 const fail=():never=>{throw Error('Classification history is incomplete or does not match this property and journal.');};
 const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
 const v=object(value),matches=(r:Record<string,unknown>)=>Object.entries(scope).every(([k,id])=>r[k]===id);
 if(!matches(v)||v.rows_truncated!==false||!Array.isArray(v.reviews)||v.reviews.length>1000)fail();
 const reviews=v.reviews as unknown[],ids=new Set<string>();
 return reviews.map((item,index)=>{
  const r=object(item);
  if(!matches(r)||r.version!==index+1||typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.actor_id!=='string'||!r.actor_id||typeof r.reason!=='string'||r.reason.trim().length<4||r.reason.length>500||typeof r.created_at!=='string'||!Number.isFinite(Date.parse(r.created_at))||!Array.isArray(r.allocations)||r.allocations.length>100)fail();
  ids.add(r.id as string);
  for(const item of r.allocations as unknown[]){const a=object(item);if(!['operating','investing','financing'].includes(a.category as string)||typeof a.amount_minor!=='string'||! /^-?[1-9][0-9]{0,40}$/.test(a.amount_minor))fail();}
  return r as CashReview;
 });
}
