import type { MarriottFsPmsFetch } from "./fs-pms-transport";

export type MarriottFsPmsConnectionTestConfig = {
  baseUrl: string;
  apiCredential: string;
  validationPath: string;
  credentialHeader?: string;
  credentialScheme?: string;
  timeoutMs?: number;
};

export type MarriottFsPmsConnectionTestResult = { resourceCount: number };

export class MarriottFsPmsConnectionTestError extends Error {
  constructor(message: string, readonly status: number, readonly detailCode: string) {
    super(message);
    this.name = "MarriottFsPmsConnectionTestError";
  }
}

function validationEndpoint(config: MarriottFsPmsConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Marriott FS-PMS base URL must use HTTPS");
  if (!config.apiCredential.trim()) throw new Error("Marriott FS-PMS API credential is required");
  if (!config.validationPath.trim()) throw new Error("Marriott FS-PMS validation path is required");
  const endpoint = new URL(config.validationPath, baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("Marriott FS-PMS validation path must remain on the configured API origin");
  }
  return endpoint;
}

/** Verifies Marriott-issued FS-PMS credentials through an approved read-only resource. */
export async function testMarriottFsPmsSandboxConnection(
  config: MarriottFsPmsConnectionTestConfig,
  fetcher: MarriottFsPmsFetch = fetch,
): Promise<MarriottFsPmsConnectionTestResult> {
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
      throw new MarriottFsPmsConnectionTestError(
        `Marriott FS-PMS validation read returned status ${response.status}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "marriott_fs_pms_authentication_failed"
          : "marriott_fs_pms_sandbox_rejected",
      );
    }
    if (payload === undefined) return { resourceCount: 0 };
    if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
      throw new MarriottFsPmsConnectionTestError(
        "Marriott FS-PMS returned an invalid validation response",
        502,
        "marriott_fs_pms_invalid_validation_response",
      );
    }
    return { resourceCount: Array.isArray(payload) ? payload.length : 1 };
  } catch (error) {
    if (error instanceof MarriottFsPmsConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MarriottFsPmsConnectionTestError(
        "Marriott FS-PMS sandbox request timed out",
        504,
        "marriott_fs_pms_sandbox_timeout",
      );
    }
    throw new MarriottFsPmsConnectionTestError(
      "Marriott FS-PMS sandbox connection failed",
      502,
      "marriott_fs_pms_sandbox_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}
