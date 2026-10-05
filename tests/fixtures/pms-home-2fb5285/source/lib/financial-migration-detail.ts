import type {HandoffScope} from './cashier-handoff';
import {readSplitHistory,splitHistoryRows,splitCorrectionRows} from './financial-split-history';
import {readUnifiedHistory,unifiedHistoryRows,unifiedCorrectionRows} from './financial-unified-history';
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid migration detail.');return value as Record<string,unknown>};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export function readFinancialMigrationDetail(value:unknown,scope:HandoffScope,id:string){
 const v=object(value),b=object(v.batch);
 if(v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.actor_id!==scope.actor||b.id!==id||b.tenant_id!==scope.tenant||b.property_id!==scope.property||typeof b.provider!=='string'||typeof b.source_batch_id!=='string'||typeof b.cutover_date!=='string'||typeof b.export_sha256!=='string'||!/^[0-9a-f]{64}$/.test(b.export_sha256)||!Array.isArray(b.source_rows)||b.source_rows.length<1||b.source_rows.length>500||!['staged','committed'].includes(v.status as string))throw Error('Migration detail does not match this batch.');
 const previewRows=object(b.preview).rows;if(!Array.isArray(previewRows)||previewRows.length!==b.source_rows.length)throw Error('Invalid saved source preview.');
 const rows=b.source_rows.map((raw,index)=>{const r=object(raw),destination=object(previewRows[index]).reservation_id;if(v.status==='committed'&&!uuid(destination))throw Error('Missing committed reservation identity.');return {reservation:uuid(destination)?destination:null,source:typeof r.source_item_id==='string'?r.source_item_id:'Invalid source item',reference:typeof r.source_reference==='string'?r.source_reference:'',category:typeof r.category==='string'?r.category:'',amount:typeof r.amount_minor==='string'&&/^[1-9][0-9]{0,11}$/.test(r.amount_minor)?r.amount_minor:null}});
 const links=new Map<string,{opening:string;journal:string}>();
 const invoiceMatches=new Map<string,{id:string;invoice:string;currentInvoice:string;evidence:string;corrections:{id:string;version:number;previous:string;invoice:string;actor:string;reason:string;created:string}[]}>();
 const split=v.status==='committed'&&object(v.commit_result).schema_version===3?readSplitHistory(value,scope,id):null;
 const unified=v.status==='committed'&&object(v.commit_result).schema_version===4?readUnifiedHistory(value,scope,id):null;
 if(split||unified)return {tenant:scope.tenant,property:scope.property,batch:id,provider:b.provider,sourceBatch:b.source_batch_id,cutover:b.cutover_date,fingerprint:b.export_sha256,status:'committed' as const,rows,links,invoiceMatches,split,unified};
 if(v.status==='committed'){
  const receipt=object(v.commit_result);
  const matches=receipt.schema_version===2?receipt.invoice_matches:[];
  if(![1,2].includes(receipt.schema_version as number)||!Array.isArray(matches)||!uuid(v.commit_actor_id)||!uuid(v.commit_request_id)||receipt.actor_id!==v.commit_actor_id||receipt.request_id!==v.commit_request_id||receipt.tenant_id!==scope.tenant||receipt.property_id!==scope.property||receipt.batch_id!==id||receipt.status!=='committed'||!Array.isArray(receipt.openings)||receipt.openings.length+matches.length!==rows.length)throw Error('Invalid migration posting receipt.');
  const journals=new Set<string>(),openings=new Set<string>();
  receipt.openings.forEach(raw=>{const r=object(raw),row=rows.find(row=>row.source===r.source_item_id);if(!row||!uuid(r.opening_id)||!uuid(r.journal_id)||links.has(row.source)||journals.has(r.journal_id)||openings.has(r.opening_id))throw Error('Invalid migration accounting references.');links.set(row.source,{opening:r.opening_id,journal:r.journal_id});journals.add(r.journal_id);openings.add(r.opening_id)});
  if(receipt.schema_version===2){
   const reconciliation=object(v.reconciliation);
   if(!uuid(receipt.reconciliation_id)||reconciliation.id!==receipt.reconciliation_id||reconciliation.actor_id!==v.commit_actor_id||!Array.isArray(reconciliation.decisions)||reconciliation.decisions.length!==rows.length||!Array.isArray(v.invoice_matches)||v.invoice_matches.length!==matches.length)throw Error('Invalid saved reconciliation.');
   const decisions=reconciliation.decisions.map(object),history=v.invoice_matches.map(object);
   if(new Set(decisions.map(d=>d.source_item_id)).size!==rows.length||new Set(history.map(m=>m.source_item_id)).size!==matches.length)throw Error('Duplicate source reconciliation.');
   for(const raw of matches){const m=object(raw),row=rows.find(r=>r.source===m.source_item_id),record=history.find(h=>h.source_item_id===m.source_item_id),decision=decisions.find(d=>d.source_item_id===m.source_item_id);
    if(!row||row.category!=='receivable'||row.amount!==m.amount_minor||!uuid(m.invoice_id)||links.has(row.source)||invoiceMatches.has(row.source)||!record||!uuid(record.id)||record.invoice_id!==m.invoice_id||record.amount_minor!==row.amount||record.reservation_id!==row.reservation||!decision||decision.disposition!=='existing_invoice'||decision.invoice_id!==m.invoice_id||typeof decision.evidence!=='string'||!decision.evidence.trim()||record.evidence!==decision.evidence)throw Error('Invalid existing invoice match.');
    const changes=record.corrections??[];if(!Array.isArray(changes))throw Error('Invalid invoice match correction history.');let current=m.invoice_id;const seen=new Set<string>();
    const corrections=changes.map((raw,index)=>{const c=object(raw);if(!uuid(c.id)||seen.has(c.id)||c.version!==index+1||c.previous_invoice_id!==current||!uuid(c.invoice_id)||c.invoice_id===current||!uuid(c.actor_id)||typeof c.reason!=='string'||c.reason.trim().length<4||typeof c.created_at!=='string'||!Number.isFinite(Date.parse(c.created_at)))throw Error('Invalid invoice match correction chain.');seen.add(c.id);const previous=current;current=c.invoice_id;return {id:c.id,version:index+1,previous,invoice:current,actor:c.actor_id,reason:c.reason,created:c.created_at}});
    if((record.current_invoice_id??m.invoice_id)!==current)throw Error('Current invoice does not match correction history.');
    invoiceMatches.set(row.source,{id:record.id,invoice:m.invoice_id,currentInvoice:current,evidence:decision.evidence,corrections});
   }
   for(const row of rows){const decision=decisions.find(d=>d.source_item_id===row.source);if(!decision||(!invoiceMatches.has(row.source)&&(decision.disposition!=='additional_balance'||decision.invoice_id!==null||!links.has(row.source))))throw Error('Source decision does not match the posting outcome.');}
  }
 }else if(v.commit_result!==null||v.commit_actor_id!==null||v.commit_request_id!==null)throw Error('Unposted migration contains a posting receipt.');
 return {tenant:scope.tenant,property:scope.property,batch:id,provider:b.provider,sourceBatch:b.source_batch_id,cutover:b.cutover_date,fingerprint:b.export_sha256,status:v.status as 'staged'|'committed',rows,links,invoiceMatches,split,unified};
}

export function financialMigrationDetailRows(detail:ReturnType<typeof readFinancialMigrationDetail>){
 if(detail.unified)return contextualSplitRows(unifiedHistoryRows(detail.unified),detail);
 if(detail.split)return contextualSplitRows(splitHistoryRows(detail.split),detail);
 return [['Source batch','Source PMS','Cutover date','Status','Source file SHA256','Source item','Source reference','Category','Amount in USD cents','Opening ID','Journal ID','Existing invoice ID','Match evidence','Tenant ID','Property ID','Batch ID'],...detail.rows.map(row=>[detail.sourceBatch,detail.provider,detail.cutover,detail.status,detail.fingerprint,row.source,row.reference,row.category,row.amount??'Invalid amount',detail.links.get(row.source)?.opening??'',detail.links.get(row.source)?.journal??'',detail.invoiceMatches.get(row.source)?.invoice??'',detail.invoiceMatches.get(row.source)?.evidence??'',detail.tenant,detail.property,detail.batch])];
}
export function financialMigrationCorrectionRows(detail:ReturnType<typeof readFinancialMigrationDetail>){
 if(detail.unified)return contextualSplitRows(unifiedCorrectionRows(detail.unified),detail);
 if(detail.split)return contextualSplitRows(splitCorrectionRows(detail.split),detail);
 return [['Source batch','Source PMS','Source item','Original invoice','Current invoice','Correction ID','Version','Previous invoice','Replacement invoice','Reason','Actor','Recorded at','Tenant ID','Property ID','Batch ID','Cutover date','Source file SHA256'],...Array.from(detail.invoiceMatches.entries()).flatMap(([source,match])=>match.corrections.map(c=>[detail.sourceBatch,detail.provider,source,match.invoice,match.currentInvoice,c.id,String(c.version),c.previous,c.invoice,c.reason,c.actor,c.created,detail.tenant,detail.property,detail.batch,detail.cutover,detail.fingerprint]))];
}

function contextualSplitRows(rows:string[][],detail:ReturnType<typeof readFinancialMigrationDetail>){
 const headings=['Tenant ID','Property ID','Batch ID','Source batch','Source PMS','Cutover date','Source file SHA256'];
 const values=[detail.tenant,detail.property,detail.batch,detail.sourceBatch,detail.provider,detail.cutover,detail.fingerprint];
 return rows.map((row,index)=>[...row,...(index===0?headings:values)]);
}
