import { StandardPmsAdapter } from "../standard";
import { PlanetProtelBookingMapper } from "./mapper";
import {
  PlanetProtelHttpTransport,
  type PlanetProtelConfig,
  type PlanetProtelEndpoint,
  type PlanetProtelFetch,
} from "./transport";

export type PlanetProtelSyncEnvironment = Record<string, string | undefined>;

function required(env: PlanetProtelSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Planet Protel configuration: ${key}`);
  return value;
}

function method(env: PlanetProtelSyncEnvironment, key: string, fallback: PlanetProtelEndpoint["method"]) {
  const value = env[key]?.trim().toUpperCase() || fallback;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) {
    throw new Error(`Invalid Planet Protel configuration: ${key}`);
  }
  return value as PlanetProtelEndpoint["method"];
}

export function loadPlanetProtelSyncConfig(env: PlanetProtelSyncEnvironment) {
  const transport: PlanetProtelConfig = {
    baseUrl: required(env, "PMS_PLANET_PROTEL_BASE_URL"),
    apiCredential: required(env, "PMS_PLANET_PROTEL_API_CREDENTIAL"),
    credentialHeader: env.PMS_PLANET_PROTEL_CREDENTIAL_HEADER?.trim(),
    credentialScheme: env.PMS_PLANET_PROTEL_CREDENTIAL_SCHEME?.trim(),
    timeoutMs: env.PMS_PLANET_PROTEL_TIMEOUT_MS ? Number(env.PMS_PLANET_PROTEL_TIMEOUT_MS) : 15_000,
    endpoints: {
      availability: {
        path: required(env, "PMS_PLANET_PROTEL_AVAILABILITY_PATH"),
        method: method(env, "PMS_PLANET_PROTEL_AVAILABILITY_METHOD", "GET"),
      },
      create_reservation: {
        path: required(env, "PMS_PLANET_PROTEL_CREATE_RESERVATION_PATH"),
        method: method(env, "PMS_PLANET_PROTEL_CREATE_RESERVATION_METHOD", "POST"),
      },
      cancel_reservation: {
        path: required(env, "PMS_PLANET_PROTEL_CANCEL_RESERVATION_PATH"),
        method: method(env, "PMS_PLANET_PROTEL_CANCEL_RESERVATION_METHOD", "POST"),
      },
    },
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_PLANET_PROTEL_CURRENCY"),
      bookingSourceCode: env.PMS_PLANET_PROTEL_BOOKING_SOURCE_CODE?.trim(),
    },
  };
}

export function createPlanetProtelSyncAdapter(
  config: ReturnType<typeof loadPlanetProtelSyncConfig>,
  fetcher?: PlanetProtelFetch,
) {
  return new StandardPmsAdapter(
    "planet-protel",
    new PlanetProtelHttpTransport(config.transport, fetcher),
    new PlanetProtelBookingMapper(config.mapper),
  );
}
