import type { StandardPmsProviderId } from "./providers";
import { isStandardPmsProvider } from "./providers";

export type StandardPmsConnectionTestConfig = {
  providerId: StandardPmsProviderId;
  baseUrl: string;
  apiCredential?: string;
  getApiCredential?: () => Promise<string>;
  validationPath: string;
  credentialHeader?: string;
  credentialScheme?: string;
  propertyCode?: string;
  timeoutMs?: number;
};

export type StandardPmsConnectionTestResult = {
  providerId: StandardPmsProviderId;
  reachable: true;
};

export type StandardPmsConnectionTestFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class StandardPmsConnectionTestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "StandardPmsConnectionTestError";
  }
}

function providerCode(providerId: StandardPmsProviderId) {
  return providerId.replaceAll("-", "_");
}

function validate(config: StandardPmsConnectionTestConfig) {
  if (!isStandardPmsProvider(config.providerId)) {
    throw new Error("A supported standard PMS provider is required");
  }
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("PMS base URL must use HTTPS");
  if (!config.validationPath.trim()) throw new Error("PMS validation path is required");
  if (!config.apiCredential?.trim() && !config.getApiCredential) {
    throw new Error("PMS API credential or credential provider is required");
  }
  const endpoint = new URL(config.validationPath, baseUrl);
  if (endpoint.origin !== baseUrl.origin) {
    throw new Error("PMS validation endpoint must remain on the configured origin");
  }
  if (config.propertyCode) endpoint.searchParams.set("propertyCode", config.propertyCode);
  return endpoint;
}

function errorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  const value = source.message ?? source.detail ?? source.error ?? source.errorMessage;
  return typeof value === "string" ? value : undefined;
}

/** Performs a read-only, vendor-configured credential and property-scope check. */
export async function testStandardPmsConnection(
  config: StandardPmsConnectionTestConfig,
  fetcher: StandardPmsConnectionTestFetch = fetch,
): Promise<StandardPmsConnectionTestResult> {
  const endpoint = validate(config);
  const credential = config.getApiCredential
    ? await config.getApiCredential()
    : config.apiCredential;
  if (!credential?.trim()) throw new Error("PMS credential provider returned an empty value");

  const header = config.credentialHeader ?? "authorization";
  const scheme = config.credentialScheme ?? "Bearer";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  const code = providerCode(config.providerId);
  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        [header]: `${scheme} ${credential}`.trim(),
      },
      signal: controller.signal,
    });
    const payload = response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new StandardPmsConnectionTestError(
        errorMessage(payload) || `${config.providerId} API returned status ${response.status}`,
        response.status,
        `${code}_connection_rejected`,
      );
    }
    return { providerId: config.providerId, reachable: true };
  } catch (error) {
    if (error instanceof StandardPmsConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new StandardPmsConnectionTestError(
        `${config.providerId} connection test timed out`,
        504,
        `${code}_connection_timeout`,
      );
    }
    throw new StandardPmsConnectionTestError(
      `${config.providerId} connection test failed`,
      502,
      `${code}_connection_unreachable`,
    );
  } finally {
    clearTimeout(timeout);
  }
}
