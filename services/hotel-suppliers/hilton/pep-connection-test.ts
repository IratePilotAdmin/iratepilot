import type { HiltonPepFetch } from "./pep-transport";

export type HiltonPepConnectionTestConfig = {
  baseUrl: string;
  apiCredential: string;
  validationPath: string;
  credentialHeader?: string;
  credentialScheme?: string;
  timeoutMs?: number;
};

export type HiltonPepConnectionTestResult = { resourceCount: number };

export class HiltonPepConnectionTestError extends Error {
  constructor(message: string, readonly status: number, readonly detailCode: string) {
    super(message);
    this.name = "HiltonPepConnectionTestError";
  }
}

function validate(config: HiltonPepConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Hilton PEP base URL must use HTTPS");
  if (!config.apiCredential.trim()) throw new Error("Hilton PEP API credential is required");
  if (!config.validationPath.trim()) throw new Error("Hilton PEP validation path is required");
  const endpoint = new URL(config.validationPath, baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Hilton PEP validation path must remain on the configured API origin");
  }
  return endpoint;
}

/** Verifies Hilton-issued PEP credentials through an approved read-only resource. */
export async function testHiltonPepSandboxConnection(
  config: HiltonPepConnectionTestConfig,
  fetcher: HiltonPepFetch = fetch,
): Promise<HiltonPepConnectionTestResult> {
  const endpoint = validate(config);
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
      throw new HiltonPepConnectionTestError(
        `Hilton PEP validation read returned status ${response.status}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "hilton_pep_authentication_failed"
          : "hilton_pep_sandbox_rejected",
      );
    }
    if (payload === undefined) return { resourceCount: 0 };
    if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
      throw new HiltonPepConnectionTestError(
        "Hilton PEP returned an invalid validation response",
        502,
        "hilton_pep_invalid_validation_response",
      );
    }
    return { resourceCount: Array.isArray(payload) ? payload.length : 1 };
  } catch (error) {
    if (error instanceof HiltonPepConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HiltonPepConnectionTestError("Hilton PEP sandbox request timed out", 504, "hilton_pep_sandbox_timeout");
    }
    throw new HiltonPepConnectionTestError("Hilton PEP sandbox connection failed", 502, "hilton_pep_sandbox_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}
