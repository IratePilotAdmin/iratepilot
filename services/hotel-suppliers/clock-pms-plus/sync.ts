import { StandardPmsAdapter } from "../standard";
import { ClockPmsBookingMapper } from "./mapper";
import { ClockPmsHttpTransport, type ClockPmsAuthRequest, type ClockPmsConfig, type ClockPmsEndpoint, type ClockPmsFetch } from "./transport";

export type ClockPmsSyncEnvironment = Record<string, string | undefined>;
export type ClockPmsDigestSigner = (request: ClockPmsAuthRequest) => Promise<string>;
function required(env: ClockPmsSyncEnvironment, key: string) {
  const value = env[key]?.trim(); if (!value) throw new Error(`Missing Clock PMS+ configuration: ${key}`); return value;
}
function method(env: ClockPmsSyncEnvironment, key: string, fallback: ClockPmsEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) throw new Error(`Invalid Clock PMS+ configuration: ${key}`);
  return value as ClockPmsEndpoint["method"];
}
export function loadClockPmsSyncConfig(env: ClockPmsSyncEnvironment, getDigestAuthorization: ClockPmsDigestSigner) {
  if (typeof getDigestAuthorization !== "function") throw new Error("Clock PMS+ Digest authorization signer is required");
  const transport: ClockPmsConfig = { baseUrl: required(env, "PMS_CLOCK_BASE_URL"), apiUser: required(env, "PMS_CLOCK_API_USER"),
    apiKey: required(env, "PMS_CLOCK_API_KEY"), getDigestAuthorization,
    timeoutMs: env.PMS_CLOCK_TIMEOUT_MS ? Number(env.PMS_CLOCK_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { path: required(env, "PMS_CLOCK_AVAILABILITY_PATH"), method: method(env, "PMS_CLOCK_AVAILABILITY_METHOD", "GET") },
      create_reservation: { path: required(env, "PMS_CLOCK_CREATE_RESERVATION_PATH"), method: method(env, "PMS_CLOCK_CREATE_RESERVATION_METHOD", "POST") },
      cancel_reservation: { path: required(env, "PMS_CLOCK_CANCEL_RESERVATION_PATH"), method: method(env, "PMS_CLOCK_CANCEL_RESERVATION_METHOD", "POST") },
    } };
  return { transport, mapper: { currency: required(env, "PMS_CLOCK_CURRENCY"), bookingSourceCode: env.PMS_CLOCK_BOOKING_SOURCE_CODE?.trim() } };
}
export function createClockPmsSyncAdapter(config: ReturnType<typeof loadClockPmsSyncConfig>, fetcher?: ClockPmsFetch) {
  return new StandardPmsAdapter("clock-pms-plus", new ClockPmsHttpTransport(config.transport, fetcher), new ClockPmsBookingMapper(config.mapper));
}
