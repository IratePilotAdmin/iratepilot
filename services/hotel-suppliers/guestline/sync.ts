import { StandardPmsAdapter } from "../standard";
import { GuestlineBookingMapper } from "./mapper";
import { GuestlineHttpTransport, type GuestlineConfig, type GuestlineEndpoint, type GuestlineFetch } from "./transport";

export type GuestlineSyncEnvironment = Record<string, string | undefined>;
function required(env: GuestlineSyncEnvironment, key: string) {
  const value = env[key]?.trim(); if (!value) throw new Error(`Missing Guestline configuration: ${key}`); return value;
}
function method(env: GuestlineSyncEnvironment, key: string, fallback: GuestlineEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) throw new Error(`Invalid Guestline configuration: ${key}`);
  return value as GuestlineEndpoint["method"];
}
export function loadGuestlineSyncConfig(env: GuestlineSyncEnvironment) {
  const transport: GuestlineConfig = { baseUrl: required(env, "PMS_GUESTLINE_BASE_URL"),
    accessToken: required(env, "PMS_GUESTLINE_ACCESS_TOKEN"), authorizationHeader: env.PMS_GUESTLINE_AUTHORIZATION_HEADER?.trim(),
    authorizationScheme: env.PMS_GUESTLINE_AUTHORIZATION_SCHEME?.trim(),
    timeoutMs: env.PMS_GUESTLINE_TIMEOUT_MS ? Number(env.PMS_GUESTLINE_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { path: required(env, "PMS_GUESTLINE_AVAILABILITY_PATH"), method: method(env, "PMS_GUESTLINE_AVAILABILITY_METHOD", "GET") },
      create_reservation: { path: required(env, "PMS_GUESTLINE_CREATE_RESERVATION_PATH"), method: method(env, "PMS_GUESTLINE_CREATE_RESERVATION_METHOD", "POST") },
      cancel_reservation: { path: required(env, "PMS_GUESTLINE_CANCEL_RESERVATION_PATH"), method: method(env, "PMS_GUESTLINE_CANCEL_RESERVATION_METHOD", "POST") },
    } };
  return { transport, mapper: { currency: required(env, "PMS_GUESTLINE_CURRENCY"), bookingSourceCode: env.PMS_GUESTLINE_BOOKING_SOURCE_CODE?.trim() } };
}
export function createGuestlineSyncAdapter(config: ReturnType<typeof loadGuestlineSyncConfig>, fetcher?: GuestlineFetch) {
  return new StandardPmsAdapter("guestline", new GuestlineHttpTransport(config.transport, fetcher), new GuestlineBookingMapper(config.mapper));
}
