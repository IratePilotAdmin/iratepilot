import type {HandoffScope} from './cashier-handoff';
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid combined migration report.');return v as Record<string,unknown>};
const list=(v:unknown)=>{if(!Array.isArray(v))throw Error('Missing migration records.');return v.map(object)};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const money=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,11}$/.test(v);
const categories=['receivable','prepayment','security'] as const;
type Category=typeof categories[number];
export function readUnifiedHistory(value:unknown,scope:HandoffScope,batchId:string){
 const d=object(value),b=object(d.batch),r=object(d.commit_result),s=object(d.unified_reconciliation);
 if(d.schema_version!==1||d.tenant_id!==scope.tenant||d.property_id!==scope.property||d.actor_id!==scope.actor||b.id!==batchId||b.tenant_id!==scope.tenant||b.property_id!==scope.property||d.status!=='committed'||r.schema_version!==4||r.status!=='committed'||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.batch_id!==batchId||!uuid(r.actor_id)||r.actor_id!==d.commit_actor_id||!uuid(r.request_id)||r.request_id!==d.commit_request_id||!uuid(s.id)||s.id!==r.unified_review_id||s.actor_id!==r.actor_id)throw Error('Combined report does not match this migration.');
 const sources=list(b.source_rows),preview=list(object(b.preview).rows),sourceIds=new Set<string>();
 if(!sources.length||sources.length>500||preview.length!==sources.length)throw Error('Invalid migration source rows.');
 const totals={receivable:BigInt(0),prepayment:BigInt(0),security:BigInt(0)},additional={...totals},matched={...totals},sums=new Map<string,bigint>();
 const sourceMap=new Map(sources.map((row,i)=>{
  if(typeof row.source_item_id!=='string'||!row.source_item_id||sourceIds.has(row.source_item_id)||!categories.includes(row.category as Category)||!money(row.amount_minor)||!uuid(preview[i].reservation_id))throw Error('Invalid migration source identity.');
  sourceIds.add(row.source_item_id);totals[row.category as Category]+=BigInt(row.amount_minor);
  return [row.source_item_id,{category:row.category as Category,reservation:preview[i].reservation_id as string,reference:row.source_reference}];
 }));
 const keys=new Set<string>();
 const allocations=list(s.allocations).map(a=>{
  const source=typeof a.source_item_id==='string'?sourceMap.get(a.source_item_id):undefined;
  if(!source||typeof a.source_item_id!=='string'||!money(a.amount_minor)||typeof a.evidence!=='string'||a.evidence.trim().length<4||!['invoice','new_opening','financial_opening','security_receipt'].includes(a.destination_kind as string)||!(a.destination_kind==='new_opening'?a.destination_id===null:uuid(a.destination_id))||(a.destination_kind==='invoice'&&source.category!=='receivable')||(['financial_opening','security_receipt'].includes(a.destination_kind as string)&&source.category==='receivable')||(a.destination_kind==='security_receipt'&&source.category!=='security'))throw Error('Invalid combined migration allocation.');
  const key=JSON.stringify([a.source_item_id,a.destination_kind,a.destination_id]);if(keys.has(key))throw Error('Duplicate migration allocation.');keys.add(key);
  const amount=BigInt(a.amount_minor);sums.set(a.source_item_id,(sums.get(a.source_item_id)??BigInt(0))+amount);(a.destination_kind==='new_opening'?additional:matched)[source.category]+=amount;
  return {source:a.source_item_id,category:source.category,reservation:source.reservation,kind:a.destination_kind as string,destination:a.destination_id as string|null,amount:a.amount_minor,evidence:a.evidence};
 });
 for(const row of sources)if(sums.get(row.source_item_id as string)!==BigInt(row.amount_minor as string))throw Error('Migration allocations do not total the source.');
 for(const c of categories)if(object(s.additional_totals)[c]!==additional[c].toString()||object(s.matched_totals)[c]!==matched[c].toString()||object(b.source_totals)[c]!==totals[c].toString()||object(r.source_totals)[c]!==totals[c].toString())throw Error('Migration totals do not reconcile.');
 const openings=list(d.unified_openings),invoices=list(d.invoice_matches),claims=list(d.liability_matches),ro=list(r.openings),ri=list(r.invoice_matches),rc=list(r.liability_matches),ids=new Set<string>();
 const unique=(id:unknown)=>{if(!uuid(id)||ids.has(id))throw Error('Duplicate or invalid financial record.');ids.add(id);return id};
 for(const [kind,records,receipt] of [['new_opening',openings,ro],['invoice',invoices,ri],['liability',claims,rc]] as const){
  const expected=allocations.filter(a=>kind==='liability'?['financial_opening','security_receipt'].includes(a.kind):a.kind===kind);
  if(expected.length!==records.length||expected.length!==receipt.length)throw Error('Missing migration financial records.');
 }
 const records=allocations.map(a=>{
  if(a.kind==='new_opening'){
   const o=openings.find(o=>o.source_item_id===a.source),receipt=ro.find(o=>o.source_item_id===a.source);
   if(!o||!receipt||o.id!==receipt.opening_id||o.journal_id!==receipt.journal_id||o.amount_minor!==a.amount||o.category!==a.category||o.reservation_id!==a.reservation||o.source_reference!==sourceMap.get(a.source)?.reference)throw Error('Additional balance differs from saved migration.');
   return {...a,id:unique(o.id),journal:unique(o.journal_id),currentInvoice:null,corrections:[]};
  }
  if(a.kind==='invoice'){
   const m=invoices.find(m=>m.source_item_id===a.source&&m.invoice_id===a.destination),receipt=ri.find(m=>m.source_item_id===a.source&&m.invoice_id===a.destination);
   if(!m||!receipt||m.amount_minor!==a.amount||receipt.amount_minor!==a.amount||m.reservation_id!==a.reservation||m.evidence!==a.evidence)throw Error('Invoice match differs from saved migration.');
   let current=a.destination;const changes=list(m.corrections);
   for(const [i,c] of changes.entries()){unique(c.id);if(c.version!==i+1||c.previous_invoice_id!==current||!uuid(c.invoice_id)||c.invoice_id===current||!uuid(c.actor_id)||typeof c.reason!=='string'||c.reason.trim().length<4||typeof c.created_at!=='string'||!Number.isFinite(Date.parse(c.created_at)))throw Error('Invalid invoice correction history.');current=c.invoice_id;}
   if(m.current_invoice_id!==current)throw Error('Invoice correction history does not match current invoice.');
   return {...a,id:unique(m.id),journal:null,currentInvoice:current,corrections:changes.map(c=>({id:c.id as string,version:c.version as number,previous:c.previous_invoice_id as string,invoice:c.invoice_id as string,actor:c.actor_id as string,reason:c.reason as string,created:c.created_at as string}))};
  }
  const m=claims.find(m=>m.source_item_id===a.source&&m.destination_kind===a.kind&&m.destination_id===a.destination),receipt=rc.find(m=>m.source_item_id===a.source&&m.destination_kind===a.kind&&m.destination_id===a.destination);
  if(!m||!receipt||m.id!==receipt.claim_id||m.amount_minor!==a.amount||receipt.amount_minor!==a.amount||m.reservation_id!==a.reservation||m.category!==a.category||m.evidence!==a.evidence||m.tenant_id!==scope.tenant||m.property_id!==scope.property||typeof m.destination_reference!=='string'||!m.destination_reference.trim())throw Error('Deposit match differs from saved migration.');
  return {...a,id:unique(m.id),journal:null,currentInvoice:null,corrections:[]};
 });
 return {id:s.id,records,additional:Object.fromEntries(categories.map(c=>[c,additional[c].toString()])),matched:Object.fromEntries(categories.map(c=>[c,matched[c].toString()]))};
}
export function unifiedHistoryRows(history:ReturnType<typeof readUnifiedHistory>){
 return [['Review ID','Source item','Category','Reservation ID','Disposition','Amount in USD cents','Destination ID','Record ID','Journal ID','Current invoice ID','Evidence'],...history.records.map(r=>[history.id,r.source,r.category,r.reservation,r.kind==='new_opening'?'Additional balance':r.kind==='invoice'?'Existing invoice':'Existing deposit',r.amount,r.destination??'',r.id,r.journal??'',r.currentInvoice??'',r.evidence])];
}
export function unifiedCorrectionRows(history:ReturnType<typeof readUnifiedHistory>){
 return [['Review ID','Source item','Match ID','Original invoice ID','Current invoice ID','Correction ID','Version','Previous invoice ID','Replacement invoice ID','Actor','Reason','Recorded at'],...history.records.flatMap(r=>r.corrections.map(c=>[history.id,r.source,r.id,r.destination??'',r.currentInvoice??'',c.id,String(c.version),c.previous,c.invoice,c.actor,c.reason,c.created]))];
}
