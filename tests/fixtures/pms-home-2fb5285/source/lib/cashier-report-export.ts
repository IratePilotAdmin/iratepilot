import {reportCsv, type ReportCell} from './report-export';

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid cashier report.');
  return value as ObjectValue;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw Error('Incomplete cashier report.');
  return value;
}
function minor(value: unknown): bigint {
  if (typeof value !== 'string' || !/^-?(0|[1-9][0-9]{0,17})$/.test(value) || value === '-0') throw Error('Invalid exact cash amount.');
  return BigInt(value);
}
function amount(value: bigint): string {
  const negative = value < BigInt(0), digits = (negative ? -value : value).toString().padStart(3, '0');
  return (negative ? '-' : '') + digits.slice(0, -2) + '.' + digits.slice(-2);
}
function varianceOutcome(value:unknown):string{
 if(value===undefined||value===null)return 'Unavailable';
 const labels:Record<string,string>={balanced:'Balanced',not_reviewed:'Not reviewed',investigating:'Investigating',explained:'Explained',adjustment_required:'Adjustment required'};
 if(typeof value!=='string'||!Object.prototype.hasOwnProperty.call(labels,value))throw Error('Invalid variance review outcome.');return labels[value];
}
export function cashierClosingView(value: unknown, tenantId: string, propertyId: string, actorId: string) {
  const csv = cashierClosingCsv(value, tenantId, propertyId, actorId), report = object(value);
  return {csv, expected: amount(minor(report.expected_minor)), counted: amount(minor(report.counted_minor)), variance: amount(minor(report.variance_minor)),
    sessions: (report.sessions as unknown[]).map(item => {
      const session = object(item), review = object(session.review);
      return {varianceOutcome:varianceOutcome(session.variance_review_outcome),id: text(session.session_id), drawer: text(session.drawer), cashier: text(session.cashier_id), date: text(session.closing_date), zone: text(session.time_zone), reason: text(session.reason), expected: amount(minor(review.expected_minor)), counted: amount(minor(review.counted_minor)), variance: amount(minor(review.variance_minor))};
    })};
}
/** Requires the selected property and actor, preventing accidental cross-workspace exports. */
export function cashierClosingCsv(value: unknown, tenantId: string, propertyId: string, actorId: string): string {
  const report = object(value);
  if (report.schema_version !== 1 || report.tenant_id !== tenantId || report.property_id !== propertyId || report.actor_id !== actorId || report.complete !== true || report.currency !== 'USD' || report.basis !== 'cashier_close_declarations' || !['property', 'own_sessions'].includes(String(report.scope))) throw Error('Cashier report scope or contract changed.');
  if (!Array.isArray(report.sessions) || report.sessions.length > 1000 || report.session_count !== report.sessions.length) throw Error('Complete cashier sessions are required.');
  const rows: ReportCell[][] = [
    ['Cashier closing declarations', text(report.starts_on), text(report.ends_before), 'End date excluded', String(report.scope)],
    ['Session', 'Drawer', 'Cashier', 'Closing date', 'Time zone', 'Closed at', 'Currency', 'Expected cash', 'Counted cash', 'Over / short', 'Explanation', 'Variance review outcome'],
  ];
  let expected = BigInt(0), counted = BigInt(0), variance = BigInt(0);
  const seen = new Set<string>();
  for (const item of report.sessions) {
    const session = object(item), review = object(session.review), id = text(session.session_id);
    if (seen.has(id)) throw Error('Duplicate cashier session.');
    seen.add(id);
    if (review.tenant_id !== tenantId || review.property_id !== propertyId || review.session_id !== id || review.currency !== 'USD' || review.cashier_id !== session.cashier_id || (report.scope === 'own_sessions' && session.cashier_id !== actorId)) throw Error('Cashier session scope changed.');
    const e = minor(review.expected_minor), c = minor(review.counted_minor), v = minor(review.variance_minor);
    if (c < BigInt(0) || c - e !== v) throw Error('Cashier variance does not reconcile.');
    expected += e; counted += c; variance += v;
    rows.push([id, text(session.drawer), text(session.cashier_id), text(session.closing_date), text(session.time_zone), text(session.closed_at), 'USD', amount(e), amount(c), amount(v), text(session.reason), varianceOutcome(session.variance_review_outcome)]);
  }
  if (minor(report.expected_minor) !== expected || minor(report.counted_minor) !== counted || minor(report.variance_minor) !== variance) throw Error('Cashier report totals do not reconcile.');
  rows.push(['Total', '', '', '', '', '', 'USD', amount(expected), amount(counted), amount(variance), 'Cash declarations; does not verify bank deposits', '']);
  return reportCsv(rows);
}
