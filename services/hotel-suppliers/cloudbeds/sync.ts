import { CloudbedsAdapter } from "./adapter";
import { CloudbedsBookingMapper } from "./mapper";
import { CloudbedsHttpTransport, type CloudbedsConfig, type CloudbedsFetch } from "./transport";

export type CloudbedsSyncEnvironment = Record<string, string | undefined>;

function required(env: CloudbedsSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Cloudbeds configuration: ${key}`);
  return value;
}

export function loadCloudbedsSyncConfig(env: CloudbedsSyncEnvironment) {
  const transport: CloudbedsConfig = {
    baseUrl: env.PMS_CLOUDBEDS_BASE_URL?.trim() || "https://api.cloudbeds.com",
    apiKey: required(env, "PMS_CLOUDBEDS_API_KEY"),
    timeoutMs: env.PMS_CLOUDBEDS_TIMEOUT_MS ? Number(env.PMS_CLOUDBEDS_TIMEOUT_MS) : 15_000,
  };
  return {
    transport,
    mapper: {
      sourceId: required(env, "PMS_CLOUDBEDS_SOURCE_ID"),
      paymentMethod: (env.PMS_CLOUDBEDS_PAYMENT_METHOD?.trim() || "cash") as
        "cash" | "credit" | "ebanking" | "pay_pal",
    },
  };
}

export function createCloudbedsSyncAdapter(
  config: ReturnType<typeof loadCloudbedsSyncConfig>,
  fetcher?: CloudbedsFetch,
) {
  return new CloudbedsAdapter(
    new CloudbedsHttpTransport(config.transport, fetcher),
    new CloudbedsBookingMapper(config.mapper),
  );
}

