import { HiltonPmsAdapter } from "./adapter";
import { HiltonPepMapper } from "./pep-mapper";
import { HiltonPepHttpTransport, type HiltonPepConfig, type HiltonPepFetch } from "./pep-transport";

export type HiltonPepSyncEnvironment = Record<string, string | undefined>;

function required(env: HiltonPepSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Hilton PEP configuration: ${key}`);
  return value;
}

export function loadHiltonPepSyncConfig(env: HiltonPepSyncEnvironment): HiltonPepConfig {
  return {
    baseUrl: required(env, "PMS_HILTON_PEP_BASE_URL"),
    apiCredential: required(env, "PMS_HILTON_PEP_API_CREDENTIAL"),
    credentialHeader: env.PMS_HILTON_PEP_CREDENTIAL_HEADER?.trim() || "authorization",
    credentialScheme: env.PMS_HILTON_PEP_CREDENTIAL_SCHEME?.trim() || "Bearer",
    timeoutMs: env.PMS_HILTON_PEP_TIMEOUT_MS ? Number(env.PMS_HILTON_PEP_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { method: "GET", path: required(env, "PMS_HILTON_PEP_AVAILABILITY_PATH") },
      create_reservation: { method: "POST", path: required(env, "PMS_HILTON_PEP_CREATE_PATH") },
      get_reservation: { method: "GET", path: required(env, "PMS_HILTON_PEP_GET_PATH") },
      modify_reservation: { method: "PUT", path: required(env, "PMS_HILTON_PEP_MODIFY_PATH") },
      cancel_reservation: { method: "POST", path: required(env, "PMS_HILTON_PEP_CANCEL_PATH") },
    },
  };
}

export function createHiltonPepSyncAdapter(config: HiltonPepConfig, fetcher?: HiltonPepFetch) {
  return new HiltonPmsAdapter(
    "hilton-pep",
    new HiltonPepHttpTransport(config, fetcher),
    new HiltonPepMapper(),
  );
}
