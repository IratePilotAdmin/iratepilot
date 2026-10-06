import {readFinancialPostingReview,type FinancialPostingSelection} from './financial-migration-posting';
export type ReconciliationDecision={source_item_id:string;disposition:'additional_balance'|'existing_invoice';invoice_id:string|null;evidence:string};
export type ReconciliationRequest={id:string;selection:FinancialPostingSelection;assessment:unknown;decisions:ReconciliationDecision[]};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid reconciliation data.');return v as Record<string,unknown>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
function canonical(v:unknown):string{if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';return JSON.stringify(v)??'undefined';}
export function validateReconciliationRequest(r:ReconciliationRequest){
 if(!r||!uuid(r.id)||!r.selection)throw Error('Invalid saved reconciliation request.');
 const a=object(r.assessment),s=r.selection.scope;
 if(a.schema_version!==1||a.tenant_id!==s.tenant||a.property_id!==s.property||a.actor_id!==s.actor||a.batch_id!==r.selection.batch||a.ready_to_commit!==false||a.financial_records_written!==false)throw Error('Reconciliation assessment scope changed.');
 const review=readFinancialPostingReview(a.posting_review,r.selection);
 if(!Array.isArray(r.decisions)||r.decisions.length!==review.rows.length||new Set(r.decisions.map(d=>d.source_item_id)).size!==review.rows.length)throw Error('Decide every source item once.');
 for(const decision of r.decisions){const d=object(decision),row=review.rows.find(row=>row.source===d.source_item_id);
  if(Object.keys(d).sort().join(',')!=='disposition,evidence,invoice_id,source_item_id'||!row||typeof d.evidence!=='string'||d.evidence.trim().length<4||d.evidence.trim().length>1000||/[\x00-\x1f\x7f]/.test(d.evidence))throw Error('Each decision needs supporting evidence.');
  if(d.disposition==='additional_balance'){if(d.invoice_id!==null)throw Error('Additional balances cannot claim an invoice.');}
  else if(d.disposition==='existing_invoice'){
   const raw=(review.raw.rows as unknown[]).map(object).find(x=>x.source_item_id===row.source),invoices=object(raw?.destination_state).invoices;
   if(row.category!=='receivable'||!uuid(d.invoice_id)||!Array.isArray(invoices)||!invoices.map(object).some(i=>i.id===d.invoice_id&&i.reservation_id===row.reservation&&i.tenant_id===s.tenant&&i.property_id===s.property))throw Error('Choose an invoice for this source receivable.');
  }else throw Error('Choose a reconciliation decision.');
 }
 return review;
}
export function readReconciliationReceipt(value:unknown,r:ReconciliationRequest){validateReconciliationRequest(r);const v=object(value);if(v.request_id!==r.id||v.batch_id!==r.selection.batch||v.saved!==true||typeof v.replayed!=='boolean'||v.ready_to_commit!==false)throw Error('Reconciliation receipt does not match the saved request.');return v;}
export function readReconciliationStatus(value:unknown,r:ReconciliationRequest){
 validateReconciliationRequest(r);const v=object(value),s=r.selection.scope;
 if(v.schema_version!==1||v.tenant_id!==s.tenant||v.property_id!==s.property||v.actor_id!==s.actor||v.request_id!==r.id||typeof v.found!=='boolean'||typeof v.cancelled!=='boolean'||typeof v.batch_committed!=='boolean'||v.found&&v.cancelled||v.used_by_commit!==null&&(!uuid(v.used_by_commit)||v.batch_committed!==true))throw Error('Reconciliation status does not match this request.');
 if(v.found){if(canonical(v.assessment)!==canonical(r.assessment)||canonical(v.decisions)!==canonical(r.decisions))throw Error('Recovered reconciliation details changed.');readReconciliationReceipt(v.result,r);}
 else if(v.result!==null||v.assessment!==null||v.decisions!==null||v.batch_committed!==false||v.used_by_commit!==null)throw Error('Unknown reconciliation contains saved data.');
 return {found:v.found,cancelled:v.cancelled,batchCommitted:v.batch_committed,commit:v.used_by_commit as string|null};
}
export function readReconciledCommit(value:unknown,request:{id:string;reconciliation:ReconciliationRequest}){
 const r=request.reconciliation,review=validateReconciliationRequest(r),v=object(value),s=r.selection.scope;
 if(!uuid(request.id)||v.schema_version!==2||v.tenant_id!==s.tenant||v.property_id!==s.property||v.actor_id!==s.actor||v.request_id!==request.id||v.batch_id!==r.selection.batch||v.reconciliation_id!==r.id||v.status!=='committed'||typeof v.replayed!=='boolean'||!Array.isArray(v.openings)||!Array.isArray(v.invoice_matches)||v.openings.length+v.invoice_matches.length!==review.rows.length)throw Error('Reconciled posting receipt does not match this request.');
 const seen=new Set<string>(),journals=new Set<string>(),openings=new Set<string>();
 for(const raw of v.openings){const p=object(raw),row=review.rows.find(x=>x.source===p.source_item_id),decision=r.decisions.find(d=>d.source_item_id===p.source_item_id);if(!row||decision?.disposition!=='additional_balance'||p.opening_id!==row.id||!uuid(p.journal_id)||seen.has(row.source)||journals.has(p.journal_id)||openings.has(row.id))throw Error('Opening references do not match the reviewed decisions.');seen.add(row.source);journals.add(p.journal_id);openings.add(row.id);}
 for(const raw of v.invoice_matches){const m=object(raw),row=review.rows.find(x=>x.source===m.source_item_id),decision=r.decisions.find(d=>d.source_item_id===m.source_item_id);if(!row||decision?.disposition!=='existing_invoice'||m.invoice_id!==decision.invoice_id||m.amount_minor!==row.amount||seen.has(row.source))throw Error('Invoice references do not match the reviewed decisions.');seen.add(row.source);}
 const totals=object(v.source_totals);for(const category of ['receivable','prepayment','security'] as const)if(totals[category]!==review.totals[category].toString())throw Error('Posting source totals changed.');
 return v;
}
