import { StandardPmsAdapter } from "../standard";
import { EzeeAbsoluteBookingMapper } from "./mapper";
import { EzeeAbsoluteHttpTransport, type EzeeAbsoluteConfig, type EzeeAbsoluteEndpoint, type EzeeAbsoluteFetch } from "./transport";

export type EzeeAbsoluteSyncEnvironment = Record<string, string | undefined>;
function required(env: EzeeAbsoluteSyncEnvironment, key: string) {
  const value = env[key]?.trim(); if (!value) throw new Error(`Missing eZee Absolute configuration: ${key}`); return value;
}
function method(env: EzeeAbsoluteSyncEnvironment, key: string, fallback: EzeeAbsoluteEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) throw new Error(`Invalid eZee Absolute configuration: ${key}`);
  return value as EzeeAbsoluteEndpoint["method"];
}
export function loadEzeeAbsoluteSyncConfig(env: EzeeAbsoluteSyncEnvironment) {
  const transport: EzeeAbsoluteConfig = { baseUrl: required(env, "PMS_EZEE_ABSOLUTE_BASE_URL"),
    accessToken: required(env, "PMS_EZEE_ABSOLUTE_ACCESS_TOKEN"),
    authorizationHeader: env.PMS_EZEE_ABSOLUTE_AUTHORIZATION_HEADER?.trim(),
    authorizationScheme: env.PMS_EZEE_ABSOLUTE_AUTHORIZATION_SCHEME?.trim(),
    timeoutMs: env.PMS_EZEE_ABSOLUTE_TIMEOUT_MS ? Number(env.PMS_EZEE_ABSOLUTE_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { path: required(env, "PMS_EZEE_ABSOLUTE_AVAILABILITY_PATH"), method: method(env, "PMS_EZEE_ABSOLUTE_AVAILABILITY_METHOD", "GET") },
      create_reservation: { path: required(env, "PMS_EZEE_ABSOLUTE_CREATE_RESERVATION_PATH"), method: method(env, "PMS_EZEE_ABSOLUTE_CREATE_RESERVATION_METHOD", "POST") },
      cancel_reservation: { path: required(env, "PMS_EZEE_ABSOLUTE_CANCEL_RESERVATION_PATH"), method: method(env, "PMS_EZEE_ABSOLUTE_CANCEL_RESERVATION_METHOD", "POST") },
    } };
  return { transport, mapper: { currency: required(env, "PMS_EZEE_ABSOLUTE_CURRENCY"), bookingSourceCode: env.PMS_EZEE_ABSOLUTE_BOOKING_SOURCE_CODE?.trim() } };
}
export function createEzeeAbsoluteSyncAdapter(config: ReturnType<typeof loadEzeeAbsoluteSyncConfig>, fetcher?: EzeeAbsoluteFetch) {
  return new StandardPmsAdapter("ezee-absolute", new EzeeAbsoluteHttpTransport(config.transport, fetcher), new EzeeAbsoluteBookingMapper(config.mapper));
}
