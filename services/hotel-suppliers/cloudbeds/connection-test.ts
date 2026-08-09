import type { CloudbedsConfig, CloudbedsFetch } from "./transport";

export type CloudbedsConnectionTestResult = {
  hotelCount: number;
};

export class CloudbedsConnectionTestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "CloudbedsConnectionTestError";
  }
}

function validate(config: CloudbedsConfig) {
  const baseUrl = new URL(config.baseUrl ?? "https://api.cloudbeds.com");
  if (baseUrl.protocol !== "https:") throw new Error("Cloudbeds base URL must use HTTPS");
  if (!config.apiKey.trim()) throw new Error("Cloudbeds API key is required");
  return baseUrl;
}

function errorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const message = source.message ?? source.error;
  const code = source.code ?? source.errorCode;
  const serializedCode = typeof code === "string" || typeof code === "number"
    ? String(code)
    : undefined;
  return {
    message: typeof message === "string" ? message : undefined,
    code: serializedCode && /^[A-Za-z0-9_.:-]{1,80}$/.test(serializedCode)
      ? serializedCode
      : undefined,
  };
}

function hotelsFrom(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  if (Array.isArray(source.data)) return source.data;
  if (Array.isArray(source.hotels)) return source.hotels;
  return undefined;
}

export async function testCloudbedsSandboxConnection(
  config: CloudbedsConfig,
  fetcher: CloudbedsFetch = fetch,
): Promise<CloudbedsConnectionTestResult> {
  const baseUrl = validate(config);
  const endpoint = new URL("/api/v1.3/getHotels", baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Cloudbeds connection test must remain on the configured origin");
  }
  endpoint.searchParams.set("pageNumber", "1");
  endpoint.searchParams.set("pageSize", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "x-api-key": config.apiKey,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const detail = errorDetail(payload);
      throw new CloudbedsConnectionTestError(
        detail.message || `Cloudbeds sandbox returned status ${response.status}`,
        response.status,
        detail.code || "cloudbeds_sandbox_rejected",
      );
    }
    const hotels = hotelsFrom(payload);
    if (!hotels) {
      throw new CloudbedsConnectionTestError(
        "Cloudbeds sandbox returned an invalid hotels response",
        502,
        "cloudbeds_invalid_hotels_response",
      );
    }
    return { hotelCount: hotels.length };
  } catch (error) {
    if (error instanceof CloudbedsConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CloudbedsConnectionTestError(
        "Cloudbeds sandbox request timed out",
        504,
        "cloudbeds_sandbox_timeout",
      );
    }
    throw new CloudbedsConnectionTestError(
      "Cloudbeds sandbox connection failed",
      502,
      "cloudbeds_sandbox_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}
