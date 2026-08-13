import type { StandardPmsTransportRequest } from "../standard";
import { StandardPmsAdapter } from "../standard";
import { OracleOpera5BookingMapper } from "./mapper";
import {
  OracleOpera5Transport,
  type OracleOpera5Config,
  type OracleOpera5Fetch,
  type OracleOpera5SoapHeaders,
} from "./transport";

export type OracleOpera5SyncEnvironment = Record<string, string | undefined>;
export type OracleOpera5SoapHeaderProvider = (
  request: StandardPmsTransportRequest,
) => Promise<OracleOpera5SoapHeaders>;
export type OracleOpera5EnvelopeBuilder = (request: StandardPmsTransportRequest) => string;
export type OracleOpera5ResponseParser = (
  xml: string,
  request: StandardPmsTransportRequest,
) => unknown;

function required(env: OracleOpera5SyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Oracle OPERA 5 configuration: ${key}`);
  return value;
}

export function loadOracleOpera5SyncConfig(
  env: OracleOpera5SyncEnvironment,
  getSoapHeaders: OracleOpera5SoapHeaderProvider,
  buildEnvelope: OracleOpera5EnvelopeBuilder,
  parseResponse: OracleOpera5ResponseParser,
) {
  if (typeof getSoapHeaders !== "function") {
    throw new Error("Oracle OPERA 5 SOAP header provider is required");
  }
  if (typeof buildEnvelope !== "function") {
    throw new Error("Oracle OPERA 5 approved envelope builder is required");
  }
  if (typeof parseResponse !== "function") {
    throw new Error("Oracle OPERA 5 approved response parser is required");
  }
  const transport: OracleOpera5Config = {
    baseUrl: required(env, "PMS_OPERA5_BASE_URL"),
    timeoutMs: env.PMS_OPERA5_TIMEOUT_MS ? Number(env.PMS_OPERA5_TIMEOUT_MS) : 20_000,
    getSoapHeaders,
    buildEnvelope,
    parseResponse,
    endpoints: {
      availability: {
        path: required(env, "PMS_OPERA5_AVAILABILITY_PATH"),
        soapAction: required(env, "PMS_OPERA5_AVAILABILITY_SOAP_ACTION"),
      },
      create_reservation: {
        path: required(env, "PMS_OPERA5_CREATE_RESERVATION_PATH"),
        soapAction: required(env, "PMS_OPERA5_CREATE_RESERVATION_SOAP_ACTION"),
      },
      cancel_reservation: {
        path: required(env, "PMS_OPERA5_CANCEL_RESERVATION_PATH"),
        soapAction: required(env, "PMS_OPERA5_CANCEL_RESERVATION_SOAP_ACTION"),
      },
    },
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_OPERA5_CURRENCY"),
      bookingSourceCode: env.PMS_OPERA5_BOOKING_SOURCE_CODE?.trim(),
    },
  };
}

export function createOracleOpera5SyncAdapter(
  config: ReturnType<typeof loadOracleOpera5SyncConfig>,
  fetcher?: OracleOpera5Fetch,
) {
  return new StandardPmsAdapter(
    "oracle-opera-5",
    new OracleOpera5Transport(config.transport, fetcher),
    new OracleOpera5BookingMapper(config.mapper),
  );
}
