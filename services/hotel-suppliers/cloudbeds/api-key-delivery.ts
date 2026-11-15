import type { CloudbedsFetch } from "./transport";

const DEFAULT_TOKEN_URL = "https://hotels.cloudbeds.com/api/v1.3/access_token";
const DEFAULT_API_BASE_URL = "https://api.cloudbeds.com";

export type CloudbedsApiKeyDeliveryConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenUrl?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
};

export class CloudbedsApiKeyDeliveryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "CloudbedsApiKeyDeliveryError";
  }
}

function httpsUrl(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return url;
}

function required(value: string, label: string) {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

async function json(response: Response) {
  return response.json().catch(() => undefined) as Promise<unknown>;
}

function vendorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const source = payload as Record<string, unknown>;
  const value = source.message ?? source.error_description ?? source.error;
  return typeof value === "string" && value.length <= 300 ? value : undefined;
}

async function withTimeout<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error instanceof CloudbedsApiKeyDeliveryError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CloudbedsApiKeyDeliveryError(
        "Cloudbeds authorization timed out",
        504,
        "cloudbeds_authorization_timeout",
      );
    }
    throw new CloudbedsApiKeyDeliveryError(
      "Cloudbeds authorization could not be completed",
      502,
      "cloudbeds_authorization_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeCloudbedsAuthorizationCode(
  config: CloudbedsApiKeyDeliveryConfig,
  code: string,
  fetcher: CloudbedsFetch = fetch,
) {
  const tokenUrl = httpsUrl(config.tokenUrl ?? DEFAULT_TOKEN_URL, "Cloudbeds token URL");
  const clientId = required(config.clientId, "Cloudbeds client ID");
  const clientSecret = required(config.clientSecret, "Cloudbeds client secret");
  const redirectUri = httpsUrl(config.redirectUri, "Cloudbeds redirect URI").toString();
  const authorizationCode = required(code, "Cloudbeds authorization code");

  return withTimeout(config.timeoutMs ?? 15_000, async (signal) => {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:api-key",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code: authorizationCode,
    });
    const response = await fetcher(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error",
      signal,
    });
    const payload = await json(response);
    if (!response.ok) {
      throw new CloudbedsApiKeyDeliveryError(
        vendorMessage(payload) || `Cloudbeds authorization returned status ${response.status}`,
        response.status,
        "cloudbeds_authorization_rejected",
      );
    }
    const accessToken = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).access_token
      : undefined;
    if (typeof accessToken !== "string" || !accessToken.startsWith("cbat_")) {
      throw new CloudbedsApiKeyDeliveryError(
        "Cloudbeds returned an invalid API key response",
        502,
        "cloudbeds_invalid_api_key_response",
      );
    }
    return accessToken;
  });
}

function hotelArray(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const source = payload as Record<string, unknown>;
  if (Array.isArray(source.data)) return source.data;
  if (Array.isArray(source.hotels)) return source.hotels;
  return undefined;
}

export async function getCloudbedsAuthorizedPropertyIds(
  config: Pick<CloudbedsApiKeyDeliveryConfig, "apiBaseUrl" | "timeoutMs"> & { apiKey: string },
  fetcher: CloudbedsFetch = fetch,
) {
  const apiKey = required(config.apiKey, "Cloudbeds API key");
  const baseUrl = httpsUrl(config.apiBaseUrl ?? DEFAULT_API_BASE_URL, "Cloudbeds API base URL");
  const endpoint = new URL("/api/v1.3/getHotels", baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Cloudbeds hotels request must remain on the configured origin");
  }
  endpoint.searchParams.set("pageNumber", "1");
  endpoint.searchParams.set("pageSize", "100");

  return withTimeout(config.timeoutMs ?? 15_000, async (signal) => {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
      redirect: "error",
      signal,
    });
    const payload = await json(response);
    if (!response.ok) {
      throw new CloudbedsApiKeyDeliveryError(
        vendorMessage(payload) || `Cloudbeds hotels request returned status ${response.status}`,
        response.status,
        "cloudbeds_hotels_rejected",
      );
    }
    const hotels = hotelArray(payload);
    if (!hotels) {
      throw new CloudbedsApiKeyDeliveryError(
        "Cloudbeds returned an invalid hotels response",
        502,
        "cloudbeds_invalid_hotels_response",
      );
    }
    const propertyIds = hotels.flatMap((hotel) => {
      if (!hotel || typeof hotel !== "object" || Array.isArray(hotel)) return [];
      const source = hotel as Record<string, unknown>;
      const value = source.propertyID ?? source.propertyId;
      return typeof value === "string" || typeof value === "number" ? [String(value)] : [];
    });
    return [...new Set(propertyIds)];
  });
}
