import { MarriottPmsAdapter } from "./adapter";
import { MarriottFsPmsMapper } from "./fs-pms-mapper";
import { MarriottFsPmsHttpTransport, type MarriottFsPmsConfig, type MarriottFsPmsFetch } from "./fs-pms-transport";

export type MarriottFsPmsSyncEnvironment = Record<string, string | undefined>;
function required(env: MarriottFsPmsSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Marriott FS-PMS configuration: ${key}`);
  return value;
}
export function loadMarriottFsPmsSyncConfig(env: MarriottFsPmsSyncEnvironment): MarriottFsPmsConfig {
  return {
    baseUrl: required(env, "PMS_MARRIOTT_FS_PMS_BASE_URL"),
    apiCredential: required(env, "PMS_MARRIOTT_FS_PMS_API_CREDENTIAL"),
    credentialHeader: env.PMS_MARRIOTT_FS_PMS_CREDENTIAL_HEADER?.trim() || "authorization",
    credentialScheme: env.PMS_MARRIOTT_FS_PMS_CREDENTIAL_SCHEME?.trim() || "Bearer",
    timeoutMs: env.PMS_MARRIOTT_FS_PMS_TIMEOUT_MS ? Number(env.PMS_MARRIOTT_FS_PMS_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { method: "GET", path: required(env, "PMS_MARRIOTT_FS_PMS_AVAILABILITY_PATH") },
      create_reservation: { method: "POST", path: required(env, "PMS_MARRIOTT_FS_PMS_CREATE_PATH") },
      get_reservation: { method: "GET", path: required(env, "PMS_MARRIOTT_FS_PMS_GET_PATH") },
      modify_reservation: { method: "PUT", path: required(env, "PMS_MARRIOTT_FS_PMS_MODIFY_PATH") },
      cancel_reservation: { method: "POST", path: required(env, "PMS_MARRIOTT_FS_PMS_CANCEL_PATH") },
    },
  };
}
export function createMarriottFsPmsSyncAdapter(config: MarriottFsPmsConfig, fetcher?: MarriottFsPmsFetch) {
  return new MarriottPmsAdapter("marriott-fs-pms", new MarriottFsPmsHttpTransport(config, fetcher), new MarriottFsPmsMapper());
}
