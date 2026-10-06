import type {CancellationDisposition} from '@/lib/reservation-status';

export type CancellationCommand = {p_request: string; p_reservation: string; p_expected_source_version: number; p_expected_business_date: string; p_reason: string};
type Release = {current_future_room_nights_released: number; release_start: string | null; release_end: string | null; release_end_exclusive: true};
export type CancellationResult = Release & {request_id: string; reservation_id: string; status: 'Cancelled'; cancellation_disposition: null; recorded_at: string; business_date: string; source_version: number; capacity_configuration_changed: false; housekeeping_changed: false; fees_changed: false; folio_changed: false; financial_review_required: boolean; financial_handling: 'separate_review'; replayed: boolean};
export type CancellationStatus = {found: false} | {found: true; action: 'cancel_reservation'; result: CancellationResult};
export type CancellationPreview = Release & CancellationDisposition & {reservation_id: string; status: string; source: string; source_version: number; arrival: string | null; departure: string | null; business_date: string; eligible: boolean; blockers: string[]; scheduled_stay_elapsed: boolean | null; inventory_definition: string; folio_available: boolean; opening_mode: 'frozen' | 'reservation_preview' | 'unavailable'; charges_minor: number | null; recorded_paid_minor: number | null; balance_minor: number | null; financial_review_required: boolean; financial_handling: 'separate_review'; service_warning: string; cancellation_policy: string; generated_at: string};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const civilDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const version = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const amount = (value: unknown) => value === null || Number.isSafeInteger(value);

export const cancellationKey = (actor: string, tenant: string, property: string, reservation: string) => 'iratepilot-pms-pending-cancellation:' + actor + ':' + tenant + ':' + property + ':' + reservation;

export function validCancellation(value: unknown, reservation: string): value is CancellationCommand {
  if (!record(value)) return false;
  return Object.keys(value).sort().join(',') === 'p_expected_business_date,p_expected_source_version,p_reason,p_request,p_reservation' && uuid(value.p_request) && value.p_reservation === reservation && uuid(value.p_reservation) && version(value.p_expected_source_version) && civilDate(value.p_expected_business_date) && typeof value.p_reason === 'string' && value.p_reason === value.p_reason.trim() && value.p_reason.length >= 4 && value.p_reason.length <= 500 && !Array.from(value.p_reason).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function validRelease(value: Record<string, unknown>, businessDate: string) {
  const count = value.current_future_room_nights_released;
  if (!Number.isSafeInteger(count) || Number(count) < 0 || value.release_end_exclusive !== true) return false;
  if (count === 0) return value.release_start === null && value.release_end === null;
  return civilDate(value.release_start) && civilDate(value.release_end) && value.release_start >= businessDate && value.release_end > value.release_start && (Date.parse(value.release_end) - Date.parse(value.release_start)) / 86400000 === count;
}

export function validateCancellationPreview(value: unknown, reservation: string): CancellationPreview {
  if (!record(value) || value.reservation_id !== reservation || !uuid(value.reservation_id) || !version(value.source_version) || !civilDate(value.business_date) || !validRelease(value, value.business_date) || typeof value.status !== 'string' || typeof value.source !== 'string' || !(value.arrival === null || civilDate(value.arrival)) || !(value.departure === null || civilDate(value.departure)) || typeof value.eligible !== 'boolean' || !Array.isArray(value.blockers) || !value.blockers.every(blocker => typeof blocker === 'string') || !(value.scheduled_stay_elapsed === null || typeof value.scheduled_stay_elapsed === 'boolean') || typeof value.folio_available !== 'boolean' || !['frozen', 'reservation_preview', 'unavailable'].includes(String(value.opening_mode)) || !amount(value.charges_minor) || !amount(value.recorded_paid_minor) || !amount(value.balance_minor) || typeof value.financial_review_required !== 'boolean' || value.financial_handling !== 'separate_review' || typeof value.inventory_definition !== 'string' || typeof value.service_warning !== 'string' || typeof value.cancellation_policy !== 'string' || !timestamp(value.generated_at) || ![null, 'no_show'].includes(value.cancellation_disposition as null | string) || !(value.no_show_recorded_at === null || timestamp(value.no_show_recorded_at))) throw Error('The cancellation review could not be verified. Refresh the current reservation before continuing.');
  if (value.eligible && (value.status !== 'Confirmed' || !['direct', 'migration'].includes(value.source) || value.blockers.length !== 0 || !civilDate(value.arrival) || !civilDate(value.departure) || value.departure <= value.arrival || value.cancellation_disposition !== null)) throw Error('The cancellation eligibility response is inconsistent. Refresh before continuing.');
  return value as CancellationPreview;
}

export function validateCancellationStatus(value: unknown, command: CancellationCommand): CancellationResult | null {
  if (record(value) && Object.keys(value).join(',') === 'found' && value.found === false) return null;
  const invalid = () => Error('The saved cancellation receipt does not match this request. Keep the request and reconcile its status before continuing.');
  if (!record(value) || Object.keys(value).sort().join(',') !== 'action,found,result' || value.found !== true || value.action !== 'cancel_reservation' || !record(value.result)) throw invalid();
  const result = value.result;
  if (Object.keys(result).sort().join(',') !== 'business_date,cancellation_disposition,capacity_configuration_changed,current_future_room_nights_released,fees_changed,financial_handling,financial_review_required,folio_changed,housekeeping_changed,recorded_at,release_end,release_end_exclusive,release_start,replayed,request_id,reservation_id,source_version,status' || result.request_id !== command.p_request || result.reservation_id !== command.p_reservation || result.source_version !== command.p_expected_source_version || result.business_date !== command.p_expected_business_date || result.status !== 'Cancelled' || result.cancellation_disposition !== null || result.capacity_configuration_changed !== false || result.housekeeping_changed !== false || result.fees_changed !== false || result.folio_changed !== false || typeof result.financial_review_required !== 'boolean' || result.financial_handling !== 'separate_review' || typeof result.replayed !== 'boolean' || !timestamp(result.recorded_at) || !validRelease(result, command.p_expected_business_date)) throw invalid();
  return result as CancellationResult;
}

export const cancellationBlockers: Record<string, string> = {
  source_owned_ota: 'This OTA reservation must be cancelled through its source.',
  not_confirmed: 'Only a Confirmed reservation can receive a new ordinary cancellation.',
  stay_has_started: 'A stay with check-in or checkout history cannot use this cancellation workflow.',
  already_dispositioned: 'This reservation already has a cancellation disposition; it cannot be relabelled here.',
  stay_dates_unavailable: 'Valid scheduled arrival and departure dates are required for this review.',
};
