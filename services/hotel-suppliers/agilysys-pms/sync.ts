import { StandardPmsAdapter } from "../standard";
import { AgilysysPmsBookingMapper } from "./mapper";
import {
  AgilysysPmsHttpTransport,
  type AgilysysPmsConfig,
  type AgilysysPmsEndpoint,
  type AgilysysPmsFetch,
} from "./transport";

export type AgilysysPmsSyncEnvironment = Record<string, string | undefined>;

function required(env: AgilysysPmsSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Agilysys PMS configuration: ${key}`);
  return value;
}

function method(env: AgilysysPmsSyncEnvironment, key: string, fallback: AgilysysPmsEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) {
    throw new Error(`Invalid Agilysys PMS configuration: ${key}`);
  }
  return value as AgilysysPmsEndpoint["method"];
}

export function loadAgilysysPmsSyncConfig(env: AgilysysPmsSyncEnvironment) {
  const transport: AgilysysPmsConfig = {
    baseUrl: required(env, "PMS_AGILYSYS_BASE_URL"),
    apiCredential: required(env, "PMS_AGILYSYS_API_CREDENTIAL"),
    credentialHeader: env.PMS_AGILYSYS_CREDENTIAL_HEADER?.trim(),
    credentialScheme: env.PMS_AGILYSYS_CREDENTIAL_SCHEME?.trim(),
    timeoutMs: env.PMS_AGILYSYS_TIMEOUT_MS ? Number(env.PMS_AGILYSYS_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: {
        path: required(env, "PMS_AGILYSYS_AVAILABILITY_PATH"),
        method: method(env, "PMS_AGILYSYS_AVAILABILITY_METHOD", "GET"),
      },
      create_reservation: {
        path: required(env, "PMS_AGILYSYS_CREATE_RESERVATION_PATH"),
        method: method(env, "PMS_AGILYSYS_CREATE_RESERVATION_METHOD", "POST"),
      },
      cancel_reservation: {
        path: required(env, "PMS_AGILYSYS_CANCEL_RESERVATION_PATH"),
        method: method(env, "PMS_AGILYSYS_CANCEL_RESERVATION_METHOD", "POST"),
      },
    },
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_AGILYSYS_CURRENCY"),
      bookingSourceCode: env.PMS_AGILYSYS_BOOKING_SOURCE_CODE?.trim(),
    },
  };
}

export function createAgilysysPmsSyncAdapter(
  config: ReturnType<typeof loadAgilysysPmsSyncConfig>,
  fetcher?: AgilysysPmsFetch,
) {
  return new StandardPmsAdapter(
    "agilysys-pms",
    new AgilysysPmsHttpTransport(config.transport, fetcher),
    new AgilysysPmsBookingMapper(config.mapper),
  );
}
