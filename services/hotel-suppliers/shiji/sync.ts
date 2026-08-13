import { StandardPmsAdapter } from "../standard";
import { ShijiBookingMapper } from "./mapper";
import { ShijiHttpTransport, type ShijiConfig, type ShijiEndpoint, type ShijiFetch } from "./transport";

export type ShijiSyncEnvironment = Record<string, string | undefined>;
function required(env: ShijiSyncEnvironment, key: string) {
  const value = env[key]?.trim(); if (!value) throw new Error(`Missing Shiji configuration: ${key}`); return value;
}
function method(env: ShijiSyncEnvironment, key: string, fallback: ShijiEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) throw new Error(`Invalid Shiji configuration: ${key}`);
  return value as ShijiEndpoint["method"];
}
export function loadShijiSyncConfig(env: ShijiSyncEnvironment) {
  const scheme = env.PMS_SHIJI_AUTHORIZATION_SCHEME?.trim();
  if (scheme && scheme !== "Bearer" && scheme !== "Basic") throw new Error("Invalid Shiji configuration: PMS_SHIJI_AUTHORIZATION_SCHEME");
  const transport: ShijiConfig = {
    baseUrl: required(env, "PMS_SHIJI_BASE_URL"), accessToken: required(env, "PMS_SHIJI_ACCESS_TOKEN"),
    authorizationScheme: scheme as ShijiConfig["authorizationScheme"],
    timeoutMs: env.PMS_SHIJI_TIMEOUT_MS ? Number(env.PMS_SHIJI_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { path: required(env, "PMS_SHIJI_AVAILABILITY_PATH"), method: method(env, "PMS_SHIJI_AVAILABILITY_METHOD", "GET") },
      create_reservation: { path: required(env, "PMS_SHIJI_CREATE_RESERVATION_PATH"), method: method(env, "PMS_SHIJI_CREATE_RESERVATION_METHOD", "POST") },
      cancel_reservation: { path: required(env, "PMS_SHIJI_CANCEL_RESERVATION_PATH"), method: method(env, "PMS_SHIJI_CANCEL_RESERVATION_METHOD", "POST") },
    },
  };
  return { transport, mapper: { currency: required(env, "PMS_SHIJI_CURRENCY"),
    bookingSourceCode: env.PMS_SHIJI_BOOKING_SOURCE_CODE?.trim() } };
}
export function createShijiSyncAdapter(config: ReturnType<typeof loadShijiSyncConfig>, fetcher?: ShijiFetch) {
  return new StandardPmsAdapter("shiji-pms", new ShijiHttpTransport(config.transport, fetcher), new ShijiBookingMapper(config.mapper));
}
