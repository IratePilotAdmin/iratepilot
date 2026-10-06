import type {GuestDocumentModel} from './guest-documents';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Incomplete account invoice.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw Error('Incomplete invoice text.');
  return value;
}
function amount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,11})$/.test(value)) throw Error('Invalid invoice amount.');
  return BigInt(value);
}
function day(value: unknown): string {
  const s = text(value), d = new Date(s + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw Error('Invalid invoice date.');
  return s;
}
function dollars(value: bigint) {return `$${value / 100n}.${String(value % 100n).padStart(2, '0')}`;}
function party(value: unknown) {
  const p = object(value), name = text(p.legal_name || p.company_name);
  return {name, lines: ['company_name', 'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country_code'].filter(key => p[key] && p[key] !== name).map(key => text(p[key])).concat(p.tax_identifier ? ['Tax ID: '+text(p.tax_identifier)] : [])};
}

// Whitelist display fields: internal routing snapshots, IDs and reasons never enter the print model.
export function billingInvoicePrintModel(value: unknown, scope: {tenant: string; property: string; account: string; invoice: string}): GuestDocumentModel {
  const doc = object(value);
  if (doc.tenant_id !== scope.tenant || doc.property_id !== scope.property || doc.account_id !== scope.account || doc.invoice_id !== scope.invoice || doc.currency !== 'USD' || doc.balance_basis !== 'current_recorded_allocations') throw Error('Invoice scope changed.');
  const number = text(doc.invoice_number);
  if (!/^BILL-[1-9][0-9]*$/.test(number)) throw Error('Invoice reference unavailable.');
  const issued = amount(doc.original_minor), credited = amount(doc.credited_minor), paid = amount(doc.allocated_payment_minor), outstanding = amount(doc.outstanding_minor);
  if (issued === 0n || issued - credited - paid !== outstanding) throw Error('Invoice balance does not reconcile.');
  if (!Array.isArray(doc.lines) || doc.lines.length < 1 || doc.lines.length > 10000) throw Error('Invoice lines unavailable.');
  let sum = 0n, creditSum = 0n;
  const seen = new Set<string>();
  const rows = doc.lines.map(value => {
    const line = object(value), route = text(line.route_id), charge = amount(line.amount_minor), credit = amount(line.credited_minor);
    if (seen.has(route) || charge === 0n || credit > charge) throw Error('Invoice lines do not reconcile.');
    seen.add(route); sum += charge; creditSum += credit;
    const snapshot = object(object(line.source_snapshot).source_snapshot);
    return [text(object(snapshot.line).description), dollars(charge)];
  });
  if (sum !== issued || creditSum !== credited) throw Error('Invoice line totals do not reconcile.');
  const issuer = party(doc.issuer), recipient = party(doc.billing_party), issuedOn = day(doc.issued_on), due = day(doc.due_on);
  if (due < issuedOn) throw Error('Invoice dates do not reconcile.');
  return {title: `Invoice ${number}`, filename: `invoice-${number}`, property: issuer.name, prepared: `Issued ${issuedOn} · Due ${due} · USD`, sections: [
    {heading: 'From', paragraphs: [issuer.name, ...issuer.lines]},
    {heading: 'Bill to', paragraphs: [recipient.name, ...recipient.lines]},
    {heading: 'Issued charges', headers: ['Description', 'Amount (USD)'], rows, facts: [['Issued total', dollars(issued)]]},
    {heading: 'Current recorded balance', facts: [['Credits', dollars(credited)], ['Applied payments', dollars(paid)], ['Outstanding', dollars(outstanding)]]},
  ], footer: 'Billing details and issued charges are preserved. The balance reflects recorded credits and payment allocations when this copy was prepared; it does not verify bank settlement.'};
}
