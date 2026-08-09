import type { MarriottFosseFetch } from "./fosse-transport";

export type MarriottFosseConnectionTestConfig = {
  baseUrl: string;
  apiCredential: string;
  validationPath: string;
  credentialHeader?: string;
  credentialScheme?: string;
  timeoutMs?: number;
};

export type MarriottFosseConnectionTestResult = { resourceCount: number };

export class MarriottFosseConnectionTestError extends Error {
  constructor(message: string, readonly status: number, readonly detailCode: string) {
    super(message);
    this.name = "MarriottFosseConnectionTestError";
  }
}

function validationEndpoint(config: MarriottFosseConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Marriott FOSSE base URL must use HTTPS");
  if (!config.apiCredential.trim()) throw new Error("Marriott FOSSE API credential is required");
  if (!config.validationPath.trim()) throw new Error("Marriott FOSSE validation path is required");
  const endpoint = new URL(config.validationPath, baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Marriott FOSSE validation path must remain on the configured API origin");
  }
  return endpoint;
}

/** Verifies Marriott-issued FOSSE credentials through an approved read-only resource. */
export async function testMarriottFosseSandboxConnection(
  config: MarriottFosseConnectionTestConfig,
  fetcher: MarriottFosseFetch = fetch,
): Promise<MarriottFosseConnectionTestResult> {
  const endpoint = validationEndpoint(config);
  const header = config.credentialHeader?.trim() || "authorization";
  const scheme = config.credentialScheme ?? "Bearer";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: { accept: "application/json", [header]: `${scheme} ${config.apiCredential}`.trim() },
      signal: controller.signal,
    });
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new MarriottFosseConnectionTestError(
        `Marriott FOSSE validation read returned status ${response.status}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "marriott_fosse_authentication_failed"
          : "marriott_fosse_sandbox_rejected",
      );
    }
    if (payload === undefined) return { resourceCount: 0 };
    if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
      throw new MarriottFosseConnectionTestError(
        "Marriott FOSSE returned an invalid validation response",
        502,
        "marriott_fosse_invalid_validation_response",
      );
    }
    return { resourceCount: Array.isArray(payload) ? payload.length : 1 };
  } catch (error) {
    if (error instanceof MarriottFosseConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MarriottFosseConnectionTestError(
        "Marriott FOSSE sandbox request timed out",
        504,
        "marriott_fosse_sandbox_timeout",
      );
    }
    throw new MarriottFosseConnectionTestError(
      "Marriott FOSSE sandbox connection failed",
      502,
      "marriott_fosse_sandbox_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}
