import type {HandoffScope} from './cashier-handoff';
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid split history.');return v as Record<string,unknown>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const money=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9][0-9]{0,11})$/.test(v);
export function readSplitHistory(value:unknown,scope:HandoffScope,batchId:string){
 const detail=object(value),batch=object(detail.batch),receipt=object(detail.commit_result),saved=object(detail.split_reconciliation);
 if(detail.tenant_id!==scope.tenant||detail.property_id!==scope.property||detail.actor_id!==scope.actor||batch.id!==batchId||batch.tenant_id!==scope.tenant||batch.property_id!==scope.property||detail.status!=='committed'||receipt.schema_version!==3||receipt.tenant_id!==scope.tenant||receipt.property_id!==scope.property||receipt.batch_id!==batchId||receipt.actor_id!==detail.commit_actor_id||receipt.request_id!==detail.commit_request_id||!uuid(receipt.request_id)||!uuid(saved.id)||saved.id!==receipt.split_review_id||saved.actor_id!==receipt.actor_id||!uuid(saved.actor_id)||!Array.isArray(saved.allocations)||!Array.isArray(batch.source_rows))throw Error('Split history does not match this migration.');
 const sources=batch.source_rows.map(object),totals={receivable:BigInt(0),prepayment:BigInt(0),security:BigInt(0)},sums=new Map<string,bigint>(),destinations=new Set<string>();let matched=BigInt(0);
 const allocations=saved.allocations.map(raw=>{
  const a=object(raw),source=sources.find(r=>r.source_item_id===a.source_item_id);
  if(!source||typeof a.source_item_id!=='string'||!money(a.amount_minor)||a.amount_minor==='0'||typeof a.evidence!=='string'||a.evidence.trim().length<4||!(a.invoice_id===null||uuid(a.invoice_id)))throw Error('Invalid split allocation.');
  const key=JSON.stringify([a.source_item_id,a.invoice_id]);if(destinations.has(key))throw Error('Duplicate split allocation.');destinations.add(key);
  const amount=BigInt(a.amount_minor);sums.set(a.source_item_id,(sums.get(a.source_item_id)??BigInt(0))+amount);
  if(a.invoice_id!==null){if(source.category!=='receivable')throw Error('Invalid matched category.');matched+=amount;}
  else {if(!['receivable','prepayment','security'].includes(source.category as string))throw Error('Invalid split category.');totals[source.category as keyof typeof totals]+=amount;}
  return {source:a.source_item_id,invoice:a.invoice_id,amount:a.amount_minor,evidence:a.evidence};
 });
 for(const source of sources)if(typeof source.source_item_id!=='string'||!money(source.amount_minor)||sums.get(source.source_item_id)!==BigInt(source.amount_minor))throw Error('Split allocations do not total the source.');
 const additional=object(saved.additional_totals);for(const category of Object.keys(totals) as (keyof typeof totals)[])if(additional[category]!==totals[category].toString())throw Error('Incorrect additional split total.');
 if(saved.matched_receivable_minor!==matched.toString())throw Error('Incorrect matched split total.');
 if(receipt.status!=='committed'||!Array.isArray(receipt.openings)||!Array.isArray(receipt.invoice_matches)||!Array.isArray(detail.invoice_matches))throw Error('Invalid split posting receipt.');
 const expectedOpenings=allocations.filter(a=>a.invoice===null),expectedMatches=allocations.filter(a=>a.invoice!==null);
 if(receipt.openings.length!==expectedOpenings.length||receipt.invoice_matches.length!==expectedMatches.length||detail.invoice_matches.length!==expectedMatches.length)throw Error('Split receipt has missing financial records.');
 const seenSources=new Set<string>(),seenIds=new Set<string>();
 const openings=receipt.openings.map(raw=>{const r=object(raw),allocation=expectedOpenings.find(a=>a.source===r.source_item_id);if(!allocation||!uuid(r.opening_id)||!uuid(r.journal_id)||seenSources.has(allocation.source)||seenIds.has(r.opening_id)||seenIds.has(r.journal_id))throw Error('Invalid split opening references.');seenSources.add(allocation.source);seenIds.add(r.opening_id);seenIds.add(r.journal_id);return {...allocation,opening:r.opening_id,journal:r.journal_id};});
 const history=detail.invoice_matches.map(object),seenMatches=new Set<string>();
 const matches=receipt.invoice_matches.map(raw=>{const r=object(raw),allocation=expectedMatches.find(a=>a.source===r.source_item_id&&a.invoice===r.invoice_id),key=JSON.stringify([r.source_item_id,r.invoice_id]);
  const record=history.find(h=>h.source_item_id===r.source_item_id&&h.invoice_id===r.invoice_id);
  if(!allocation||allocation.amount!==r.amount_minor||seenMatches.has(key)||!record||!uuid(record.id)||record.amount_minor!==allocation.amount||record.evidence!==allocation.evidence||seenIds.has(record.id))throw Error('Split invoice match differs from saved allocation.');seenMatches.add(key);seenIds.add(record.id);
  const preview=object(batch.preview).rows,index=sources.findIndex(s=>s.source_item_id===allocation.source);
  if(!Array.isArray(preview)||preview.length!==sources.length||!uuid(record.reservation_id)||object(preview[index]).reservation_id!==record.reservation_id||!uuid(allocation.invoice)||!Array.isArray(record.corrections))throw Error('Invalid split match reservation or corrections.');
  let current=allocation.invoice;const correctionIds=new Set<string>();
  const corrections=record.corrections.map((raw,index)=>{const c=object(raw);if(!uuid(c.id)||correctionIds.has(c.id)||c.version!==index+1||c.previous_invoice_id!==current||!uuid(c.invoice_id)||c.invoice_id===current||!uuid(c.actor_id)||typeof c.reason!=='string'||c.reason.trim().length<4||typeof c.created_at!=='string'||!Number.isFinite(Date.parse(c.created_at)))throw Error('Invalid split match correction chain.');correctionIds.add(c.id);const previous=current;current=c.invoice_id;return {id:c.id,version:index+1,previous,invoice:current,actor:c.actor_id,reason:c.reason,created:c.created_at};});
  if(record.current_invoice_id!==current)throw Error('Split match current invoice differs from correction history.');
  return {...allocation,id:record.id,reservation:record.reservation_id,currentInvoice:current,corrections};
 });
 return {id:saved.id,allocations,openings,matches,additional:{receivable:totals.receivable.toString(),prepayment:totals.prepayment.toString(),security:totals.security.toString()},matched:matched.toString()};
}

export function splitHistoryRows(history:ReturnType<typeof readSplitHistory>){
 return [['Split review','Source item','Disposition','Amount in USD cents','Opening ID','Journal ID','Original invoice ID','Current invoice ID','Match ID','Evidence'],...history.allocations.map(a=>{
  const opening=history.openings.find(o=>o.source===a.source),match=history.matches.find(m=>m.source===a.source&&m.invoice===a.invoice);
  return [history.id,a.source,a.invoice===null?'Additional balance':'Existing invoice',a.amount,a.invoice===null?opening?.opening??'':'',a.invoice===null?opening?.journal??'':'',a.invoice??'',match?.currentInvoice??'',match?.id??'',a.evidence];
 })];
}
export function splitCorrectionRows(history:ReturnType<typeof readSplitHistory>){
 return [['Split review','Source item','Match ID','Original invoice ID','Current invoice ID','Correction ID','Version','Previous invoice ID','Replacement invoice ID','Actor','Reason','Recorded at'],...history.matches.flatMap(m=>m.corrections.map(c=>[history.id,m.source,m.id,m.invoice??'',m.currentInvoice,c.id,String(c.version),c.previous,c.invoice,c.actor,c.reason,c.created]))];
}
