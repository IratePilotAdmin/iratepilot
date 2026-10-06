import {validateUnifiedSaveRequest,type UnifiedSaveRequest} from './financial-unified-save';
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid migration posting receipt.');return v as Record<string,unknown>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
export function readUnifiedPostingReceipt(value:unknown,saved:UnifiedSaveRequest,requestId:string){
 validateUnifiedSaveRequest(saved);const v=object(value),s=saved.scope;
 if(!uuid(requestId)||v.schema_version!==4||v.tenant_id!==s.tenant||v.property_id!==s.property||v.actor_id!==s.actor||v.request_id!==requestId||v.batch_id!==saved.batch||v.unified_review_id!==saved.id||v.status!=='committed'||typeof v.replayed!=='boolean')throw Error('Posting receipt differs from the saved review.');
 const allocations=(saved.review.allocations as unknown[]).map(object),ids=new Set<string>();
 const claimId=(id:unknown)=>{if(!uuid(id)||ids.has(id))throw Error('Invalid or duplicate posting identity.');ids.add(id)};
 for(const [field,kind] of [['openings','new_opening'],['invoice_matches','invoice'],['liability_matches','liability']] as const){
  const records=v[field];if(!Array.isArray(records))throw Error('Missing posting records.');
  const expected=allocations.filter(a=>kind==='liability'?['financial_opening','security_receipt'].includes(a.destination_kind as string):a.destination_kind===kind),seen=new Set<string>();
  if(expected.length!==records.length)throw Error('Posting record count differs from review.');
  for(const raw of records){const r=object(raw),a=expected.find(a=>a.source_item_id===r.source_item_id&&(kind==='new_opening'||kind==='invoice'&&a.destination_id===r.invoice_id||kind==='liability'&&a.destination_kind===r.destination_kind&&a.destination_id===r.destination_id));
   if(!a)throw Error('Unexpected posted allocation.');const key=JSON.stringify([a.source_item_id,a.destination_kind,a.destination_id]);if(seen.has(key))throw Error('Duplicate posted allocation.');seen.add(key);
   if(kind==='new_opening'){claimId(r.opening_id);claimId(r.journal_id)}else{if(r.amount_minor!==a.amount_minor)throw Error('Posted amount differs from review.');if(kind==='liability')claimId(r.claim_id);}
  }
 }
 const expected=object(object(object(saved.review.assessment).posting_review).source_totals),totals=object(v.source_totals);
 for(const c of ['receivable','prepayment','security'])if(totals[c]!==expected[c])throw Error('Posted source totals differ from review.');
 return v;
}
