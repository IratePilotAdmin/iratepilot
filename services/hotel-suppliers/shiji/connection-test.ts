import type { ShijiFetch } from "./transport";

export type ShijiConnectionTestConfig = {
  baseUrl: string;
  accessToken: string;
  validationPath: string;
  authorizationScheme?: "Bearer" | "Basic";
  timeoutMs?: number;
};

export type ShijiConnectionTestResult = { resourceCount: number };

export class ShijiConnectionTestError extends Error {
  constructor(message: string, readonly status: number, readonly detailCode: string) {
    super(message);
    this.name = "ShijiConnectionTestError";
  }
}

function validate(config: ShijiConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Shiji base URL must use HTTPS");
  if (!config.accessToken.trim()) throw new Error("Shiji access token is required");
  if (!config.validationPath.trim()) throw new Error("Shiji validation path is required");
  const endpoint = new URL(config.validationPath, baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Shiji validation path must remain on the configured API origin");
  }
  return endpoint;
}

/** Verifies Shiji partner credentials through a configured read-only subscribed resource. */
export async function testShijiSandboxConnection(
  config: ShijiConnectionTestConfig,
  fetcher: ShijiFetch = fetch,
): Promise<ShijiConnectionTestResult> {
  const endpoint = validate(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `${config.authorizationScheme ?? "Bearer"} ${config.accessToken}`,
      },
      signal: controller.signal,
    });
    const payload = response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new ShijiConnectionTestError(
        `Shiji validation read returned status ${response.status}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "shiji_authentication_failed"
          : "shiji_sandbox_rejected",
      );
    }
    if (payload === undefined) return { resourceCount: 0 };
    if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
      throw new ShijiConnectionTestError(
        "Shiji returned an invalid validation response",
        502,
        "shiji_invalid_validation_response",
      );
    }
    return { resourceCount: Array.isArray(payload) ? payload.length : 1 };
  } catch (error) {
    if (error instanceof ShijiConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ShijiConnectionTestError("Shiji sandbox request timed out", 504, "shiji_sandbox_timeout");
    }
    throw new ShijiConnectionTestError("Shiji sandbox connection failed", 502, "shiji_sandbox_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}
