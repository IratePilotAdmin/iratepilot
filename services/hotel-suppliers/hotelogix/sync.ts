import { StandardPmsAdapter } from "../standard";
import { HotelogixBookingMapper } from "./mapper";
import {
  HotelogixHttpTransport,
  type HotelogixConfig,
  type HotelogixEndpoint,
  type HotelogixFetch,
} from "./transport";

export type HotelogixSyncEnvironment = Record<string, string | undefined>;

function required(env: HotelogixSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Hotelogix configuration: ${key}`);
  return value;
}

function method(env: HotelogixSyncEnvironment, key: string, fallback: HotelogixEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) {
    throw new Error(`Invalid Hotelogix configuration: ${key}`);
  }
  return value as HotelogixEndpoint["method"];
}

export function loadHotelogixSyncConfig(env: HotelogixSyncEnvironment) {
  const transport: HotelogixConfig = {
    baseUrl: required(env, "PMS_HOTELOGIX_BASE_URL"),
    apiKey: required(env, "PMS_HOTELOGIX_API_KEY"),
    apiKeyHeader: env.PMS_HOTELOGIX_API_KEY_HEADER?.trim(),
    apiKeyScheme: env.PMS_HOTELOGIX_API_KEY_SCHEME?.trim(),
    timeoutMs: env.PMS_HOTELOGIX_TIMEOUT_MS ? Number(env.PMS_HOTELOGIX_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: {
        path: required(env, "PMS_HOTELOGIX_AVAILABILITY_PATH"),
        method: method(env, "PMS_HOTELOGIX_AVAILABILITY_METHOD", "GET"),
      },
      create_reservation: {
        path: required(env, "PMS_HOTELOGIX_CREATE_RESERVATION_PATH"),
        method: method(env, "PMS_HOTELOGIX_CREATE_RESERVATION_METHOD", "POST"),
      },
      cancel_reservation: {
        path: required(env, "PMS_HOTELOGIX_CANCEL_RESERVATION_PATH"),
        method: method(env, "PMS_HOTELOGIX_CANCEL_RESERVATION_METHOD", "POST"),
      },
    },
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_HOTELOGIX_CURRENCY"),
      bookingSourceCode: env.PMS_HOTELOGIX_BOOKING_SOURCE_CODE?.trim(),
    },
  };
}

export function createHotelogixSyncAdapter(
  config: ReturnType<typeof loadHotelogixSyncConfig>,
  fetcher?: HotelogixFetch,
) {
  return new StandardPmsAdapter(
    "hotelogix",
    new HotelogixHttpTransport(config.transport, fetcher),
    new HotelogixBookingMapper(config.mapper),
  );
}
