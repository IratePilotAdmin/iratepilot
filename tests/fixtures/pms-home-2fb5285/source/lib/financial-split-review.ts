import type {FinancialPostingSelection} from './financial-migration-posting';
import {splitEntrySources,prepareSplitEntries} from './financial-split-entry';
const canonical=(v:unknown):string=>JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
export function readSplitReview(value:unknown,selection:FinancialPostingSelection,assessment:Record<string,unknown>,allocations:ReturnType<typeof prepareSplitEntries>){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid split preview.');
 const review=value as Record<string,unknown>,scope=selection.scope,sources=splitEntrySources(assessment,selection);
 if(review.schema_version!==1||review.tenant_id!==scope.tenant||review.property_id!==scope.property||review.actor_id!==scope.actor||review.financial_records_written!==false||review.ready_to_commit!==false||canonical(review.assessment)!==canonical(assessment)||canonical(review.allocations)!==canonical(allocations))throw Error('Split preview differs from this request.');
 const totals={receivable:BigInt(0),prepayment:BigInt(0),security:BigInt(0)};let matched=BigInt(0);
 if(allocations.some(a=>!sources.some(s=>s.source===a.source_item_id)))throw Error('Unknown split source.');
 for(const source of sources){const portions=allocations.filter(a=>a.source_item_id===source.source);const checked=prepareSplitEntries(source,portions.map(a=>{if(!/^[1-9][0-9]{0,11}$/.test(a.amount_minor))throw Error('Invalid split amount.');const amount=BigInt(a.amount_minor);return {invoice:a.invoice_id??'',amount:`${amount/BigInt(100)}.${(amount%BigInt(100)).toString().padStart(2,'0')}`,evidence:a.evidence};}),source.invoices.map(i=>i.id));
  for(const part of checked)if(part.invoice_id)matched+=BigInt(part.amount_minor);else totals[source.category]+=BigInt(part.amount_minor);
 }
 const additional=review.additional_totals;if(!additional||typeof additional!=='object'||Array.isArray(additional))throw Error('Missing split totals.');
 for(const category of Object.keys(totals) as (keyof typeof totals)[])if((additional as Record<string,unknown>)[category]!==totals[category].toString())throw Error('Incorrect additional preview total.');
 if(review.matched_receivable_minor!==matched.toString())throw Error('Incorrect matched preview total.');
 return {raw:review,matched:matched.toString(),additional:{receivable:totals.receivable.toString(),prepayment:totals.prepayment.toString(),security:totals.security.toString()}};
}
