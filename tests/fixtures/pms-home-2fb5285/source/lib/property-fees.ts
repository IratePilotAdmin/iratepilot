export const cleaningTaxKeys = ['city', 'state', 'lodging'] as const;
export type CleaningTax = typeof cleaningTaxKeys[number];
export type CleaningFee = {enabled: boolean; amount_minor: number; basis: 'per_stay'; taxes: CleaningTax[]};
export type PropertyFees = {tenant_id: string; property_id: string; operating_model: 'hotel' | 'whole_home'; version: number; currency: 'USD'; cleaning: CleaningFee};
export type PropertyFeeCommand = {p_request: string; p_expected_version: number; p_cleaning: CleaningFee};
export type PropertyFeeResult = PropertyFees & {request_id: string; replayed: boolean};
export type PropertyFeeStatus = {found: false} | {found: true; action: 'save_property_fees'; result: PropertyFeeResult};

const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const shape = (value: Record<string, unknown>, keys: string) => Object.keys(value).sort().join(',') === keys;
const version = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1;

export const propertyFeeKey = (actor: string, tenant: string, property: string) => 'iratepilot-pms-pending-property-fees:' + actor + ':' + tenant + ':' + property;

export function validCleaningFee(value: unknown): value is CleaningFee {
  if (!record(value) || !shape(value, 'amount_minor,basis,enabled,taxes')) return false;
  return typeof value.enabled === 'boolean' && Number.isSafeInteger(value.amount_minor) && Number(value.amount_minor) >= 0 && Number(value.amount_minor) <= 999999999999 && value.basis === 'per_stay' && Array.isArray(value.taxes) && JSON.stringify(value.taxes) === JSON.stringify(cleaningTaxKeys.filter(tax => (value.taxes as unknown[]).includes(tax)));
}

export function validPropertyFeeCommand(value: unknown): value is PropertyFeeCommand {
  return record(value) && shape(value, 'p_cleaning,p_expected_version,p_request') && uuid(value.p_request) && version(value.p_expected_version) && validCleaningFee(value.p_cleaning);
}

function validConfig(value: Record<string, unknown>, tenant: string, property: string) {
  return value.tenant_id === tenant && value.property_id === property && uuid(value.tenant_id) && uuid(value.property_id) && ['hotel', 'whole_home'].includes(String(value.operating_model)) && version(value.version) && value.currency === 'USD' && validCleaningFee(value.cleaning) && (value.operating_model === 'whole_home' || !value.cleaning.enabled);
}

export function validatePropertyFees(value: unknown, tenant: string, property: string): PropertyFees {
  if (!record(value) || !shape(value, 'cleaning,currency,operating_model,property_id,tenant_id,version') || !validConfig(value, tenant, property)) throw Error('The property fee settings could not be verified. Refresh before preparing a change.');
  return value as PropertyFees;
}

export function validatePropertyFeeStatus(value: unknown, command: PropertyFeeCommand, tenant: string, property: string): PropertyFeeResult | null {
  if (record(value) && shape(value, 'found') && value.found === false) return null;
  const invalid = () => Error('The saved cleaning-fee receipt does not match this request. Keep the request and reconcile its status before another change.');
  if (!record(value) || !shape(value, 'action,found,result') || value.found !== true || value.action !== 'save_property_fees' || !record(value.result)) throw invalid();
  const result = value.result;
  if (!shape(result, 'cleaning,currency,operating_model,property_id,replayed,request_id,tenant_id,version') || !validConfig(result, tenant, property) || result.request_id !== command.p_request || typeof result.replayed !== 'boolean' || (result.version !== command.p_expected_version && result.version !== command.p_expected_version + 1)) throw invalid();
  const cleaning = result.cleaning as CleaningFee;
  if (cleaning.enabled !== command.p_cleaning.enabled || cleaning.amount_minor !== command.p_cleaning.amount_minor || cleaning.basis !== command.p_cleaning.basis || JSON.stringify(cleaning.taxes) !== JSON.stringify(command.p_cleaning.taxes)) throw invalid();
  return result as PropertyFeeResult;
}

export function readCleaningFee(form: FormData): CleaningFee {
  const amount = form.get('cleaning_amount');
  if (typeof amount !== 'string' || !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(amount)) throw Error('Enter a nonnegative USD cleaning fee with up to two decimal places.');
  const [whole, fraction = ''] = amount.split('.');
  const fee: CleaningFee = {enabled: form.get('cleaning_enabled') === 'on', amount_minor: Number(whole) * 100 + Number(fraction.padEnd(2, '0')), basis: 'per_stay', taxes: cleaningTaxKeys.filter(tax => form.get('cleaning_tax_' + tax) === 'on')};
  if (!validCleaningFee(fee)) throw Error('The cleaning fee must be between $0.00 and $9,999,999,999.99.');
  return fee;
}
