import { StandardPmsAdapter } from "../standard";
import { StayntouchBookingMapper } from "./mapper";
import { StayntouchHttpTransport, type StayntouchConfig, type StayntouchFetch } from "./transport";

export type StayntouchSyncEnvironment = Record<string, string | undefined>;

function required(env: StayntouchSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Stayntouch configuration: ${key}`);
  return value;
}

export function loadStayntouchSyncConfig(env: StayntouchSyncEnvironment) {
  const transport: StayntouchConfig = {
    baseUrl: env.PMS_STAYNTOUCH_BASE_URL?.trim() || "https://api.stayntouch.com/connect/",
    accessToken: required(env, "PMS_STAYNTOUCH_ACCESS_TOKEN"),
    apiVersion: env.PMS_STAYNTOUCH_API_VERSION?.trim() || "2.0",
    timeoutMs: env.PMS_STAYNTOUCH_TIMEOUT_MS ? Number(env.PMS_STAYNTOUCH_TIMEOUT_MS) : 15_000,
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_STAYNTOUCH_CURRENCY"),
      bookingOriginCode: env.PMS_STAYNTOUCH_BOOKING_ORIGIN_CODE?.trim(),
      reservationTypeCode: env.PMS_STAYNTOUCH_RESERVATION_TYPE_CODE?.trim(),
      sourceCode: env.PMS_STAYNTOUCH_SOURCE_CODE?.trim(),
      marketSegmentCode: env.PMS_STAYNTOUCH_MARKET_SEGMENT_CODE?.trim(),
    },
  };
}

export function createStayntouchSyncAdapter(
  config: ReturnType<typeof loadStayntouchSyncConfig>,
  fetcher?: StayntouchFetch,
) {
  return new StandardPmsAdapter(
    "stayntouch",
    new StayntouchHttpTransport(config.transport, fetcher),
    new StayntouchBookingMapper(config.mapper),
  );
}
