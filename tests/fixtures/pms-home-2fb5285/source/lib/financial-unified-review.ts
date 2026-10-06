import {readFinancialPostingReview,type FinancialPostingSelection} from './financial-migration-posting';
import {splitEntrySources} from './financial-split-entry';
import {prepareUnifiedEntries,readLiabilityDestinations,type UnifiedDestination} from './financial-unified-entry';
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid combined review.');return v as Record<string,unknown>};
const canonical=(v:unknown)=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export function readUnifiedReview(value:unknown,selection:FinancialPostingSelection,assessment:Record<string,unknown>,allocations:ReturnType<typeof prepareUnifiedEntries>){
 const v=object(value),s=selection.scope,posting=readFinancialPostingReview(assessment.posting_review,selection);
 if(v.schema_version!==1||v.tenant_id!==s.tenant||v.property_id!==s.property||v.actor_id!==s.actor||v.ready_to_commit!==false||v.financial_records_written!==false||canonical(v.assessment)!==canonical(assessment)||canonical(v.allocations)!==canonical(allocations)||!Array.isArray(v.liability_inventory))throw Error('Combined preview differs from this request.');
 const inventory=v.liability_inventory.map(object),reservations=new Set<string>(),destinations:UnifiedDestination[]=[];
 for(const item of inventory){if(typeof item.reservation_id!=='string'||reservations.has(item.reservation_id)||!posting.rows.some(r=>r.reservation===item.reservation_id&&r.category!=='receivable'))throw Error('Unexpected deposit inventory.');reservations.add(item.reservation_id);destinations.push(...readLiabilityDestinations(item,s,item.reservation_id,posting.cutover));}
 const additional={receivable:BigInt(0),prepayment:BigInt(0),security:BigInt(0)},matched={...additional},invoiceSources=splitEntrySources(assessment,selection);
 if(allocations.some(a=>!posting.rows.some(r=>r.source===a.source_item_id)))throw Error('Unknown migration source.');
 for(const row of posting.rows){
  if(row.category!=='receivable'&&!reservations.has(row.reservation))throw Error('Missing deposit inventory.');
  const choices=row.category==='receivable'?(invoiceSources.find(s=>s.source===row.source)?.invoices??[]).map(i=>({kind:'invoice' as const,id:i.id,label:i.label,reservation:row.reservation,category:row.category,available:row.amount})):destinations;
  const portions=allocations.filter(a=>a.source_item_id===row.source);
  const checked=prepareUnifiedEntries(row,portions.map(p=>{if(!/^[1-9][0-9]{0,11}$/.test(p.amount_minor))throw Error('Invalid portion amount.');const n=BigInt(p.amount_minor);return {destination:p.destination_id?p.destination_kind+':'+p.destination_id:'',amount:(n/BigInt(100)).toString()+'.'+(n%BigInt(100)).toString().padStart(2,'0'),evidence:p.evidence}}),choices);
  if(canonical(checked)!==canonical(portions))throw Error('Invalid destination disposition.');
  for(const p of portions)(p.destination_kind==='new_opening'?additional:matched)[row.category]+=BigInt(p.amount_minor);
 }
 for(const c of ['receivable','prepayment','security'] as const)if(object(v.additional_totals)[c]!==additional[c].toString()||object(v.matched_totals)[c]!==matched[c].toString())throw Error('Combined review totals do not reconcile.');
 return v;
}
