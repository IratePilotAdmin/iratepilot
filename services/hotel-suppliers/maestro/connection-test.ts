import type { MaestroFetch } from "./transport";

export type MaestroConnectionTestConfig = {
  baseUrl: string;
  accessToken: string;
  validationPath: string;
  authorizationHeader?: string;
  authorizationScheme?: string;
  timeoutMs?: number;
};

export type MaestroConnectionTestResult = { resourceCount: number };

export class MaestroConnectionTestError extends Error {
  constructor(message: string, readonly status: number, readonly detailCode: string) {
    super(message);
    this.name = "MaestroConnectionTestError";
  }
}

function validate(config: MaestroConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Maestro base URL must use HTTPS");
  if (!config.accessToken.trim()) throw new Error("Maestro access token is required");
  if (!config.validationPath.trim()) throw new Error("Maestro validation path is required");
  const endpoint = new URL(config.validationPath, baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Maestro validation path must remain on the configured API origin");
  }
  return endpoint;
}

/** Verifies partner-issued Maestro credentials through a configured read-only resource. */
export async function testMaestroSandboxConnection(
  config: MaestroConnectionTestConfig,
  fetcher: MaestroFetch = fetch,
): Promise<MaestroConnectionTestResult> {
  const endpoint = validate(config);
  const authHeader = config.authorizationHeader?.trim() || "authorization";
  const scheme = config.authorizationScheme ?? "Bearer";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        [authHeader]: `${scheme} ${config.accessToken}`.trim(),
      },
      signal: controller.signal,
    });
    const payload = response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new MaestroConnectionTestError(
        `Maestro validation read returned status ${response.status}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "maestro_authentication_failed"
          : "maestro_sandbox_rejected",
      );
    }
    if (payload === undefined) return { resourceCount: 0 };
    if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
      throw new MaestroConnectionTestError(
        "Maestro returned an invalid validation response",
        502,
        "maestro_invalid_validation_response",
      );
    }
    return { resourceCount: Array.isArray(payload) ? payload.length : 1 };
  } catch (error) {
    if (error instanceof MaestroConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MaestroConnectionTestError("Maestro sandbox request timed out", 504, "maestro_sandbox_timeout");
    }
    throw new MaestroConnectionTestError("Maestro sandbox connection failed", 502, "maestro_sandbox_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}
