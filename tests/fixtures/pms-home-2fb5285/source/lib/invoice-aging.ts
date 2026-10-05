/** Invoice ledger calculation. Input must come from a complete, authorized ledger snapshot. */
export type IssuedInvoice = {id: string; tenant: string; property: string; issued_on: string; due_on: string; amount_minor: string};
export type InvoiceReduction = {id: string; invoice: string; effective_on: string; amount_minor: string; kind: 'payment_allocation' | 'credit_note'};
export type InvoiceAllocationReversal = {id: string; reduction: string; effective_on: string; amount_minor: string};
export type AgingBucket = 'not_due' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'days_91_plus';
const buckets: AgingBucket[] = ['not_due','days_1_30','days_31_60','days_61_90','days_91_plus'];
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function readInvoiceAging(value: unknown, scope: {tenant:string;property:string;actor:string;as_of:string}) {
 const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid aging report.');return v as Record<string,unknown>;};
 const amount=(v:unknown,max=12)=>{if(typeof v!=='string'||!new RegExp('^(0|[1-9][0-9]{0,'+(max-1)+'})$').test(v))throw Error('Invalid aging amount.');return BigInt(v);};
 const r=object(value),cutoff=day(scope.as_of);
 if(!uuid(scope.tenant)||!uuid(scope.property)||!uuid(scope.actor)||r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||r.as_of!==scope.as_of||r.currency!=='USD'||r.complete!==true||r.basis!=='issued_invoices_effective_allocations')throw Error('Aging report scope or completeness changed.');
 if(!Array.isArray(r.rows))throw Error('Incomplete aging rows.');
 const ids=new Set<string>(),numbers=new Set<string>(),totals=Object.fromEntries(buckets.map(b=>[b,BigInt(0)])) as Record<AgingBucket,bigint>;
 const rows=r.rows.map(value=>{
  const row=object(value);
  if(!uuid(row.invoice_id)||ids.has(row.invoice_id)||typeof row.number!=='string'||! /^[1-9][0-9]{0,11}$/.test(row.number)||numbers.has(row.number))throw Error('Invalid aging invoice identity.');
  ids.add(row.invoice_id);numbers.add(row.number);
  if(typeof row.issued_on!=='string'||typeof row.due_on!=='string'||day(row.issued_on)>cutoff||day(row.due_on)<day(row.issued_on))throw Error('Invalid aging invoice dates.');
  const days=Math.max(0,cutoff-day(row.due_on)),bucket:AgingBucket=days===0?'not_due':days<=30?'days_1_30':days<=60?'days_31_60':days<=90?'days_61_90':'days_91_plus';
  const issued=amount(row.issued_minor),allocated=amount(row.allocated_minor),credited=amount(row.credited_minor),outstanding=amount(row.outstanding_minor);
  if(issued===BigInt(0)||issued-allocated-credited!==outstanding||row.days_overdue!==days||row.bucket!==bucket)throw Error('Aging invoice balance or period does not reconcile.');
  if(row.recipient!==null&&(typeof row.recipient!=='string'||row.recipient.length>200))throw Error('Invalid aging recipient.');
  totals[bucket]+=outstanding;
  return {invoice_id:row.invoice_id,number:row.number,recipient:row.recipient??'Unspecified recipient',issued_on:row.issued_on,due_on:row.due_on,days_overdue:days,bucket,issued_minor:issued.toString(),allocated_minor:allocated.toString(),credited_minor:credited.toString(),outstanding_minor:outstanding.toString()};
 });
 const savedTotals=object(r.totals);let grand=BigInt(0);
 for(const bucket of buckets){if(amount(savedTotals[bucket],15)!==totals[bucket])throw Error('Aging totals do not reconcile.');grand+=totals[bucket];}
 if(amount(r.outstanding_minor,15)!==grand)throw Error('Aging grand total does not reconcile.');
 return {as_of:scope.as_of,currency:'USD' as const,rows,totals:Object.fromEntries(buckets.map(b=>[b,totals[b].toString()])) as Record<AgingBucket,string>,outstanding_minor:grand.toString()};
}
function day(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Invoice dates must be calendar dates.');
  const timestamp = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0,10) !== value) throw Error('Invalid invoice calendar date.');
  return timestamp / 86400000;
}
function money(value: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,11}$/.test(value)) throw Error('Invoice ledger amounts must be positive exact minor units.');
  return BigInt(value);
}
export function ageInvoices(input: {tenant: string; property: string; as_of: string; invoices: IssuedInvoice[]; reductions: InvoiceReduction[]; reversals: InvoiceAllocationReversal[]}) {
  if (!uuid(input.tenant) || !uuid(input.property)) throw Error('Invoice property scope required.');
  const cutoff = day(input.as_of), invoices = new Map<string, IssuedInvoice>(), reductions = new Map<string, InvoiceReduction>();
  const used = new Set<string>(), reduced = new Map<string,bigint>(), reversed = new Map<string,bigint>();
  function unique(id: string) {if (!uuid(id) || used.has(id)) throw Error('Invoice ledger identity is invalid or duplicated.'); used.add(id);}
  for (const invoice of input.invoices) {
    unique(invoice.id);money(invoice.amount_minor);
    if (invoice.tenant !== input.tenant || invoice.property !== input.property) throw Error('Invoice property scope differs.');
    if (day(invoice.due_on) < day(invoice.issued_on)) throw Error('Invoice due date precedes issue date.');
    invoices.set(invoice.id,invoice);
  }
  for (const reduction of input.reductions) {
    unique(reduction.id);money(reduction.amount_minor);
    const invoice = invoices.get(reduction.invoice);
    if (!invoice || !['payment_allocation','credit_note'].includes(reduction.kind) || day(reduction.effective_on) < day(invoice.issued_on)) throw Error('Invalid invoice allocation or credit.');
    reductions.set(reduction.id,reduction);
  }
  for (const reversal of input.reversals) {
    unique(reversal.id);const amount = money(reversal.amount_minor), original = reductions.get(reversal.reduction);
    if (!original || original.kind !== 'payment_allocation' || day(reversal.effective_on) < day(original.effective_on)) throw Error('Invalid payment allocation reversal.');
    const total = (reversed.get(original.id) ?? BigInt(0)) + amount;
    if (total > money(original.amount_minor)) throw Error('Allocation reversals exceed the allocated payment.');
    reversed.set(original.id,total);
    if (day(reversal.effective_on) <= cutoff) reduced.set(original.invoice,(reduced.get(original.invoice) ?? BigInt(0)) - amount);
  }
  for (const reduction of input.reductions) if (day(reduction.effective_on) <= cutoff) reduced.set(reduction.invoice,(reduced.get(reduction.invoice) ?? BigInt(0)) + money(reduction.amount_minor));
  const totals = Object.fromEntries(buckets.map(bucket => [bucket,BigInt(0)])) as Record<AgingBucket,bigint>;
  const rows = [...invoices.values()].filter(invoice => day(invoice.issued_on) <= cutoff).map(invoice => {
    const original = money(invoice.amount_minor), applied = reduced.get(invoice.id) ?? BigInt(0), outstanding = original - applied;
    if (applied < BigInt(0) || outstanding < BigInt(0)) throw Error('Invoice allocations exceed the invoice balance.');
    const days = Math.max(0,cutoff-day(invoice.due_on)), bucket: AgingBucket = days === 0 ? 'not_due' : days <= 30 ? 'days_1_30' : days <= 60 ? 'days_31_60' : days <= 90 ? 'days_61_90' : 'days_91_plus';
    totals[bucket] += outstanding;
    return {invoice_id:invoice.id,due_on:invoice.due_on,days_overdue:days,bucket,issued_minor:original.toString(),applied_minor:applied.toString(),outstanding_minor:outstanding.toString()};
  }).sort((a,b) => a.due_on.localeCompare(b.due_on) || a.invoice_id.localeCompare(b.invoice_id));
  return {as_of:input.as_of,rows,totals:Object.fromEntries(buckets.map(bucket => [bucket,totals[bucket].toString()])) as Record<AgingBucket,string>,outstanding_minor:rows.reduce((sum,row)=>sum+BigInt(row.outstanding_minor),BigInt(0)).toString()};
}
