export type CashierReview = {
  schema_version: 1; tenant_id: string; property_id: string; session_id: string; actor_id: string; cashier_id: string;
  drawer: string; currency: 'USD'; opening_minor: string; receipts_minor: string; refunds_minor: string;
  cash_in_minor: string; cash_out_minor: string; expected_minor: string; counted_minor: string; variance_minor: string;
  variance: 'balanced' | 'over' | 'short'; movement_count: number; active: boolean; includes_guest_payments: true; can_close: boolean;
};
type Scope = {tenant: string; property: string; actor: string; session: string};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
function minor(value: unknown, signed = false): bigint {
  if (typeof value !== 'string' || !(signed ? /^-?(0|[1-9][0-9]{0,11})$/ : /^(0|[1-9][0-9]{0,11})$/).test(value) || value === '-0') throw Error('Invalid cashier cash amount.');
  return BigInt(value);
}
export function readCashierReview(value: unknown, scope: Scope, counted: string): CashierReview {
  if (!Object.values(scope).every(uuid) || !value || typeof value !== 'object' || Array.isArray(value)) throw Error('Verified cashier review required.');
  const r = value as CashierReview;
  if (r.schema_version !== 1 || r.tenant_id !== scope.tenant || r.property_id !== scope.property || r.actor_id !== scope.actor || r.session_id !== scope.session || !uuid(r.cashier_id) || r.currency !== 'USD' || typeof r.drawer !== 'string' || !r.drawer.trim() || r.drawer.length > 80 || r.includes_guest_payments !== true || typeof r.active !== 'boolean' || typeof r.can_close !== 'boolean' || !Number.isSafeInteger(r.movement_count) || r.movement_count < 0 || r.movement_count > 20000 || r.counted_minor !== counted) throw Error('Cashier review scope or count changed.');
  const expected = minor(r.opening_minor) + minor(r.receipts_minor) - minor(r.refunds_minor) + minor(r.cash_in_minor) - minor(r.cash_out_minor);
  const variance = minor(r.counted_minor) - expected;
  if (minor(r.expected_minor, true) !== expected || minor(r.variance_minor, true) !== variance || r.variance !== (variance === BigInt(0) ? 'balanced' : variance > BigInt(0) ? 'over' : 'short')) throw Error('Cashier review does not reconcile.');
  return r;
}
