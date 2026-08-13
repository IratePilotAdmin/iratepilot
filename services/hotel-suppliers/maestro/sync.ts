import { StandardPmsAdapter } from "../standard";
import { MaestroBookingMapper } from "./mapper";
import { MaestroHttpTransport, type MaestroConfig, type MaestroEndpoint, type MaestroFetch } from "./transport";

export type MaestroSyncEnvironment = Record<string, string | undefined>;

function required(env: MaestroSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Maestro configuration: ${key}`);
  return value;
}

function method(env: MaestroSyncEnvironment, key: string, fallback: MaestroEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) {
    throw new Error(`Invalid Maestro configuration: ${key}`);
  }
  return value as MaestroEndpoint["method"];
}

export function loadMaestroSyncConfig(env: MaestroSyncEnvironment) {
  const transport: MaestroConfig = {
    baseUrl: required(env, "PMS_MAESTRO_BASE_URL"),
    accessToken: required(env, "PMS_MAESTRO_ACCESS_TOKEN"),
    authorizationHeader: env.PMS_MAESTRO_AUTHORIZATION_HEADER?.trim(),
    authorizationScheme: env.PMS_MAESTRO_AUTHORIZATION_SCHEME?.trim(),
    timeoutMs: env.PMS_MAESTRO_TIMEOUT_MS ? Number(env.PMS_MAESTRO_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { path: required(env, "PMS_MAESTRO_AVAILABILITY_PATH"), method: method(env, "PMS_MAESTRO_AVAILABILITY_METHOD", "GET") },
      create_reservation: { path: required(env, "PMS_MAESTRO_CREATE_RESERVATION_PATH"), method: method(env, "PMS_MAESTRO_CREATE_RESERVATION_METHOD", "POST") },
      cancel_reservation: { path: required(env, "PMS_MAESTRO_CANCEL_RESERVATION_PATH"), method: method(env, "PMS_MAESTRO_CANCEL_RESERVATION_METHOD", "POST") },
    },
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_MAESTRO_CURRENCY"),
      bookingSourceCode: env.PMS_MAESTRO_BOOKING_SOURCE_CODE?.trim(),
    },
  };
}

export function createMaestroSyncAdapter(config: ReturnType<typeof loadMaestroSyncConfig>, fetcher?: MaestroFetch) {
  return new StandardPmsAdapter(
    "maestro-pms",
    new MaestroHttpTransport(config.transport, fetcher),
    new MaestroBookingMapper(config.mapper),
  );
}
