import type {
  CloudbedsOperation,
  CloudbedsTransport,
  CloudbedsTransportRequest,
} from "./contracts";

const defaultOperationPaths: Record<CloudbedsOperation, string> = {
  availability: "/api/v1.3/getAvailableRoomTypes",
  create_reservation: "/api/v1.3/postReservation",
  cancel_reservation: "/api/v1.3/putReservation",
};

export type CloudbedsConfig = {
  baseUrl?: string;
  apiKey: string;
  timeoutMs?: number;
  operationPaths?: Partial<Record<CloudbedsOperation, string>>;
};

export type CloudbedsFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class CloudbedsTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: CloudbedsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "CloudbedsTransportError";
  }
}

function validateConfig(config: CloudbedsConfig) {
  const baseUrl = new URL(config.baseUrl ?? "https://api.cloudbeds.com");
  if (baseUrl.protocol !== "https:") {
    throw new Error("Cloudbeds base URL must use HTTPS");
  }
  if (!config.apiKey.trim()) {
    throw new Error("Cloudbeds API key is required");
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Cloudbeds payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function appendValue(target: URLSearchParams | FormData, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => appendValue(target, key, item));
    return;
  }
  const serialized = typeof value === "object" ? JSON.stringify(value) : String(value);
  target.append(key, serialized);
}

function formBody(payload: unknown) {
  const form = new FormData();
  Object.entries(payloadRecord(payload)).forEach(([key, value]) => appendValue(form, key, value));
  return form;
}

function responseMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    const message = source.message ?? source.error;
    if (typeof message === "string") return message;
  }
  return `Cloudbeds request failed with status ${status}`;
}

function responseCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  const code = source.code ?? source.errorCode;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

export class CloudbedsHttpTransport implements CloudbedsTransport {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: CloudbedsConfig,
    private readonly fetcher: CloudbedsFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async execute(request: CloudbedsTransportRequest): Promise<unknown> {
    const path = this.config.operationPaths?.[request.operation]
      ?? defaultOperationPaths[request.operation];
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Cloudbeds operation path must remain on the configured origin");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = {
        authorization: `Bearer ${this.config.apiKey}`,
        "x-iratepilot-request-id": request.requestId,
      };
      let init: RequestInit;

      if (request.operation === "availability") {
        Object.entries(payloadRecord(request.payload))
          .forEach(([key, value]) => appendValue(endpoint.searchParams, key, value));
        init = { method: "GET", headers, signal: controller.signal };
      } else {
        const payload = payloadRecord(request.payload);
        const body = request.operation === "cancel_reservation"
          ? formBody({ ...payload, status: "canceled" })
          : formBody(payload);
        init = { method: "POST", headers, body, signal: controller.signal };
      }

      const response = await this.fetcher(endpoint, init);
      const payload = await response.json().catch(() => undefined);
      if (!response.ok) {
        throw new CloudbedsTransportError(
          responseMessage(payload, response.status),
          response.status,
          request.operation,
          request.requestId,
          responseCode(payload),
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof CloudbedsTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new CloudbedsTransportError(
          "Cloudbeds request timed out",
          504,
          request.operation,
          request.requestId,
        );
      }
      throw new CloudbedsTransportError(
        "Cloudbeds request failed",
        502,
        request.operation,
        request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
