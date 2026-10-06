export type CashierOpenRequest = {version: 1; actor: string; tenant: string; property: string; request: string; drawer: string; opening_minor: string};
type Scope = Pick<CashierOpenRequest, 'actor' | 'tenant' | 'property'>;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function cashierOpenKey(scope: Scope): string {
  if (![scope.actor, scope.tenant, scope.property].every(uuid)) throw Error('Verified cashier workspace required.');
  return `iratepilot-cashier-open:${scope.actor}:${scope.tenant}:${scope.property}`;
}
export function readCashierOpen(value: unknown, scope: Scope): CashierOpenRequest {
  cashierOpenKey(scope);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid saved cashier opening.');
  const r = value as CashierOpenRequest;
  if (r.version !== 1 || r.actor !== scope.actor || r.tenant !== scope.tenant || r.property !== scope.property || !uuid(r.request) || typeof r.drawer !== 'string' || r.drawer !== r.drawer.trim() || r.drawer.length < 1 || r.drawer.length > 80 || /[\x00-\x1f\x7f]/.test(r.drawer) || typeof r.opening_minor !== 'string' || !/^(0|[1-9][0-9]{0,11})$/.test(r.opening_minor)) throw Error('Saved cashier opening does not match this workspace.');
  return {version: 1, actor: r.actor, tenant: r.tenant, property: r.property, request: r.request, drawer: r.drawer, opening_minor: r.opening_minor};
}
/** Save and verify before sending. Existing uncertain requests must be resolved first. */
export function retainCashierOpen(storage: Pick<Storage, 'getItem' | 'setItem'>, request: CashierOpenRequest): void {
  const normalized = readCashierOpen(request, request), key = cashierOpenKey(request), encoded = JSON.stringify(normalized);
  const prior = storage.getItem(key);
  if (prior !== null && JSON.stringify(readCashierOpen(JSON.parse(prior), request)) !== encoded) throw Error('Resolve the previous cashier opening before starting another.');
  storage.setItem(key, encoded);
  if (storage.getItem(key) !== encoded) throw Error('Unable to retain cashier opening. Nothing should be submitted.');
}
export function loadCashierOpen(storage: Pick<Storage, 'getItem'>, scope: Scope): CashierOpenRequest | null {
  const value = storage.getItem(cashierOpenKey(scope));
  return value === null ? null : readCashierOpen(JSON.parse(value), scope);
}

export type CashierOpenReceipt = {session_id: string; opened_at: string; business_date: string; time_zone: string; replayed: boolean};
export function matchCashierOpenReceipt(value: unknown, request: CashierOpenRequest): CashierOpenReceipt {
  readCashierOpen(request, request);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Cashier opening receipt is unavailable. Recover the request.');
  const r = value as Record<string, unknown>;
  if (r.schema_version !== 1 || r.tenant_id !== request.tenant || r.property_id !== request.property || r.request_id !== request.request || r.session_id !== request.request || r.actor_id !== request.actor || r.cashier_id !== request.actor || r.drawer !== request.drawer || r.opening_minor !== request.opening_minor || r.currency !== 'USD' || typeof r.replayed !== 'boolean' || typeof r.opened_at !== 'string' || !Number.isFinite(Date.parse(r.opened_at)) || typeof r.business_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.business_date) || typeof r.time_zone !== 'string' || !r.time_zone.trim()) throw Error('Cashier opening receipt does not match. Recover the original request.');
  return {session_id: request.request, opened_at: r.opened_at, business_date: r.business_date, time_zone: r.time_zone, replayed: r.replayed};
}
/** Only an exact verified receipt may retire a local pending opening. */
export function acknowledgeCashierOpen(storage: Pick<Storage, 'getItem' | 'removeItem'>, request: CashierOpenRequest, receipt: unknown): CashierOpenReceipt {
  const matched = matchCashierOpenReceipt(receipt, request), key = cashierOpenKey(request);
  const saved = loadCashierOpen(storage, request);
  if (!saved || JSON.stringify(saved) !== JSON.stringify(readCashierOpen(request, request))) throw Error('Saved cashier opening changed. Recover it before continuing.');
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw Error('Opening succeeded, but local recovery state could not be cleared.');
  return matched;
}

export function acknowledgeCancelledCashierOpen(storage: Pick<Storage, 'getItem' | 'removeItem'>, request: CashierOpenRequest, receipt: unknown): void {
  const normalized = readCashierOpen(request, request);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw Error('Cashier cancellation receipt is unavailable.');
  const r = receipt as Record<string, unknown>;
  if (r.schema_version !== 1 || r.tenant_id !== request.tenant || r.property_id !== request.property || r.actor_id !== request.actor || r.request_id !== request.request || r.drawer !== request.drawer || r.opening_minor !== request.opening_minor || r.retired !== true || typeof r.replayed !== 'boolean') throw Error('Cashier cancellation receipt does not match.');
  if (JSON.stringify(loadCashierOpen(storage, request)) !== JSON.stringify(normalized)) throw Error('Saved opening changed. Recover before continuing.');
  const key = cashierOpenKey(request); storage.removeItem(key);
  if (storage.getItem(key) !== null) throw Error('Cancellation succeeded, but local recovery state could not be cleared.');
}
