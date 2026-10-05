export type ActiveCashier = {
  session_id: string; cashier_id: string; drawer: string; currency: 'USD';
  opening_minor: string; opened_at: string; business_date: string; time_zone: string; is_mine: boolean;
};
export type ActiveCashiers = {scope: 'property' | 'own_sessions'; sessions: ActiveCashier[]};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid active cashier response.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw Error('Incomplete active cashier response.');
  return value;
}
export function readActiveCashiers(value: unknown, tenant: string, property: string, actor: string, role: string): ActiveCashiers {
  const data = record(value), expectedScope = role === 'owner' || role === 'manager' ? 'property' : 'own_sessions';
  if (!['owner', 'manager', 'staff'].includes(role) || data.schema_version !== 1 || data.tenant_id !== tenant || data.property_id !== property || data.actor_id !== actor || data.complete !== true || data.scope !== expectedScope || !Array.isArray(data.sessions) || data.sessions.length > 1000) throw Error('Active cashier scope changed. Reload the workspace.');
  const sessions = new Set<string>(), cashiers = new Set<string>(), drawers = new Set<string>();
  const rows = data.sessions.map(item => {
    const row = record(item), session = string(row.session_id), cashier = string(row.cashier_id), drawer = string(row.drawer);
    if (sessions.has(session) || cashiers.has(cashier) || drawers.has(drawer)) throw Error('Duplicate active cashier assignment.');
    sessions.add(session); cashiers.add(cashier); drawers.add(drawer);
    if (row.currency !== 'USD' || typeof row.opening_minor !== 'string' || !/^(0|[1-9][0-9]{0,11})$/.test(row.opening_minor) || row.is_mine !== (cashier === actor) || (expectedScope === 'own_sessions' && cashier !== actor)) throw Error('Invalid active cashier assignment.');
    const opened = string(row.opened_at), date = string(row.business_date), zone = string(row.time_zone);
    if (!Number.isFinite(Date.parse(opened)) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Invalid cashier dates.');
    return {session_id: session, cashier_id: cashier, drawer, currency: 'USD' as const, opening_minor: row.opening_minor, opened_at: opened, business_date: date, time_zone: zone, is_mine: row.is_mine as boolean};
  });
  return {scope: expectedScope, sessions: rows};
}
