export type AdjustmentLine = {account_id: string; side: 'debit' | 'credit'; amount_minor: string};
export type AdjustmentCommand = {
  period_id: string; posting_date: string; currency: 'USD'; description: string;
  source_kind: 'manual_journal' | 'journal_reversal'; source_id: string; source_version: 1;
  lines: AdjustmentLine[];
};
export type AdjustmentRequest = {version: 1; actor: string; tenant: string; property: string; request: string; command: AdjustmentCommand};
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const exactKeys = (value: object, keys: string[]) => Object.keys(value).sort().join(',') === keys.sort().join(',');
const canonical = (value: unknown): string => value && typeof value === 'object' && !Array.isArray(value)
  ? JSON.stringify(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
  : Array.isArray(value) ? JSON.stringify(value.map(canonical)) : JSON.stringify(value);

export function adjustmentAmount(value: string): string {
  if (!/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(value)) throw Error('Enter a positive USD amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (minor < BigInt(1) || minor > BigInt('999999999999999')) throw Error('The journal amount is outside the supported range.');
  return minor.toString();
}

export function validateAdjustmentRequest(value: unknown): AdjustmentRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid retained adjustment.');
  const r = value as AdjustmentRequest, c = r.command;
  if (!exactKeys(r, ['version','actor','tenant','property','request','command']) || r.version !== 1 || ![r.actor,r.tenant,r.property,r.request].every(uuid)) throw Error('Invalid adjustment identity.');
  if (!c || typeof c !== 'object' || Array.isArray(c) || !exactKeys(c, ['period_id','posting_date','currency','description','source_kind','source_id','source_version','lines'])) throw Error('Invalid adjustment details.');
  if (!uuid(c.period_id) || !uuid(c.source_id) || c.currency !== 'USD' || c.source_version !== 1 || !['manual_journal','journal_reversal'].includes(c.source_kind) || c.source_kind === 'manual_journal' && c.source_id !== r.request) throw Error('Invalid adjustment source.');
  if (typeof c.posting_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.posting_date) || c.posting_date < '1900-01-01' || !Number.isFinite(Date.parse(c.posting_date)) || new Date(c.posting_date).toISOString().slice(0,10) !== c.posting_date) throw Error('Choose a valid posting date.');
  if (typeof c.description !== 'string' || c.description !== c.description.trim() || c.description.length < 1 || c.description.length > 500 || /[\x00-\x1f\x7f]/.test(c.description)) throw Error('Enter an adjustment reason of up to 500 characters.');
  if (!Array.isArray(c.lines) || c.lines.length < 2 || c.lines.length > 1000) throw Error('A journal needs between 2 and 1,000 lines.');
  let debit = BigInt(0), credit = BigInt(0);
  for (const line of c.lines) {
    if (!line || typeof line !== 'object' || !exactKeys(line,['account_id','side','amount_minor']) || !uuid(line.account_id) || !['debit','credit'].includes(line.side) || typeof line.amount_minor !== 'string' || !/^[1-9][0-9]{0,14}$/.test(line.amount_minor)) throw Error('Check the journal accounts, sides, and amounts.');
    if (line.side === 'debit') debit += BigInt(line.amount_minor); else credit += BigInt(line.amount_minor);
  }
  if (debit !== credit) throw Error('Journal debits and credits must balance.');
  return r;
}

export function adjustmentKey(actor: string, tenant: string, property: string) {
  if (![actor,tenant,property].every(uuid)) throw Error('Verified adjustment scope required.');
  return `iratepilot-pms-gl-adjustment:${actor}:${tenant}:${property}`;
}
export function readAdjustmentRequest(storage: Pick<Storage,'getItem'>, actor: string, tenant: string, property: string) {
  const raw = storage.getItem(adjustmentKey(actor,tenant,property));
  if (raw === null) return null;
  const r = validateAdjustmentRequest(JSON.parse(raw));
  if (r.actor !== actor || r.tenant !== tenant || r.property !== property) throw Error('Adjustment belongs to another signed-in property.');
  return r;
}
export function retainAdjustmentRequest(storage: Pick<Storage,'getItem'|'setItem'>, r: AdjustmentRequest) {
  validateAdjustmentRequest(r);
  const key = adjustmentKey(r.actor,r.tenant,r.property), raw = JSON.stringify(r), prior = storage.getItem(key);
  if (prior !== null && prior !== raw) throw Error('Recover the previous adjustment before creating another.');
  storage.setItem(key,raw);
  if (storage.getItem(key) !== raw) throw Error('Unable to retain the adjustment for recovery.');
}
export function adjustmentParams(r: AdjustmentRequest) {
  validateAdjustmentRequest(r); const c = r.command;
  return {p_tenant:r.tenant,p_property:r.property,p_request:r.request,p_period:c.period_id,p_date:c.posting_date,p_confirmed:true,
    ...(c.source_kind === 'manual_journal' ? {p_description:c.description,p_lines:c.lines} : {p_original:c.source_id,p_reason:c.description})};
}
export function adjustmentReceipt(value: unknown, r: AdjustmentRequest): boolean {
  validateAdjustmentRequest(r);
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string,unknown>;
  return v.schema_version === 1 && v.actor_id === r.actor && v.tenant_id === r.tenant && v.property_id === r.property && v.request_id === r.request && uuid(v.journal_id) && typeof v.replayed === 'boolean'
    && (r.command.source_kind === 'manual_journal' ? v.action === 'post_manual_journal' : v.action === 'reverse_gl_journal' && v.original_journal_id === r.command.source_id);
}
export function readAdjustmentStatus(value: unknown, r: AdjustmentRequest): Record<string,unknown> | null {
  validateAdjustmentRequest(r);
  if (!value || typeof value !== 'object') throw Error('Adjustment status unavailable.');
  const v = value as Record<string,unknown>, action = r.command.source_kind === 'manual_journal' ? 'post_manual_journal' : 'reverse_gl_journal';
  if (v.schema_version !== 1 || v.actor_id !== r.actor || v.tenant_id !== r.tenant || v.property_id !== r.property || v.request_id !== r.request || v.action !== action || typeof v.found !== 'boolean') throw Error('Adjustment status belongs to another request.');
  if (!v.found) {
    if (v.journal_id !== null || v.command !== null || action === 'reverse_gl_journal' && v.original_journal_id !== null) throw Error('Invalid missing adjustment response.');
    return null;
  }
  const receipt = {...v,replayed:true};
  if (!adjustmentReceipt(receipt,r) || canonical(v.command) !== canonical(r.command)) throw Error('Saved adjustment differs from the reviewed request.');
  return receipt;
}
export function clearAdjustmentRequest(storage: Pick<Storage,'getItem'|'removeItem'>, r: AdjustmentRequest, receipt: unknown) {
  if (!adjustmentReceipt(receipt,r)) throw Error('Adjustment receipt does not match.');
  const key = adjustmentKey(r.actor,r.tenant,r.property);
  if (storage.getItem(key) !== JSON.stringify(r)) throw Error('Retained adjustment changed.');
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw Error('Unable to clear the saved adjustment.');
}

export function adjustmentRetirementParams(r: AdjustmentRequest) {
  validateAdjustmentRequest(r);
  return {p_tenant:r.tenant,p_property:r.property,p_request:r.request,p_command:r.command,p_confirmed:true};
}
export function readAdjustmentRetirement(value: unknown, r: AdjustmentRequest): boolean {
  validateAdjustmentRequest(r);
  if (!value || typeof value !== 'object') throw Error('Adjustment cancellation status unavailable.');
  const v = value as Record<string,unknown>;
  if (v.schema_version !== 1 || v.actor_id !== r.actor || v.tenant_id !== r.tenant || v.property_id !== r.property || v.request_id !== r.request || typeof v.retired !== 'boolean' || typeof v.replayed !== 'boolean') throw Error('Cancellation belongs to another adjustment.');
  if (!v.retired) {
    if (v.command !== null || v.retired_at !== null) throw Error('Invalid missing cancellation response.');
    return false;
  }
  if (canonical(v.command) !== canonical(r.command) || typeof v.retired_at !== 'string' || !Number.isFinite(Date.parse(v.retired_at))) throw Error('Cancellation differs from the retained adjustment.');
  return true;
}
export function clearAdjustmentRetirement(storage: Pick<Storage,'getItem'|'removeItem'>, r: AdjustmentRequest, value: unknown) {
  if (!readAdjustmentRetirement(value,r)) throw Error('Cancellation has not been saved.');
  const key = adjustmentKey(r.actor,r.tenant,r.property);
  if (storage.getItem(key) !== JSON.stringify(r)) throw Error('Retained adjustment changed.');
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw Error('Unable to clear the cancelled adjustment.');
}
