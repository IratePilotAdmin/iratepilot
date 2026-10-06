import {prepareSplitEntries,type SplitSource} from './financial-split-entry';
import type {HandoffScope} from './cashier-handoff';
export type UnifiedDestination={kind:'invoice'|'financial_opening'|'security_receipt';id:string;reservation:string;category:string;label:string;available:string};
export type UnifiedEntry={destination:string;amount:string;evidence:string};
export type UnifiedSource=SplitSource&{reservation:string};
export const destinationKey=(d:UnifiedDestination)=>d.kind+':'+d.id;
export const sourceDestinations=(source:UnifiedSource,destinations:UnifiedDestination[])=>destinations.filter(d=>d.reservation===source.reservation&&d.category===source.category&&(source.category==='receivable'?d.kind==='invoice':d.kind==='financial_opening'||source.category==='security'&&d.kind==='security_receipt'));
export function readLiabilityDestinations(value:unknown,scope:HandoffScope,reservation:string,date:string):UnifiedDestination[]{
 const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid deposit assessment.');return v as Record<string,unknown>};
 const v=obj(value),seen=new Set<string>();
 if(v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.actor_id!==scope.actor||v.reservation_id!==reservation||v.as_of!==date||v.currency!=='USD'||v.financial_records_written!==false||v.includes_ordinary_folio_credits!==false||v.claim_basis!=='all_current_claims_against_dated_balance'||!Array.isArray(v.rows))throw Error('Deposit assessment belongs to another reservation or date.');
 return v.rows.map(raw=>{
  const r=obj(raw),money=(n:unknown):n is string=>typeof n==='string'&&/^(0|[1-9][0-9]{0,11})$/.test(n);
  if(!['financial_opening','security_receipt'].includes(r.destination_kind as string)||!['prepayment','security'].includes(r.category as string)||r.destination_kind==='security_receipt'&&r.category!=='security'||typeof r.destination_id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(r.destination_id)||typeof r.source_reference!=='string'||!r.source_reference.trim()||!money(r.remaining_minor)||!money(r.claimed_minor)||!money(r.available_to_match_minor))throw Error('Invalid existing deposit record.');
  const remainder=BigInt(r.remaining_minor)-BigInt(r.claimed_minor);if(BigInt(r.available_to_match_minor)!==(remainder>BigInt(0)?remainder:BigInt(0)))throw Error('Deposit availability does not reconcile.');
  const d:UnifiedDestination={kind:r.destination_kind as UnifiedDestination['kind'],id:r.destination_id,reservation,category:r.category as string,label:r.source_reference,available:r.available_to_match_minor};
  if(seen.has(destinationKey(d)))throw Error('Duplicate existing deposit.');seen.add(destinationKey(d));return d;
 }).filter(d=>d.available!=='0');
}
export function prepareUnifiedEntries(source:UnifiedSource,entries:UnifiedEntry[],destinations:UnifiedDestination[]){
 if(!['receivable','prepayment','security'].includes(source.category))throw Error('Invalid source balance category.');
 const allowed=sourceDestinations(source,destinations);
 if(new Set(allowed.map(destinationKey)).size!==allowed.length)throw Error('Duplicate destination choices.');
 for(const d of allowed)if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(d.id)||!/^(0|[1-9][0-9]{0,11})$/.test(d.available))throw Error('Invalid destination balance.');
 // Reuse exact USD parsing, evidence validation, duplicate checks and source-total reconciliation.
 const parsed=prepareSplitEntries({...source,category:'receivable'},entries.map(e=>({invoice:e.destination,amount:e.amount,evidence:e.evidence})),allowed.map(destinationKey));
 return parsed.map(p=>{
  const target=allowed.find(d=>destinationKey(d)===p.invoice_id);
  if(target&&BigInt(p.amount_minor)>BigInt(target.available))throw Error('The portion exceeds the available destination balance. Refresh the assessment.');
  return {source_item_id:p.source_item_id,destination_kind:target?.kind??'new_opening',destination_id:target?.id??null,amount_minor:p.amount_minor,evidence:p.evidence};
 });
}
