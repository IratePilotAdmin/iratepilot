import type {GuestDocumentModel} from './guest-documents';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Incomplete account credit note.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw Error('Incomplete credit note text.');
  return value;
}
function amount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,11})$/.test(value)) throw Error('Invalid credit note amount.');
  return BigInt(value);
}
function day(value: unknown): string {
  const s = text(value), d = new Date(s + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw Error('Invalid credit note date.');
  return s;
}
function dollars(value: bigint) {return `$${value / 100n}.${String(value % 100n).padStart(2, '0')}`;}
function party(value: unknown) {
  const p = object(value), name = text(p.legal_name || p.company_name);
  return {name, lines: ['company_name', 'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country_code'].filter(key => p[key] && p[key] !== name).map(key => text(p[key])).concat(p.tax_identifier ? ['Tax ID: '+text(p.tax_identifier)] : [])};
}

// Only approved document fields enter the printable representation.
export function billingCreditPrintModel(value: unknown, scope: {tenant: string; property: string; account: string; credit: string}): GuestDocumentModel {
 const doc=object(value);
 if(doc.tenant_id!==scope.tenant || doc.property_id!==scope.property || doc.account_id!==scope.account || doc.credit_id!==scope.credit || doc.currency!=='USD' || doc.money_moved!==false) throw Error('Credit note scope changed.');
 const number=text(doc.credit_number), invoice=text(doc.invoice_number);
 if(!/^CN-[1-9][0-9]*$/.test(number) || !/^BILL-[1-9][0-9]*$/.test(invoice)) throw Error('Credit note reference unavailable.');
 const credited=amount(doc.amount_minor);if(credited===0n) throw Error('Invalid credit amount.');
 const issuer=party(doc.issuer),recipient=party(doc.billing_party),issued=day(doc.issued_on),reason=text(doc.reason);
 return {title:`Credit note ${number}`,filename:`credit-note-${number}`,property:issuer.name,prepared:`Issued ${issued} · USD`,sections:[
  {heading:'From',paragraphs:[issuer.name,...issuer.lines]},
  {heading:'Bill to',paragraphs:[recipient.name,...recipient.lines]},
  {heading:'Invoice credit',facts:[['Original invoice',invoice],['Credit amount',dollars(credited)]],paragraphs:[reason]},
 ],footer:'This credit note reduces the original invoice. It is not a receipt or confirmation of a refund.'};
}
