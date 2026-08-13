import type { SihotFetch } from "./transport";

export type SihotConnectionTestConfig = {
  baseUrl: string;
  user: string;
  password: string;
  hotel: string;
  productId: string;
  timeoutMs?: number;
};

export type SihotConnectionTestResult = {
  hotelCount: number;
};

export class SihotConnectionTestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "SihotConnectionTestError";
  }
}

function validate(config: SihotConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("SIHOT base URL must use HTTPS");
  for (const [label, value] of [
    ["user", config.user],
    ["password", config.password],
    ["hotel", config.hotel],
    ["product ID", config.productId],
  ]) {
    if (!value.trim()) throw new Error(`SIHOT ${label} is required`);
  }
  return baseUrl;
}

function authentication(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  const raw = Array.isArray(source.Authentication)
    ? source.Authentication[0]
    : source.Authentication;
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  return typeof value.SecurityID === "string" && value.SecurityID.trim()
    ? value.SecurityID
    : undefined;
}

/** Authenticates against SIHOT's documented, non-mutating hotel authentication service. */
export async function testSihotSandboxConnection(
  config: SihotConnectionTestConfig,
  fetcher: SihotFetch = fetch,
): Promise<SihotConnectionTestResult> {
  const baseUrl = validate(config);
  const endpoint = new URL("S_AUTHENTICATE_HOTEL", baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("SIHOT connection test must remain on the configured API origin");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        AuthenticationInfos: {
          user: config.user,
          password: config.password,
          hotel: config.hotel,
          product: config.productId,
        },
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new SihotConnectionTestError(
        `SIHOT authentication returned status ${response.status}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "sihot_authentication_failed"
          : "sihot_sandbox_rejected",
      );
    }
    if (!authentication(payload)) {
      throw new SihotConnectionTestError(
        "SIHOT returned an invalid authentication response",
        502,
        "sihot_invalid_authentication_response",
      );
    }
    return { hotelCount: 1 };
  } catch (error) {
    if (error instanceof SihotConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SihotConnectionTestError(
        "SIHOT sandbox request timed out",
        504,
        "sihot_sandbox_timeout",
      );
    }
    throw new SihotConnectionTestError(
      "SIHOT sandbox connection failed",
      502,
      "sihot_sandbox_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}
