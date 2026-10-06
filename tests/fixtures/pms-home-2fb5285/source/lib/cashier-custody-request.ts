export type CustodyRequest = {version: 1; actor: string; tenant: string; property: string; session: string; request: string; kind: 'cash_in' | 'cash_out'; amount_minor: string; reason: string};
type Scope = Pick<CustodyRequest, 'actor' | 'tenant' | 'property' | 'session'>;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export function custodyKey(s: Scope): string {
  if (![s.actor, s.tenant, s.property, s.session].every(uuid)) throw Error('Verified cash movement scope required.');
  return `iratepilot-cashier-custody:${s.actor}:${s.tenant}:${s.property}:${s.session}`;
}
export function pendingCustody(storage: Pick<Storage, 'getItem' | 'key' | 'length'>, scope: Omit<Scope, 'session'>): CustodyRequest[] {
  if (![scope.actor, scope.tenant, scope.property].every(uuid)) throw Error('Verified cash recovery scope required.');
  const prefix = `iratepilot-cashier-custody:${scope.actor}:${scope.tenant}:${scope.property}:`, requests: CustodyRequest[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i); if (!key?.startsWith(prefix)) continue;
    const saved = loadCustody(storage, {...scope, session: key.slice(prefix.length)}); if (saved) requests.push(saved);
  }
  return requests;
}
export function readCustody(value: unknown, scope: Scope): CustodyRequest {
  custodyKey(scope); const r = value as CustodyRequest | null;
  if (!r || r.version !== 1 || r.actor !== scope.actor || r.tenant !== scope.tenant || r.property !== scope.property || r.session !== scope.session || !uuid(r.request) || !['cash_in', 'cash_out'].includes(r.kind) || typeof r.amount_minor !== 'string' || !/^[1-9][0-9]{0,11}$/.test(r.amount_minor) || typeof r.reason !== 'string' || !r.reason.trim() || r.reason !== r.reason.trim() || r.reason.length > 500 || /[\x00-\x1f\x7f]/.test(r.reason)) throw Error('Invalid saved cash movement.');
  return {version: 1, actor: r.actor, tenant: r.tenant, property: r.property, session: r.session, request: r.request, kind: r.kind, amount_minor: r.amount_minor, reason: r.reason};
}
export function loadCustody(storage: Pick<Storage, 'getItem'>, scope: Scope): CustodyRequest | null {
  const raw = storage.getItem(custodyKey(scope)); return raw === null ? null : readCustody(JSON.parse(raw), scope);
}
export function retainCustody(storage: Pick<Storage, 'getItem' | 'setItem'>, request: CustodyRequest): void {
  const normalized = readCustody(request, request), raw = JSON.stringify(normalized), prior = loadCustody(storage, request);
  if (prior && JSON.stringify(prior) !== raw) throw Error('Resolve the saved cash movement first.');
  const key = custodyKey(request); storage.setItem(key, raw); if (storage.getItem(key) !== raw) throw Error('Unable to retain cash movement. Do not submit.');
}
export function acknowledgeCustody(storage: Pick<Storage, 'getItem' | 'removeItem'>, request: CustodyRequest, value: unknown): void {
  const normalized = readCustody(request, request), r = value as Record<string, unknown> | null;
  if (!r || r.schema_version !== 1 || r.tenant_id !== request.tenant || r.property_id !== request.property || r.actor_id !== request.actor || r.session_id !== request.session || r.request_id !== request.request || r.kind !== request.kind || r.amount_minor !== request.amount_minor || r.reason !== request.reason || typeof r.created_at !== 'string' || !Number.isFinite(Date.parse(r.created_at)) || typeof r.replayed !== 'boolean') throw Error('Cash movement receipt does not match.');
  if (JSON.stringify(loadCustody(storage, request)) !== JSON.stringify(normalized)) throw Error('Saved cash movement changed. Recover it first.');
  const key = custodyKey(request); storage.removeItem(key); if (storage.getItem(key) !== null) throw Error('Cash movement recorded but local recovery state remains.');
}
export function acknowledgeCancelledCustody(storage: Pick<Storage, 'getItem' | 'removeItem'>, request: CustodyRequest, value: unknown): void {
  const normalized = readCustody(request, request), r = value as Record<string, unknown> | null;
  if (!r || r.schema_version !== 1 || r.tenant_id !== request.tenant || r.property_id !== request.property || r.actor_id !== request.actor || r.session_id !== request.session || r.request_id !== request.request || r.retired !== true || typeof r.replayed !== 'boolean') throw Error('Cash cancellation receipt does not match.');
  if (JSON.stringify(loadCustody(storage, request)) !== JSON.stringify(normalized)) throw Error('Saved cash movement changed. Recover before continuing.');
  const key = custodyKey(request); storage.removeItem(key); if (storage.getItem(key) !== null) throw Error('Cancellation confirmed but local recovery data remains.');
}
