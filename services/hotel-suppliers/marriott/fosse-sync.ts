import { MarriottPmsAdapter } from "./adapter";
import { MarriottFosseMapper } from "./fosse-mapper";
import { MarriottFosseHttpTransport, type MarriottFosseConfig, type MarriottFosseFetch } from "./fosse-transport";

export type MarriottFosseSyncEnvironment = Record<string, string | undefined>;
function required(env: MarriottFosseSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Marriott FOSSE configuration: ${key}`);
  return value;
}
export function loadMarriottFosseSyncConfig(env: MarriottFosseSyncEnvironment): MarriottFosseConfig {
  return {
    baseUrl: required(env, "PMS_MARRIOTT_FOSSE_BASE_URL"),
    apiCredential: required(env, "PMS_MARRIOTT_FOSSE_API_CREDENTIAL"),
    credentialHeader: env.PMS_MARRIOTT_FOSSE_CREDENTIAL_HEADER?.trim() || "authorization",
    credentialScheme: env.PMS_MARRIOTT_FOSSE_CREDENTIAL_SCHEME?.trim() || "Bearer",
    timeoutMs: env.PMS_MARRIOTT_FOSSE_TIMEOUT_MS ? Number(env.PMS_MARRIOTT_FOSSE_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { method: "GET", path: required(env, "PMS_MARRIOTT_FOSSE_AVAILABILITY_PATH") },
      create_reservation: { method: "POST", path: required(env, "PMS_MARRIOTT_FOSSE_CREATE_PATH") },
      get_reservation: { method: "GET", path: required(env, "PMS_MARRIOTT_FOSSE_GET_PATH") },
      modify_reservation: { method: "PUT", path: required(env, "PMS_MARRIOTT_FOSSE_MODIFY_PATH") },
      cancel_reservation: { method: "POST", path: required(env, "PMS_MARRIOTT_FOSSE_CANCEL_PATH") },
    },
  };
}
export function createMarriottFosseSyncAdapter(config: MarriottFosseConfig, fetcher?: MarriottFosseFetch) {
  return new MarriottPmsAdapter("marriott-fosse", new MarriottFosseHttpTransport(config, fetcher), new MarriottFosseMapper());
}
