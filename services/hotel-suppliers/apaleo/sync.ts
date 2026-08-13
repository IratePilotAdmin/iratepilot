import { ApaleoAdapter } from "./adapter";
import { ApaleoBookingMapper } from "./mapper";
import { ApaleoHttpTransport, type ApaleoConfig, type ApaleoFetch } from "./transport";

export type ApaleoSyncEnvironment = Record<string, string | undefined>;
export type ApaleoSyncConfig = {
  transport: Omit<ApaleoConfig, "accessToken" | "getAccessToken">;
  oauth: { clientId: string; clientSecret: string; identityUrl: string };
};

function required(env: ApaleoSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing Apaleo configuration: ${key}`);
  return value;
}

export function loadApaleoSyncConfig(env: ApaleoSyncEnvironment): ApaleoSyncConfig {
  return {
    transport: {
      baseUrl: env.PMS_APALEO_BASE_URL?.trim() || "https://api.apaleo.com",
      timeoutMs: env.PMS_APALEO_TIMEOUT_MS ? Number(env.PMS_APALEO_TIMEOUT_MS) : 15_000,
    },
    oauth: {
      clientId: required(env, "PMS_APALEO_CLIENT_ID"),
      clientSecret: required(env, "PMS_APALEO_CLIENT_SECRET"),
      identityUrl: env.PMS_APALEO_IDENTITY_URL?.trim() || "https://identity.apaleo.com/connect/token",
    },
  };
}

function tokenProvider(config: ApaleoSyncConfig, fetcher: ApaleoFetch) {
  let cached: { token: string; expiresAt: number } | undefined;
  return async () => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const identityUrl = new URL(config.oauth.identityUrl);
    if (identityUrl.protocol !== "https:") throw new Error("Apaleo identity URL must use HTTPS");
    const response = await fetcher(identityUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${config.oauth.clientId}:${config.oauth.clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    const payload = await response.json().catch(() => undefined);
    const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const token = typeof source.access_token === "string" ? source.access_token.trim() : "";
    if (!response.ok || !token) throw new Error("Apaleo OAuth token request failed");
    const expiresIn = Number(source.expires_in);
    cached = {
      token,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300) * 1_000,
    };
    return token;
  };
}

export function createApaleoSyncAdapter(
  config: ApaleoSyncConfig,
  fetcher: ApaleoFetch = fetch,
) {
  return new ApaleoAdapter(
    new ApaleoHttpTransport({
      ...config.transport,
      getAccessToken: tokenProvider(config, fetcher),
    }, fetcher),
    new ApaleoBookingMapper(),
  );
}
