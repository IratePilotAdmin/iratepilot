export type CashPaymentRequest = {version: 1; actor: string; tenant: string; property: string; session: string; reservation: string; request: string; kind: 'external_payment' | 'external_refund'; amount_minor: string; reference: string; reason: string; target: string | null};
type Scope = Pick<CashPaymentRequest, 'actor' | 'tenant' | 'property' | 'reservation'>;
export function pendingCashPayments(storage: Pick<Storage, 'length' | 'key' | 'getItem'>, scope: Omit<Scope, 'reservation'>): CashPaymentRequest[] {
  cashPaymentKey({...scope, reservation: scope.property});
  const prefix = `iratepilot-cashier-payment:${scope.actor}:${scope.tenant}:${scope.property}:`, requests: CashPaymentRequest[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index); if (!key?.startsWith(prefix)) continue;
    const reservation = key.slice(prefix.length), raw = storage.getItem(key);
    if (raw !== null) requests.push(readCashPayment(JSON.parse(raw), {...scope, reservation}));
  }
  return requests;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export function cashPaymentKey(s: Scope): string {
  if (![s.actor, s.tenant, s.property, s.reservation].every(uuid)) throw Error('Verified guest cash payment scope required.');
  return `iratepilot-cashier-payment:${s.actor}:${s.tenant}:${s.property}:${s.reservation}`;
}
export function readCashPayment(value: unknown, scope: Scope): CashPaymentRequest {
  cashPaymentKey(scope); const r = value as CashPaymentRequest | null;
  if (!r || r.version !== 1 || r.actor !== scope.actor || r.tenant !== scope.tenant || r.property !== scope.property || r.reservation !== scope.reservation || !uuid(r.session) || !uuid(r.request) || !['external_payment','external_refund'].includes(r.kind) || typeof r.amount_minor !== 'string' || !/^[1-9][0-9]{0,11}$/.test(r.amount_minor) || typeof r.reference !== 'string' || r.reference !== r.reference.trim() || r.reference.length < 4 || r.reference.length > 200 || typeof r.reason !== 'string' || r.reason !== r.reason.trim() || r.reason.length < 4 || r.reason.length > 500 || (r.kind === 'external_payment' ? r.target !== null : !uuid(r.target))) throw Error('Invalid saved guest cash payment.');
  return {version: 1, actor: r.actor, tenant: r.tenant, property: r.property, reservation: r.reservation, session: r.session, request: r.request, kind: r.kind, amount_minor: r.amount_minor, reference: r.reference, reason: r.reason, target: r.target};
}
export function loadCashPayment(storage: Pick<Storage, 'getItem'>, scope: Scope): CashPaymentRequest | null {
  const raw = storage.getItem(cashPaymentKey(scope)); return raw === null ? null : readCashPayment(JSON.parse(raw), scope);
}
export function retainCashPayment(storage: Pick<Storage, 'getItem' | 'setItem'>, request: CashPaymentRequest): void {
  const raw = JSON.stringify(readCashPayment(request, request)), saved = loadCashPayment(storage, request);
  if (saved && JSON.stringify(saved) !== raw) throw Error('Resolve the saved guest cash payment first.');
  const key = cashPaymentKey(request); storage.setItem(key, raw); if (storage.getItem(key) !== raw) throw Error('Unable to retain cash payment. Do not submit.');
}
export function acknowledgeCashPayment(storage: Pick<Storage, 'getItem' | 'removeItem'>, request: CashPaymentRequest, value: unknown): void {
  const normalized = readCashPayment(request, request), r = value as Record<string, unknown> | null, e = r?.folio_receipt as Record<string, unknown> | null;
  if (!r || !e || r.schema_version !== 1 || r.tenant_id !== request.tenant || r.property_id !== request.property || r.actor_id !== request.actor || r.session_id !== request.session || r.reservation_id !== request.reservation || r.request_id !== request.request || r.method !== 'cash' || typeof r.replayed !== 'boolean' || !uuid(e.entry_id) || e.request_id !== request.request || e.kind !== request.kind || e.amount_minor !== Number(request.amount_minor) || e.reference !== request.reference || e.reason !== request.reason || e.target_entry_id !== request.target || e.payment_recording !== 'external_only' || e.replayed !== r.replayed || typeof e.created_at !== 'string' || !Number.isFinite(Date.parse(e.created_at))) throw Error('Cash payment receipt does not match the saved request.');
  if (JSON.stringify(loadCashPayment(storage, request)) !== JSON.stringify(normalized)) throw Error('Saved guest cash payment changed.');
  const key = cashPaymentKey(request); storage.removeItem(key); if (storage.getItem(key) !== null) throw Error('Cash payment recorded but recovery state remains.');
}
export function acknowledgeCancelledCashPayment(storage: Pick<Storage, 'getItem' | 'removeItem'>, request: CashPaymentRequest, value: unknown): void {
  const normalized = readCashPayment(request, request), r = value as Record<string, unknown> | null;
  if (!r || r.schema_version !== 1 || r.tenant_id !== request.tenant || r.property_id !== request.property || r.actor_id !== request.actor || r.session_id !== request.session || r.reservation_id !== request.reservation || r.request_id !== request.request || r.retired !== true || typeof r.replayed !== 'boolean' || typeof r.retired_at !== 'string' || !Number.isFinite(Date.parse(r.retired_at))) throw Error('Cash cancellation receipt does not match.');
  if (JSON.stringify(loadCashPayment(storage, request)) !== JSON.stringify(normalized)) throw Error('Saved guest cash payment changed.');
  const key = cashPaymentKey(request); storage.removeItem(key); if (storage.getItem(key) !== null) throw Error('Cancellation confirmed but recovery state remains.');
}
