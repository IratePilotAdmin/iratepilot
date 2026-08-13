import type { MewsConnectorConfig, MewsFetch } from "./transport";

export type MewsConnectionTestResult = {
  serviceCount: number;
};

export class MewsConnectionTestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "MewsConnectionTestError";
  }
}

function validate(config: MewsConnectorConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Mews base URL must use HTTPS");
  if (!config.clientToken.trim() || !config.accessToken.trim() || !config.client.trim()) {
    throw new Error("Mews client token, access token, and client name are required");
  }
  return baseUrl;
}

function errorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const message = source.Message ?? source.message;
  const code = source.Code ?? source.code;
  return {
    message: typeof message === "string" ? message : undefined,
    code: typeof code === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(code)
      ? code
      : undefined,
  };
}

export async function testMewsSandboxConnection(
  config: MewsConnectorConfig,
  fetcher: MewsFetch = fetch,
): Promise<MewsConnectionTestResult> {
  const baseUrl = validate(config);
  const endpoint = new URL("/api/connector/v1/services/getAll", baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Mews connection test must remain on the configured origin");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ClientToken: config.clientToken,
        AccessToken: config.accessToken,
        Client: config.client,
        Limitation: { Count: 1 },
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const detail = errorDetail(payload);
      throw new MewsConnectionTestError(
        detail.message || `Mews sandbox returned status ${response.status}`,
        response.status,
        detail.code || "mews_sandbox_rejected",
      );
    }
    const services = payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).Services
      : undefined;
    if (!Array.isArray(services)) {
      throw new MewsConnectionTestError(
        "Mews sandbox returned an invalid services response",
        502,
        "mews_invalid_services_response",
      );
    }
    return { serviceCount: services.length };
  } catch (error) {
    if (error instanceof MewsConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MewsConnectionTestError("Mews sandbox request timed out", 504, "mews_sandbox_timeout");
    }
    throw new MewsConnectionTestError("Mews sandbox connection failed", 502, "mews_sandbox_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}
