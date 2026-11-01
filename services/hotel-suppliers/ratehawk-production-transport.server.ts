import "server-only";

import {
  InventorySupplierResponseError,
  parseInventorySupplierResponse,
  type InventoryJsonValue,
} from "./inventory-response.server";
import type { InventorySandboxRequest } from "./inventory-sandbox-request.server";
import type { InventorySandboxFetch } from "./inventory-sandbox-transport.server";

export type RatehawkProductionTransportErrorCode =
  | "certification_not_approved"
  | "credentials_not_ready"
  | "invalid_request"
  | "invalid_timeout"
  | "timeout"
  | "network_error";

export class RatehawkProductionTransportError extends Error {
  constructor(readonly code: RatehawkProductionTransportErrorCode) {
    super(`RateHawk production transport failed (${code}).`);
    this.name = "RatehawkProductionTransportError";
  }
}

const productionSearchUrl = "https://api.ratehawk.com/api/b2b/v3/search/serp/hotels/";
const maximumRequestBodyBytes = 1_000_000;
const maximumResponseBodyBytes = 5_000_000;
const unsafeHeaderValuePattern = /[\u0000-\u001f\u007f]/;

function configured(value: string | undefined, minimumLength: number) {
  const normalized = value?.trim() ?? "";
  return normalized.length >= minimumLength
    && !/^(?:changeme|example|placeholder|todo|unknown)$/i.test(normalized);
}

function requireProductionGate(environment: Record<string, string | undefined>) {
  if (environment.HOTEL_INVENTORY_RATEHAWK_CERTIFICATION_APPROVED?.trim().toLowerCase() !== "true") {
    throw new RatehawkProductionTransportError("certification_not_approved");
  }
  const keyId = environment.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID?.trim() ?? "";
  const apiKey = environment.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY?.trim() ?? "";
  const sandboxKeyId = environment.HOTEL_INVENTORY_RATEHAWK_KEY_ID?.trim() ?? "";
  const sandboxApiKey = environment.HOTEL_INVENTORY_RATEHAWK_API_KEY?.trim() ?? "";
  if (!configured(keyId, 3) || !configured(apiKey, 8)
    || (keyId === sandboxKeyId && apiKey === sandboxApiKey)) {
    throw new RatehawkProductionTransportError("credentials_not_ready");
  }
}

function validateRequest(request: InventorySandboxRequest) {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new RatehawkProductionTransportError("invalid_request");
  }
  if (request.supplierId !== "ratehawk" || request.method !== "POST"
    || url.href !== productionSearchUrl || url.username || url.password || url.hash
    || !request.headers.Authorization?.startsWith("Basic ")
    || !request.body || Buffer.byteLength(request.body, "utf8") > maximumRequestBodyBytes
    || Object.values(request.headers).some((value) => !value
      || value.length > 8192 || unsafeHeaderValuePattern.test(value))) {
    throw new RatehawkProductionTransportError("invalid_request");
  }
}

async function readBoundedBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumResponseBodyBytes) {
      await reader.cancel();
      throw new InventorySupplierResponseError("ratehawk", "response_too_large", response.status);
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function executeRatehawkProductionSmokeRequest(
  request: InventorySandboxRequest,
  options: {
    environment: Record<string, string | undefined>;
    timeoutMs?: number;
    fetcher?: InventorySandboxFetch;
  },
): Promise<InventoryJsonValue> {
  requireProductionGate(options.environment);
  validateRequest(request);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new RatehawkProductionTransportError("invalid_timeout");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(request.url, {
      method: request.method,
      headers: { ...request.headers },
      body: request.body,
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
    });
    return parseInventorySupplierResponse({
      supplierId: "ratehawk",
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: await readBoundedBody(response),
    });
  } catch (error) {
    if (error instanceof InventorySupplierResponseError
      || error instanceof RatehawkProductionTransportError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RatehawkProductionTransportError("timeout");
    }
    throw new RatehawkProductionTransportError("network_error");
  } finally {
    clearTimeout(timeout);
  }
}
