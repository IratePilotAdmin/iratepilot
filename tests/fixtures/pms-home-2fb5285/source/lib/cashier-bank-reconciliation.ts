import type {HandoffScope} from './cashier-handoff';
export function readMatchSources(value:unknown,scope:HandoffScope,account:string,kind:'deposit'|'credit',before:string|null=null){
 const v=object(value);scopeCheck(v,scope,account);if(v.actor_id!==scope.actor||v.kind!==kind||!Array.isArray(v.entries)||v.entries.length>50)throw Error('Invalid matching sources.');let prior=before;
 const entries=v.entries.map(value=>{const e=object(value);if(!uuid(e.id)||(prior!==null&&e.id>=prior)||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date))throw Error('Invalid matching source.');prior=e.id;const total=amount(e.amount_minor),remaining=amount(e.remaining_minor);if(BigInt(remaining)<=BigInt(0)||BigInt(remaining)>BigInt(total)||BigInt(total)>BigInt('999999999999'))throw Error('Invalid remaining match amount.');return {id:e.id,date:e.date,reference:text(e.reference),total,remaining}});
 if(v.next_before!==null&&(!uuid(v.next_before)||entries.length!==50||entries[49].id!==v.next_before))throw Error('Invalid source cursor.');return {entries,next:v.next_before as string|null};
}
export function readStatementEntries(value:unknown,scope:HandoffScope,account:string,before:string|null=null){
 const v=object(value);if(v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.actor_id!==scope.actor||v.account_id!==account||v.currency!=='USD'||v.live_view!==true||!Array.isArray(v.entries)||v.entries.length>50)throw Error('Statement workspace changed.');let prior=before;
 const entries=v.entries.map(value=>{const e=object(value);if(!uuid(e.id)||!uuid(e.actor_id)||e.tenant_id!==scope.tenant||e.property_id!==scope.property||e.account_id!==account||(prior!==null&&e.id>=prior)||typeof e.amount_minor!=='string'||! /^-?[1-9][0-9]{0,11}$/.test(e.amount_minor)||e.source!=='manual'||e.bank_verified!==false||e.journal_posted!==false||typeof e.value_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.value_date))throw Error('Invalid statement item.');if(e.status!=='recorded'&&e.status!=='voided')throw Error('Invalid statement status.');if(e.status==='voided'){if(!uuid(e.void_request_id)||!uuid(e.void_actor_id))throw Error('Invalid statement correction.');text(e.void_reason);text(e.voided_at)}else if(e.void_request_id!==null||e.void_actor_id!==null||e.void_reason!==null||e.voided_at!==null)throw Error('Unexpected statement correction.');prior=e.id;return {status:e.status as 'recorded'|'voided',voidReason:e.void_reason as string|null,id:e.id,actor:e.actor_id,amount:e.amount_minor,date:e.value_date,reference:text(e.reference),description:text(e.description)}});
 if(v.next_before!==null&&(!uuid(v.next_before)||entries.length!==50||v.next_before!==entries[49].id))throw Error('Invalid statement cursor.');return {entries,next:v.next_before as string|null};
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid reconciliation response.');return value as Record<string,unknown>}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
function amount(v:unknown){if(typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v))throw Error('Invalid reconciliation amount.');return v}
function scopeCheck(v:Record<string,unknown>,scope:HandoffScope,account:string){if(!Object.values(scope).every(uuid)||!uuid(account)||v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.account_id!==account||v.source!=='manual'||v.bank_verified!==false||v.journal_posted!==false||v.live_view!==true)throw Error('Reconciliation workspace changed.')}
export function readReconciliationSummary(value:unknown,scope:HandoffScope,account:string){
 const v=object(value);scopeCheck(v,scope,account);
 const deposits=amount(v.deposit_minor),credits=amount(v.statement_credit_minor),debits=amount(v.unreviewed_statement_debit_minor),matched=amount(v.active_matched_minor),reversed=amount(v.reversed_match_minor),unmatchedDeposits=amount(v.unmatched_deposit_minor),unmatchedCredits=amount(v.unmatched_statement_credit_minor);
 if(BigInt(deposits)-BigInt(matched)!==BigInt(unmatchedDeposits)||BigInt(credits)-BigInt(matched)!==BigInt(unmatchedCredits))throw Error('Reconciliation totals do not balance.');
 return {deposits,credits,debits,matched,reversed,unmatchedDeposits,unmatchedCredits};
}
function text(v:unknown){if(typeof v!=='string'||!v.trim())throw Error('Missing match details.');return v}
export function readMatchHistory(value:unknown,scope:HandoffScope,account:string,before:string|null=null){
 const v=object(value);scopeCheck(v,scope,account);if(v.actor_id!==scope.actor||!Array.isArray(v.entries)||v.entries.length>50)throw Error('Invalid match history.');let prior=before;
 const entries=v.entries.map(value=>{const m=object(value);if(!uuid(m.id)||!uuid(m.actor_id)||!uuid(m.deposit_id)||!uuid(m.statement_id)||m.tenant_id!==scope.tenant||m.property_id!==scope.property||m.account_id!==account||(prior!==null&&m.id>=prior)||!['active','reversed'].includes(String(m.status)))throw Error('Invalid match record.');prior=m.id;
  if(m.status==='reversed'){if(!uuid(m.reversal_request_id)||!uuid(m.reversal_actor_id))throw Error('Invalid match reversal.');text(m.reversal_reason);text(m.reversed_at)}else if(m.reversal_request_id!==null||m.reversal_actor_id!==null||m.reversal_reason!==null||m.reversed_at!==null)throw Error('Unexpected match reversal.');
  const total=amount(m.amount_minor);if(BigInt(total)<=BigInt(0)||BigInt(total)>BigInt('999999999999'))throw Error('Invalid match amount.');
  return {id:m.id,deposit:m.deposit_id,statement:m.statement_id,actor:m.actor_id,amount:total,status:m.status as 'active'|'reversed',reason:text(m.reason),createdAt:text(m.created_at),reversalReason:m.reversal_reason as string|null};
 });
 if(v.next_before!==null&&(!uuid(v.next_before)||entries.length!==50||v.next_before!==entries[49].id))throw Error('Invalid match history cursor.');return {entries,next:v.next_before as string|null};
}
