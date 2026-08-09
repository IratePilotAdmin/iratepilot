import { HiltonPmsAdapter } from "./adapter";
import { HiltonOnQMapper } from "./onq-mapper";
import { HiltonOnQHttpTransport, type HiltonOnQConfig, type HiltonOnQFetch } from "./onq-transport";

export type HiltonOnQSyncEnvironment = Record<string, string | undefined>;

function required(env: HiltonOnQSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Hilton OnQ configuration: ${key}`);
  return value;
}

export function loadHiltonOnQSyncConfig(env: HiltonOnQSyncEnvironment): HiltonOnQConfig {
  return {
    baseUrl: required(env, "PMS_HILTON_ONQ_BASE_URL"),
    apiCredential: required(env, "PMS_HILTON_ONQ_API_CREDENTIAL"),
    credentialHeader: env.PMS_HILTON_ONQ_CREDENTIAL_HEADER?.trim() || "authorization",
    credentialScheme: env.PMS_HILTON_ONQ_CREDENTIAL_SCHEME?.trim() || "Bearer",
    timeoutMs: env.PMS_HILTON_ONQ_TIMEOUT_MS ? Number(env.PMS_HILTON_ONQ_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { method: "GET", path: required(env, "PMS_HILTON_ONQ_AVAILABILITY_PATH") },
      create_reservation: { method: "POST", path: required(env, "PMS_HILTON_ONQ_CREATE_PATH") },
      get_reservation: { method: "GET", path: required(env, "PMS_HILTON_ONQ_GET_PATH") },
      modify_reservation: { method: "PUT", path: required(env, "PMS_HILTON_ONQ_MODIFY_PATH") },
      cancel_reservation: { method: "POST", path: required(env, "PMS_HILTON_ONQ_CANCEL_PATH") },
    },
  };
}

export function createHiltonOnQSyncAdapter(config: HiltonOnQConfig, fetcher?: HiltonOnQFetch) {
  return new HiltonPmsAdapter(
    "hilton-onq",
    new HiltonOnQHttpTransport(config, fetcher),
    new HiltonOnQMapper(),
  );
}
