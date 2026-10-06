import {validateSplitSaveRequest,type SplitSaveRequest} from './financial-split-save';
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid split posting receipt.');return v as Record<string,unknown>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
export function readSplitPostingReceipt(value:unknown,saved:SplitSaveRequest,requestId:string){
 validateSplitSaveRequest(saved);const v=object(value),s=saved.selection.scope;
 if(!uuid(requestId)||v.schema_version!==3||v.tenant_id!==s.tenant||v.property_id!==s.property||v.actor_id!==s.actor||v.request_id!==requestId||v.batch_id!==saved.selection.batch||v.split_review_id!==saved.id||v.status!=='committed'||typeof v.replayed!=='boolean'||!Array.isArray(v.openings)||!Array.isArray(v.invoice_matches))throw Error('Split posting receipt differs from the saved review.');
 const additional=saved.allocations.filter(a=>a.invoice_id===null),matched=saved.allocations.filter(a=>a.invoice_id!==null),seen=new Set<string>(),ids=new Set<string>();
 if(v.openings.length!==additional.length||v.invoice_matches.length!==matched.length)throw Error('Split receipt has incorrect record counts.');
 for(const raw of v.openings){const o=object(raw),allocation=additional.find(a=>a.source_item_id===o.source_item_id);if(!allocation||seen.has(allocation.source_item_id)||!uuid(o.opening_id)||!uuid(o.journal_id)||ids.has(o.opening_id)||ids.has(o.journal_id))throw Error('Invalid split opening references.');seen.add(allocation.source_item_id);ids.add(o.opening_id);ids.add(o.journal_id);}
 seen.clear();for(const raw of v.invoice_matches){const m=object(raw),allocation=matched.find(a=>a.source_item_id===m.source_item_id&&a.invoice_id===m.invoice_id),key=JSON.stringify([m.source_item_id,m.invoice_id]);if(!allocation||m.amount_minor!==allocation.amount_minor||seen.has(key))throw Error('Split receipt invoice match differs from review.');seen.add(key);}
 const totals=object(v.source_totals),expected=object(object(saved.assessment.posting_review).source_totals);for(const category of ['receivable','prepayment','security'])if(totals[category]!==expected[category])throw Error('Split receipt totals differ from source.');return v;
}
export function readSplitPostingStatus(value:unknown,saved:SplitSaveRequest,requestId:string){
 validateSplitSaveRequest(saved);const v=object(value),s=saved.selection.scope;
 if(!uuid(requestId)||v.schema_version!==1||v.tenant_id!==s.tenant||v.property_id!==s.property||v.actor_id!==s.actor||v.request_id!==requestId||typeof v.found!=='boolean'||typeof v.cancelled!=='boolean'||v.found&&v.cancelled)throw Error('Split posting status differs from this request.');
 if(v.found)readSplitPostingReceipt(v.result,saved,requestId);else if(v.result!==null)throw Error('Unrecorded split posting contains a receipt.');
 return {found:v.found,cancelled:v.cancelled};
}
