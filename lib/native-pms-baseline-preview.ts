export const NATIVE_PMS_BASELINE_REASONS = [
  "connection_missing",
  "environment_not_sandbox",
  "capture_already_enabled",
  "delivery_already_enabled",
  "property_not_active_approved",
  "reservation_limit_exceeded",
  "outbox_history_exists",
  "version_history_exists",
  "baseline_already_exists",
] as const;

export type NativePmsBaselinePreview = {
  fromDate: string;
  reservationCount: number;
  outboxEventCount: number;
  versionedReservationCount: number;
  baselineExists: boolean;
  propertyReady: boolean;
  captureEnabled: boolean;
  deliveryEnabled: boolean;
  eligibleForCapture: boolean;
  reasonCodes: Array<(typeof NATIVE_PMS_BASELINE_REASONS)[number]>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;

export function readNativePmsBaselinePreview(value: unknown, expectedFromDate: string): NativePmsBaselinePreview {
  const keys = [
    "baselineExists", "captureEnabled", "deliveryEnabled", "eligibleForCapture", "fromDate",
    "outboxEventCount", "propertyReady", "reasonCodes", "reservationCount", "versionedReservationCount",
  ].sort().join(",");
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== keys
    || value.fromDate !== expectedFromDate
    || !count(value.reservationCount) || !count(value.outboxEventCount)
    || !count(value.versionedReservationCount)
    || typeof value.baselineExists !== "boolean" || typeof value.propertyReady !== "boolean"
    || typeof value.captureEnabled !== "boolean" || typeof value.deliveryEnabled !== "boolean"
    || typeof value.eligibleForCapture !== "boolean" || !Array.isArray(value.reasonCodes)
    || value.reasonCodes.some((reason) => !NATIVE_PMS_BASELINE_REASONS.includes(reason as never))) {
    throw new Error("The baseline preview did not match its requested property and date.");
  }
  const reasonCodes = value.reasonCodes as NativePmsBaselinePreview["reasonCodes"];
  if (new Set(reasonCodes).size !== reasonCodes.length
    || value.eligibleForCapture !== (reasonCodes.length === 0)) {
    throw new Error("The baseline preview is inconsistent.");
  }
  return {
    fromDate: expectedFromDate,
    reservationCount: value.reservationCount as number,
    outboxEventCount: value.outboxEventCount as number,
    versionedReservationCount: value.versionedReservationCount as number,
    baselineExists: value.baselineExists,
    propertyReady: value.propertyReady,
    captureEnabled: value.captureEnabled,
    deliveryEnabled: value.deliveryEnabled,
    eligibleForCapture: value.eligibleForCapture,
    reasonCodes,
  };
}
