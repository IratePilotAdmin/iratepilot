import {readFinancialPostingReview,type FinancialPostingSelection} from './financial-migration-posting';
export type SplitEntry={invoice:string;amount:string;evidence:string};
export function splitEntrySources(assessment:Record<string,unknown>,selection:FinancialPostingSelection){
 const review=readFinancialPostingReview(assessment.posting_review,selection);
 return review.rows.map(row=>{
  const raw=(review.raw.rows as Record<string,unknown>[]).find(r=>r.source_item_id===row.source),state=raw?.destination_state as Record<string,unknown>,invoices=state.invoices;
  if(!Array.isArray(invoices))throw Error('Missing destination invoice assessment.');
  const choices=invoices.filter((i):i is Record<string,unknown>=>!!i&&typeof i==='object'&&!Array.isArray(i)).filter(i=>i.tenant_id===selection.scope.tenant&&i.property_id===selection.scope.property&&i.reservation_id===row.reservation).map(i=>{if(typeof i.id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(i.id))throw Error('Invalid assessed invoice identity.');return {id:i.id,label:typeof i.invoice_number==='string'?i.invoice_number:i.id};});
  if(new Set(choices.map(i=>i.id)).size!==choices.length)throw Error('Duplicate assessed invoice.');
  return {source:row.source,amount:row.amount,category:row.category,invoices:row.category==='receivable'?choices:[]};
 });
}
export type SplitSource={source:string;amount:string;category:string};
export function prepareSplitEntries(source:SplitSource,entries:SplitEntry[],allowedInvoices:string[]){
 if(!/^[1-9][0-9]{0,11}$/.test(source.amount)||!entries.length)throw Error('Provide allocations for the source balance.');
 const seen=new Set<string>();let total=BigInt(0);
 const allocations=entries.map(entry=>{
  const amount=entry.amount.trim();if(!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(amount))throw Error('Enter a positive USD amount with at most two decimal places.');
  const [whole,fraction='']=amount.split('.'),minor=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
  if(minor<=BigInt(0)||minor>BigInt('999999999999'))throw Error('Allocation amount is out of range.');
  if(seen.has(entry.invoice))throw Error('Combine allocations to the same destination.');seen.add(entry.invoice);
  if(entry.invoice&&(source.category!=='receivable'||!allowedInvoices.includes(entry.invoice)))throw Error('Choose an invoice for this reservation.');
  const evidence=entry.evidence.trim();if(evidence.length<4||evidence.length>1000||/[\x00-\x1f\x7f]/.test(evidence))throw Error('Provide a supporting reference for each portion.');
  total+=minor;return {source_item_id:source.source,invoice_id:entry.invoice||null,amount_minor:minor.toString(),evidence};
 });
 if(total!==BigInt(source.amount))throw Error('Allocated amounts must equal the original balance.');
 return allocations;
}
