import { HotelKeyAdapter } from "./adapter";
import { HotelKeyBookingMapper } from "./mapper";
import { HotelKeyHttpTransport, type HotelKeyConfig, type HotelKeyFetch } from "./transport";

export type HotelKeySyncEnvironment = Record<string, string | undefined>;
function required(env: HotelKeySyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing HotelKey configuration: ${key}`);
  return value;
}
export function loadHotelKeySyncConfig(env: HotelKeySyncEnvironment): HotelKeyConfig {
  return {
    baseUrl: required(env, "PMS_HOTELKEY_BASE_URL"),
    apiCredential: required(env, "PMS_HOTELKEY_API_CREDENTIAL"),
    credentialHeader: env.PMS_HOTELKEY_CREDENTIAL_HEADER?.trim() || "authorization",
    credentialScheme: env.PMS_HOTELKEY_CREDENTIAL_SCHEME?.trim() ?? "Bearer",
    timeoutMs: env.PMS_HOTELKEY_TIMEOUT_MS ? Number(env.PMS_HOTELKEY_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: { method: "GET", path: required(env, "PMS_HOTELKEY_AVAILABILITY_PATH") },
      create_reservation: { method: "POST", path: required(env, "PMS_HOTELKEY_CREATE_PATH") },
      get_reservation: { method: "GET", path: required(env, "PMS_HOTELKEY_GET_PATH") },
      modify_reservation: { method: "PUT", path: required(env, "PMS_HOTELKEY_MODIFY_PATH") },
      cancel_reservation: { method: "POST", path: required(env, "PMS_HOTELKEY_CANCEL_PATH") },
    },
  };
}
export function createHotelKeySyncAdapter(config: HotelKeyConfig, fetcher?: HotelKeyFetch) {
  return new HotelKeyAdapter(new HotelKeyHttpTransport(config, fetcher), new HotelKeyBookingMapper());
}
