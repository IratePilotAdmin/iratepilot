import { MewsAdapter } from "./adapter";
import { MewsBookingMapper } from "./mapper";
import { MewsHttpTransport, type MewsConnectorConfig, type MewsFetch } from "./transport";

export type MewsSyncEnvironment = Record<string, string | undefined>;

function required(env: MewsSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Mews configuration: ${key}`);
  return value;
}

export function loadMewsSyncConfig(env: MewsSyncEnvironment) {
  const transport: MewsConnectorConfig = {
    baseUrl: env.PMS_MEWS_BASE_URL?.trim() || "https://api.mews-demo.com",
    clientToken: required(env, "PMS_MEWS_CLIENT_TOKEN"),
    accessToken: required(env, "PMS_MEWS_ACCESS_TOKEN"),
    client: required(env, "PMS_MEWS_CLIENT"),
    timeoutMs: env.PMS_MEWS_TIMEOUT_MS ? Number(env.PMS_MEWS_TIMEOUT_MS) : 15_000,
  };
  return {
    transport,
    mapper: {
      serviceId: required(env, "PMS_MEWS_SERVICE_ID"),
      resourceCategoryId: required(env, "PMS_MEWS_RESOURCE_CATEGORY_ID"),
      rateId: required(env, "PMS_MEWS_RATE_ID"),
      adultAgeCategoryId: required(env, "PMS_MEWS_ADULT_AGE_CATEGORY_ID"),
      childAgeCategoryId: env.PMS_MEWS_CHILD_AGE_CATEGORY_ID?.trim(),
      checkInTime: env.PMS_MEWS_CHECK_IN_TIME?.trim(),
      checkOutTime: env.PMS_MEWS_CHECK_OUT_TIME?.trim(),
    },
  };
}

export function createMewsSyncAdapter(
  config: ReturnType<typeof loadMewsSyncConfig>,
  fetcher?: MewsFetch,
) {
  return new MewsAdapter(
    new MewsHttpTransport(config.transport, fetcher),
    new MewsBookingMapper(config.mapper),
  );
}
