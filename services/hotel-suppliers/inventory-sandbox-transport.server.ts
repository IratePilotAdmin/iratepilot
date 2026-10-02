import "server-only";

import type { InventorySupplierId } from "./inventory-readiness";
import { evaluateInventorySandboxRuntimeGate } from "./inventory-runtime-gate.server";
import {
  InventorySupplierResponseError,
  parseInventorySupplierResponse,
  type InventoryJsonValue,
} from "./inventory-response.server";
import type { InventorySandboxRequest } from "./inventory-sandbox-request.server";

export type InventorySandboxTransportErrorCode =
  | "disabled"
  | "invalid_enablement"
  | "credentials_not_ready"
  | "invalid_request"
  | "invalid_timeout"
  | "timeout"
  | "network_error";

export class InventorySandboxTransportError extends Error {
  constructor(
    readonly supplierId: InventorySupplierId,
    readonly code: InventorySandboxTransportErrorCode,
  ) {
    super(`Supplier sandbox transport failed (${supplierId}:${code}).`);
    this.name = "InventorySandboxTransportError";
  }
}

export type InventorySandboxFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const maximumRequestBodyBytes = 1_000_000;
const maximumResponseBodyBytes = 5_000_000;
const unsafeHeaderValuePattern = /[\u0000-\u001f\u007f]/;

function invalidRequest(supplierId: InventorySupplierId): never {
  throw new InventorySandboxTransportError(supplierId, "invalid_request");
}

function validateRequest(request: InventorySandboxRequest) {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    invalidRequest(request.supplierId);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    invalidRequest(request.supplierId);
  }

  const validEndpoint = request.supplierId === "hotelbeds"
    ? request.method === "POST"
      && url.href === "https://api.test.hotelbeds.com/hotel-api/1.0/hotels"
      && Boolean(request.headers["Api-key"] && request.headers["X-Signature"])
    : request.supplierId === "ratehawk"
      ? request.method === "POST"
        && url.href === "https://api-sandbox.ratehawk.com/api/b2b/v3/search/serp/hotels/"
        && request.headers.Authorization?.startsWith("Basic ")
      : request.method === "GET"
        && url.origin === "https://test.ean.com"
        && url.pathname === "/v3/properties/availability"
        && Boolean(url.search)
        && request.headers.Authorization?.startsWith("EAN ");
  if (!validEndpoint) invalidRequest(request.supplierId);

  for (const value of Object.values(request.headers)) {
    if (!value || value.length > 8192 || unsafeHeaderValuePattern.test(value)) {
      invalidRequest(request.supplierId);
    }
  }
  if (request.method === "GET" && request.body !== undefined) {
    invalidRequest(request.supplierId);
  }
  if (request.method === "POST"
    && (!request.body || Buffer.byteLength(request.body, "utf8") > maximumRequestBodyBytes)) {
    invalidRequest(request.supplierId);
  }
}

async function readBoundedBody(
  supplierId: InventorySupplierId,
  response: Response,
) {
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
      throw new InventorySupplierResponseError(
        supplierId,
        "response_too_large",
        response.status,
      );
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function executeInventorySandboxRequest(
  request: InventorySandboxRequest,
  options: {
    environment: Record<string, string | undefined>;
    timeoutMs?: number;
    fetcher?: InventorySandboxFetch;
  },
): Promise<InventoryJsonValue> {
  const gate = evaluateInventorySandboxRuntimeGate(request.supplierId, options.environment);
  if (gate.status !== "authorized") {
    throw new InventorySandboxTransportError(request.supplierId, gate.status);
  }
  validateRequest(request);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new InventorySandboxTransportError(request.supplierId, "invalid_timeout");
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
    const body = await readBoundedBody(request.supplierId, response);
    return parseInventorySupplierResponse({
      supplierId: request.supplierId,
      status: response.status,
      contentType: response.headers.get("content-type"),
      body,
    });
  } catch (error) {
    if (error instanceof InventorySupplierResponseError
      || error instanceof InventorySandboxTransportError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new InventorySandboxTransportError(request.supplierId, "timeout");
    }
    throw new InventorySandboxTransportError(request.supplierId, "network_error");
  } finally {
    clearTimeout(timeout);
  }
}
