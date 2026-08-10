import type { HotelKeyFetch } from "./transport";

export type HotelKeyConnectionTestConfig = {
  baseUrl: string;
  apiCredential: string;
  validationPath: string;
  credentialHeader?: string;
  credentialScheme?: string;
  timeoutMs?: number;
};
export type HotelKeyConnectionTestResult = { resourceCount: number };

export class HotelKeyConnectionTestError extends Error {
  constructor(message: string, readonly status: number, readonly detailCode: string) {
    super(message);
    this.name = "HotelKeyConnectionTestError";
  }
}

function endpoint(config: HotelKeyConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("HotelKey base URL must use HTTPS");
  if (!config.apiCredential.trim()) throw new Error("HotelKey API credential is required");
  if (!config.validationPath.trim()) throw new Error("HotelKey validation path is required");
  const result = new URL(config.validationPath, baseUrl);
  if (result.origin !== baseUrl.origin) throw new Error("HotelKey validation path must remain on the configured API origin");
  return result;
}

/** Verifies HotelKey-issued credentials through an approved read-only resource. */
export async function testHotelKeySandboxConnection(
  config: HotelKeyConnectionTestConfig,
  fetcher: HotelKeyFetch = fetch,
): Promise<HotelKeyConnectionTestResult> {
  const url = endpoint(config);
  const header = config.credentialHeader?.trim() || "authorization";
  const scheme = config.credentialScheme ?? "Bearer";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/json", [header]: `${scheme} ${config.apiCredential}`.trim() },
      signal: controller.signal,
    });
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new HotelKeyConnectionTestError(
        `HotelKey validation read returned status ${response.status}`,
        response.status,
        response.status === 401 || response.status === 403
          ? "hotelkey_authentication_failed"
          : "hotelkey_sandbox_rejected",
      );
    }
    if (payload === undefined) return { resourceCount: 0 };
    if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
      throw new HotelKeyConnectionTestError("HotelKey returned an invalid validation response", 502, "hotelkey_invalid_validation_response");
    }
    return { resourceCount: Array.isArray(payload) ? payload.length : 1 };
  } catch (error) {
    if (error instanceof HotelKeyConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HotelKeyConnectionTestError("HotelKey sandbox request timed out", 504, "hotelkey_sandbox_timeout");
    }
    throw new HotelKeyConnectionTestError("HotelKey sandbox connection failed", 502, "hotelkey_sandbox_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}
