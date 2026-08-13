import { StandardPmsAdapter } from "../standard";
import { InforHmsBookingMapper } from "./mapper";
import {
  InforHmsHttpTransport,
  type InforHmsConfig,
  type InforHmsEndpoint,
  type InforHmsFetch,
} from "./transport";

export type InforHmsSyncEnvironment = Record<string, string | undefined>;

function required(env: InforHmsSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Infor HMS configuration: ${key}`);
  return value;
}

function method(env: InforHmsSyncEnvironment, key: string, fallback: InforHmsEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) {
    throw new Error(`Invalid Infor HMS configuration: ${key}`);
  }
  return value as InforHmsEndpoint["method"];
}

export function loadInforHmsSyncConfig(env: InforHmsSyncEnvironment) {
  const transport: InforHmsConfig = {
    baseUrl: required(env, "PMS_INFOR_HMS_BASE_URL"),
    accessToken: required(env, "PMS_INFOR_HMS_ACCESS_TOKEN"),
    tenantId: env.PMS_INFOR_HMS_TENANT_ID?.trim(),
    tenantHeader: env.PMS_INFOR_HMS_TENANT_HEADER?.trim(),
    timeoutMs: env.PMS_INFOR_HMS_TIMEOUT_MS ? Number(env.PMS_INFOR_HMS_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: {
        path: required(env, "PMS_INFOR_HMS_AVAILABILITY_PATH"),
        method: method(env, "PMS_INFOR_HMS_AVAILABILITY_METHOD", "GET"),
      },
      create_reservation: {
        path: required(env, "PMS_INFOR_HMS_CREATE_RESERVATION_PATH"),
        method: method(env, "PMS_INFOR_HMS_CREATE_RESERVATION_METHOD", "POST"),
      },
      cancel_reservation: {
        path: required(env, "PMS_INFOR_HMS_CANCEL_RESERVATION_PATH"),
        method: method(env, "PMS_INFOR_HMS_CANCEL_RESERVATION_METHOD", "POST"),
      },
    },
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_INFOR_HMS_CURRENCY"),
      bookingSourceCode: env.PMS_INFOR_HMS_BOOKING_SOURCE_CODE?.trim(),
    },
  };
}

export function createInforHmsSyncAdapter(
  config: ReturnType<typeof loadInforHmsSyncConfig>,
  fetcher?: InforHmsFetch,
) {
  return new StandardPmsAdapter(
    "infor-hms",
    new InforHmsHttpTransport(config.transport, fetcher),
    new InforHmsBookingMapper(config.mapper),
  );
}
