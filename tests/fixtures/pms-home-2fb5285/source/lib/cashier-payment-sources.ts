export type GuestCashReceipt = {entry_id: string; session_id: string; reference: string; amount_minor: string; remaining_minor: string; created_at: string};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const amount = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]{0,11})$/.test(v);
export function readGuestCashReceipts(value: unknown, scope: {tenant: string; property: string; reservation: string; actor: string}): GuestCashReceipt[] {
  if (![scope.tenant, scope.property, scope.reservation, scope.actor].every(uuid) || !value || typeof value !== 'object' || Array.isArray(value)) throw Error('Verified guest cash receipts required.');
  const r = value as Record<string, unknown>;
  if (r.schema_version !== 1 || r.tenant_id !== scope.tenant || r.property_id !== scope.property || r.reservation_id !== scope.reservation || r.actor_id !== scope.actor || r.currency !== 'USD' || r.complete !== true || !Array.isArray(r.receipts) || r.receipts.length > 1000) throw Error('Guest cash receipt scope changed. Reload the stay.');
  const seen = new Set<string>();
  return r.receipts.map(value => {
    const row = value as GuestCashReceipt | null;
    if (!row || !uuid(row.entry_id) || !uuid(row.session_id) || seen.has(row.entry_id) || typeof row.reference !== 'string' || row.reference.length < 4 || row.reference.length > 200 || !amount(row.amount_minor) || row.amount_minor === '0' || !amount(row.remaining_minor) || BigInt(row.remaining_minor) > BigInt(row.amount_minor) || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw Error('Invalid cash refund source.');
    seen.add(row.entry_id);
    return {entry_id: row.entry_id, session_id: row.session_id, reference: row.reference, amount_minor: row.amount_minor, remaining_minor: row.remaining_minor, created_at: row.created_at};
  });
}
