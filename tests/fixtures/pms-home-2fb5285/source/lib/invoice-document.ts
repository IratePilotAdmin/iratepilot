import type {GuestDocumentModel} from './guest-documents';
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid issued invoice.');return value as RecordValue;}
function text(value: unknown, max = 500): string {if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Incomplete issued invoice.');return value;}
function money(value: unknown): bigint {if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,11})$/.test(value)) throw Error('Invalid invoice amount.');return BigInt(value);}
function date(value: unknown): string {const result = text(value,10), parsed = Date.parse(result+'T00:00:00Z');if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,10)!==result) throw Error('Invalid invoice date.');return result;}
function party(value: unknown) {const source = object(value), name = source.legal_name || source.company_name;return {name:text(name,200),address:['company_name','address_line1','address_line2','city','region','postal_code','country_code'].filter(key=>source[key] && source[key]!==name).map(key=>text(source[key],200))};}
export function readCreditDocument(value:unknown,scope:{tenant:string;property:string;actor:string;credit:string;invoice:string}) {
 const r=object(value),semantics=object(r.semantics);
 if(r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.actor_id!==scope.actor||r.credit_id!==scope.credit||r.invoice_id!==scope.invoice||r.currency!=='USD'||semantics.issued_document!=='immutable'||semantics.internal_source_snapshot_included!==false||semantics.internal_reason_included!==false)throw Error('Credit document scope changed.');
 const amount=money(r.amount_minor),number=text(r.number,12),invoiceNumber=text(r.invoice_number,12);
 if(amount===BigInt(0)||! /^[1-9][0-9]{0,11}$/.test(number)||! /^[1-9][0-9]{0,11}$/.test(invoiceNumber)||!Array.isArray(r.lines)||r.lines.length<1||r.lines.length>10000)throw Error('Incomplete credit document.');
 let total=BigInt(0),last=0;
 const lines=r.lines.map(value=>{const line=object(value),n=line.invoice_line_number,amount=money(line.amount_minor);if(typeof n!=='number'||!Number.isInteger(n)||n<=last||n>10000||amount===BigInt(0))throw Error('Invalid credited invoice line.');last=n;total+=amount;return {invoice_line_number:n,description:text(line.description),category:text(line.category,100),amount_minor:amount.toString()};});
 if(total!==amount)throw Error('Credit lines do not reconcile.');
 return {id:scope.credit,invoice:scope.invoice,number,invoice_number:invoiceNumber,effective_on:date(r.effective_on),amount_minor:amount.toString(),issuer:party(r.issuer),recipient:party(r.billing_party),lines};
}
export function creditPrintModel(credit:ReturnType<typeof readCreditDocument>):GuestDocumentModel {
 const dollars=(value:string)=>{const s=value.padStart(3,'0');return '$'+s.slice(0,-2)+'.'+s.slice(-2);};
 return {title:'Credit note '+credit.number,filename:'credit-note-'+credit.number,property:credit.issuer.name,prepared:'Invoice '+credit.invoice_number+' · Effective '+credit.effective_on+' · USD',sections:[{heading:'Issuer',paragraphs:[credit.issuer.name,...credit.issuer.address]},{heading:'Bill to',paragraphs:[credit.recipient.name,...credit.recipient.address]},{heading:'Credited charges',headers:['Original invoice line','Description','Credit (USD)'],rows:credit.lines.map(line=>[String(line.invoice_line_number),line.description,dollars(line.amount_minor)]),facts:[['Credit total',dollars(credit.amount_minor)]]}],footer:'This credit note records a reduction to the referenced invoice. It is not a payment refund receipt.'};
}
export function invoicePrintModel(invoice: ReturnType<typeof readInvoiceDocument>): GuestDocumentModel {
 const dollars=(value:string)=>{const digits=value.padStart(3,'0');return '$'+digits.slice(0,-2)+'.'+digits.slice(-2);};
 return {title:'Invoice '+invoice.number,filename:'invoice-'+invoice.number,property:invoice.issuer.name,prepared:'Issued '+invoice.issued_on+' · Due '+invoice.due_on+' · USD',sections:[
  {heading:'Issuer',paragraphs:[invoice.issuer.name,...invoice.issuer.address]},
  {heading:'Bill to',paragraphs:[invoice.recipient.name,...invoice.recipient.address]},
  {heading:'Issued charges',headers:['Description','Amount (USD)'],rows:invoice.lines.map(line=>[line.description,dollars(line.amount_minor)]),facts:[['Issued total',dollars(invoice.issued_minor)]]},
  {heading:'Balance as of '+invoice.balance_as_of,facts:[['Applied payments',dollars(invoice.allocated_minor)],['Credit notes',dollars(invoice.credited_minor)],['Outstanding',dollars(invoice.outstanding_minor)]]}
 ],footer:'Issued charges and billing details are preserved. The balance reflects payment allocations and credit notes effective on the date shown.'};
}
export function readInvoiceDocument(value: unknown, scope: {tenant: string; property: string; actor: string; invoice: string}) {
  const r=object(value), semantics=object(r.semantics);
  if(r.schema_version!==1 || r.tenant_id!==scope.tenant || r.property_id!==scope.property || r.actor_id!==scope.actor || r.invoice_id!==scope.invoice || r.currency!=='USD' || semantics.issued_document!=='immutable' || semantics.balance!=='current_effective_ledger' || semantics.processor_settlement_verified!==false || semantics.internal_source_snapshot_included!==false) throw Error('Invoice scope or document contract changed.');
  const issued=money(r.issued_minor),allocated=money(r.allocated_minor),credited=money(r.credited_minor),outstanding=money(r.outstanding_minor);
  if(issued===BigInt(0) || issued-allocated-credited!==outstanding)throw Error('Invoice balance does not reconcile.');
  if(!Array.isArray(r.lines) || r.lines.length<1 || r.lines.length>10000)throw Error('Invoice lines are incomplete.');
  let total=BigInt(0);
  const lines=r.lines.map((value,index)=>{const line=object(value),amount=money(line.amount_minor);if(line.line_number!==index+1 || amount===BigInt(0))throw Error('Invoice line sequence or amount is invalid.');total+=amount;return {number:index+1,description:text(line.description),category:text(line.category,100),amount_minor:amount.toString()};});
  if(total!==issued)throw Error('Invoice lines do not match the issued amount.');
  const issuedOn=date(r.issued_on),dueOn=date(r.due_on),asOf=date(r.balance_as_of),number=text(r.number,12);
  if(!/^[1-9][0-9]{0,11}$/.test(number) || dueOn<issuedOn || asOf<issuedOn)throw Error('Invalid invoice number or dates.');
  return {id:scope.invoice,number,issued_on:issuedOn,due_on:dueOn,balance_as_of:asOf,issuer:party(r.issuer),recipient:party(r.billing_party),lines,issued_minor:issued.toString(),allocated_minor:allocated.toString(),credited_minor:credited.toString(),outstanding_minor:outstanding.toString()};
}
