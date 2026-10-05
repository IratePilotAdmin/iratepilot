import {readCashierReview, type CashierReview} from './cashier-review';
export type CashierCloseRequest = {version: 1; actor: string; tenant: string; property: string; session: string; request: string; review: CashierReview; reason: string};
type Scope = Pick<CashierCloseRequest, 'actor' | 'tenant' | 'property' | 'session'>;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const canonical = (v: unknown): string => JSON.stringify(v && typeof v === 'object' ? Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)]) : v);
export function pendingCashierCloses(storage: Pick<Storage, 'getItem' | 'key' | 'length'>, scope: Omit<Scope, 'session'>): CashierCloseRequest[] {
  if (![scope.actor, scope.tenant, scope.property].every(uuid)) throw Error('Verified recovery workspace required.');
  const prefix = `iratepilot-cashier-close:${scope.actor}:${scope.tenant}:${scope.property}:`, requests: CashierCloseRequest[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i); if (!key?.startsWith(prefix)) continue;
    const request = loadCashierClose(storage, {...scope, session: key.slice(prefix.length)});
    if (request) requests.push(request);
  }
  return requests;
}
export function cashierCloseKey(scope: Scope): string {
  if (![scope.actor, scope.tenant, scope.property, scope.session].every(uuid)) throw Error('Verified cashier close scope required.');
  return `iratepilot-cashier-close:${scope.actor}:${scope.tenant}:${scope.property}:${scope.session}`;
}
export function readCashierClose(value: unknown, scope: Scope): CashierCloseRequest {
  cashierCloseKey(scope);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid saved drawer close.');
  const r = value as CashierCloseRequest;
  if (r.version !== 1 || r.actor !== scope.actor || r.tenant !== scope.tenant || r.property !== scope.property || r.session !== scope.session || !uuid(r.request) || !r.review || typeof r.reason !== 'string' || r.reason !== r.reason.trim() || !r.reason || r.reason.length > 500 || /[\x00-\x1f\x7f]/.test(r.reason)) throw Error('Saved close does not match this drawer.');
  readCashierReview(r.review, {actor: scope.actor, tenant: scope.tenant, property: scope.property, session: scope.session}, r.review.counted_minor);
  if (!r.review.active || !r.review.can_close || r.review.cashier_id !== scope.actor) throw Error('Only your active drawer can be closed.');
  return r;
}
export function loadCashierClose(storage: Pick<Storage, 'getItem'>, scope: Scope): CashierCloseRequest | null {
  const value = storage.getItem(cashierCloseKey(scope)); return value === null ? null : readCashierClose(JSON.parse(value), scope);
}
export function retainCashierClose(storage: Pick<Storage, 'getItem' | 'setItem'>, request: CashierCloseRequest): void {
  const scope = {actor: request.actor, tenant: request.tenant, property: request.property, session: request.session};
  readCashierClose(request, scope); const prior = loadCashierClose(storage, scope);
  if (prior && canonical(prior) !== canonical(request)) throw Error('Resolve the previous close request before changing the review.');
  const key = cashierCloseKey(scope), encoded = JSON.stringify(request); storage.setItem(key, encoded);
  if (storage.getItem(key) !== encoded) throw Error('Unable to save close request. Do not submit.');
}

export function acknowledgeCashierClose(storage: Pick<Storage, 'getItem' | 'removeItem'>, request: CashierCloseRequest, value: unknown): {closed_at: string; replayed: boolean} {
  const scope = {actor: request.actor, tenant: request.tenant, property: request.property, session: request.session};
  readCashierClose(request, scope);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Cashier close receipt is unavailable. Recover the request.');
  const r = value as Record<string, unknown>;
  if (r.schema_version !== 1 || r.tenant_id !== request.tenant || r.property_id !== request.property || r.actor_id !== request.actor || r.session_id !== request.session || r.request_id !== request.request || r.reason !== request.reason || canonical(r.review) !== canonical(request.review) || typeof r.closed_at !== 'string' || !Number.isFinite(Date.parse(r.closed_at)) || typeof r.replayed !== 'boolean') throw Error('Cashier close receipt does not match the saved review.');
  if (canonical(loadCashierClose(storage, scope)) !== canonical(request)) throw Error('Saved close request changed. Recover before continuing.');
  const key = cashierCloseKey(scope); storage.removeItem(key);
  if (storage.getItem(key) !== null) throw Error('Drawer closed, but local recovery state could not be cleared.');
  return {closed_at: r.closed_at, replayed: r.replayed};
}
export function acknowledgeCancelledCashierClose(storage: Pick<Storage, 'getItem' | 'removeItem'>, request: CashierCloseRequest, value: unknown): void {
  const scope = {actor: request.actor, tenant: request.tenant, property: request.property, session: request.session};
  readCashierClose(request, scope);
  const r = value as Record<string, unknown> | null;
  if (!r || r.schema_version !== 1 || r.tenant_id !== scope.tenant || r.property_id !== scope.property || r.actor_id !== scope.actor || r.session_id !== scope.session || r.request_id !== request.request || r.retired !== true || typeof r.replayed !== 'boolean') throw Error('Close cancellation receipt does not match.');
  if (canonical(loadCashierClose(storage, scope)) !== canonical(request)) throw Error('Saved close changed. Recover before continuing.');
  const key = cashierCloseKey(scope); storage.removeItem(key); if (storage.getItem(key) !== null) throw Error('Cancellation confirmed but local recovery state remains.');
}
