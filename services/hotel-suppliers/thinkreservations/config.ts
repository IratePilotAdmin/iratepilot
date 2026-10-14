import type { ThinkReservationsClientConfig } from "./client";

export type ThinkReservationsEnvironment = Record<string, string | undefined>;

function required(environment: ThinkReservationsEnvironment, key: string) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Missing ThinkReservations configuration: ${key}`);
  return value;
}

export function loadThinkReservationsConfig(
  environment: ThinkReservationsEnvironment,
): ThinkReservationsClientConfig {
  return {
    baseUrl: required(environment, "PMS_THINKRESERVATIONS_BASE_URL"),
    tokenUrl: required(environment, "PMS_THINKRESERVATIONS_TOKEN_URL"),
    clientId: required(environment, "PMS_THINKRESERVATIONS_CLIENT_ID"),
    clientSecret: required(environment, "PMS_THINKRESERVATIONS_CLIENT_SECRET"),
    audience: required(environment, "PMS_THINKRESERVATIONS_AUDIENCE"),
    timeoutMs: environment.PMS_THINKRESERVATIONS_TIMEOUT_MS
      ? Number(environment.PMS_THINKRESERVATIONS_TIMEOUT_MS)
      : 15_000,
  };
}
