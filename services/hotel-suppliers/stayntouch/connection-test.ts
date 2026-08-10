import type { StayntouchFetch } from "./transport";

export type StayntouchConnectionTestConfig = {
  baseUrl?: string;
  accessToken: string;
  apiVersion?: string;
  timeoutMs?: number;
};

export type StayntouchConnectionTestResult = {
  hotelCount: number;
};

export class StayntouchConnectionTestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "StayntouchConnectionTestError";
  }
}

function validate(config: StayntouchConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl ?? "https://api.stayntouch.com/connect/");
  if (baseUrl.protocol !== "https:") throw new Error("Stayntouch base URL must use HTTPS");
  if (!config.accessToken.trim()) throw new Error("Stayntouch access token is required");
  return baseUrl;
}

function errorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const first = Array.isArray(source.type) ? source.type[0] : undefined;
  const record = first && typeof first === "object"
    ? first as Record<string, unknown>
    : source;
  const message = record.message ?? source.message ?? source.error;
  const code = record.code ?? source.code;
  const serializedCode = typeof code === "string" || typeof code === "number"
    ? String(code)
    : undefined;
  return {
    message: typeof message === "string" ? message : undefined,
    code: serializedCode && /^[A-Za-z0-9_.:-]{1,80}$/.test(serializedCode)
      ? serializedCode.toLowerCase()
      : undefined,
  };
}

function hotelCount(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  if (typeof source.total_count === "number" && Number.isSafeInteger(source.total_count)
    && source.total_count >= 0) return source.total_count;
  if (Array.isArray(source.results)) return source.results.length;
  return undefined;
}

/** Verifies the issued token and hotel scope with Stayntouch's read-only hotels endpoint. */
export async function testStayntouchSandboxConnection(
  config: StayntouchConnectionTestConfig,
  fetcher: StayntouchFetch = fetch,
): Promise<StayntouchConnectionTestResult> {
  const baseUrl = validate(config);
  const endpoint = new URL("hotels?page=1&per_page=1", baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Stayntouch connection test must remain on the configured API origin");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        "api-version": config.apiVersion ?? "2.0",
        accept: "application/json",
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const detail = errorDetail(payload);
      throw new StayntouchConnectionTestError(
        detail.message || `Stayntouch API returned status ${response.status}`,
        response.status,
        detail.code ? `stayntouch_${detail.code}` : "stayntouch_sandbox_rejected",
      );
    }
    const count = hotelCount(payload);
    if (count === undefined) {
      throw new StayntouchConnectionTestError(
        "Stayntouch API returned an invalid hotels response",
        502,
        "stayntouch_invalid_hotels_response",
      );
    }
    return { hotelCount: count };
  } catch (error) {
    if (error instanceof StayntouchConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new StayntouchConnectionTestError(
        "Stayntouch sandbox request timed out",
        504,
        "stayntouch_sandbox_timeout",
      );
    }
    throw new StayntouchConnectionTestError(
      "Stayntouch sandbox connection failed",
      502,
      "stayntouch_sandbox_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}
