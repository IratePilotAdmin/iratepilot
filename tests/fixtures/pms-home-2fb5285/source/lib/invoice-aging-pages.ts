import {readInvoiceAging} from './invoice-aging';
type Scope=Parameters<typeof readInvoiceAging>[1];
const bucketNames=['not_due','days_1_30','days_31_60','days_61_90','days_91_plus'] as const;
function summary(r:Record<string,unknown>) {
 if(!r.totals||typeof r.totals!=='object'||Array.isArray(r.totals))throw Error('Invalid aging totals.');
 const totals=r.totals as Record<string,unknown>;
 const values=[...bucketNames.map(k=>totals[k]),r.outstanding_minor];
 if(values.some(v=>typeof v!=='string'||!/^(0|[1-9][0-9]{0,17})$/.test(v)))throw Error('Invalid aging totals.');
 return JSON.stringify(values);
}
export async function loadCompleteInvoiceAging(scope:Scope,fetchPage:(offset:number,snapshot:string|null)=>Promise<unknown>) {
 const rows:unknown[]=[];let offset=0,snapshot:string|null=null,total:number|null=null,totalsKey:string|null=null;
 for(;;){
  const value=await fetchPage(offset,snapshot);
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid aging page.');
  const r=value as Record<string,unknown>;
  if(r.schema_version!==2||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||r.as_of!==scope.as_of||r.currency!=='USD'||r.basis!=='issued_invoices_effective_allocations'||r.offset!==offset||typeof r.snapshot!=='string'||!/^[0-9a-f]{64}$/.test(r.snapshot)||!Number.isSafeInteger(r.total_rows)||(r.total_rows as number)<0||!Array.isArray(r.rows)||r.rows.length>200)throw Error('Aging page scope or sequence changed.');
  const currentKey=summary(r);
  if(snapshot!==null&&(snapshot!==r.snapshot||total!==r.total_rows||totalsKey!==currentKey))throw Error('Invoice balances changed. Reload the report.');
  snapshot=r.snapshot;total=r.total_rows as number;totalsKey=currentKey;
  const next=offset+r.rows.length;
  if(next>total||r.complete!==(next===total)||r.next_offset!==(next===total?null:next)||(next<total&&r.rows.length!==200))throw Error('Incomplete aging page.');
  rows.push(...r.rows);
  if(next===total)return readInvoiceAging({...r,schema_version:1,complete:true,rows},scope);
  offset=next;
 }
}
