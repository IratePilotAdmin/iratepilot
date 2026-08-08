import type { StandardPmsOperation, StandardPmsTransport, StandardPmsTransportRequest } from "../standard";

export type HotelogixEndpoint = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export type HotelogixConfig = {
  baseUrl: string;
  apiKey?: string;
  getApiKey?: () => Promise<string>;
  endpoints: Record<StandardPmsOperation, HotelogixEndpoint>;
  apiKeyHeader?: string;
  apiKeyScheme?: string;
  timeoutMs?: number;
};

export type HotelogixFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class HotelogixTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "HotelogixTransportError";
  }
}

function validateConfig(config: HotelogixConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Hotelogix base URL must use HTTPS");
  if (!config.apiKey?.trim() && !config.getApiKey) {
    throw new Error("Hotelogix API key or API key provider is required");
  }
  for (const operation of ["availability", "create_reservation", "cancel_reservation"] as const) {
    if (!config.endpoints[operation]?.path) {
      throw new Error(`Hotelogix endpoint mapping is required for ${operation}`);
    }
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Hotelogix payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.bookingId ?? payload.confirmationNumber ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Hotelogix cancellation requires a reservation ID");
  }
  return String(value);
}

function responseDetails(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const message = source.message ?? source.detail ?? source.error ?? source.errorMessage;
  const code = source.code ?? source.status ?? source.errorCode;
  return {
    message: typeof message === "string" ? message : undefined,
    code: typeof code === "string" || typeof code === "number" ? String(code) : undefined,
  };
}

export class HotelogixHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;

  constructor(
    private readonly config: HotelogixConfig,
    private readonly fetcher: HotelogixFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
  }

  private async apiKey() {
    const key = this.config.getApiKey ? await this.config.getApiKey() : this.config.apiKey;
    if (!key?.trim()) throw new Error("Hotelogix API key provider returned an empty key");
    return key;
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "hotelogix") {
      throw new Error("Hotelogix transport only accepts hotelogix requests");
    }
    const payload = payloadRecord(request.payload);
    const mapping = this.config.endpoints[request.operation];
    const id = request.operation === "cancel_reservation" ? reservationId(payload) : "";
    const path = mapping.path
      .replace("{propertyCode}", encodeURIComponent(request.propertyCode))
      .replace("{reservationId}", encodeURIComponent(id));
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Hotelogix endpoint must remain on the configured origin");
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      "x-iratepilot-request-id": request.requestId,
    };
    const apiKeyHeader = this.config.apiKeyHeader ?? "x-api-key";
    const apiKeyScheme = this.config.apiKeyScheme ?? "";
    headers[apiKeyHeader] = `${apiKeyScheme} ${await this.apiKey()}`.trim();

    const init: RequestInit = { method: mapping.method, headers };
    if (mapping.method === "GET") {
      Object.entries({ propertyCode: request.propertyCode, ...payload }).forEach(([key, value]) => {
        if (value !== undefined && value !== null) endpoint.searchParams.append(key, String(value));
      });
    } else {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify({ propertyCode: request.propertyCode, ...payload });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15_000);
    init.signal = controller.signal;
    try {
      const response = await this.fetcher(endpoint, init);
      const responsePayload = response.status === 204
        ? undefined
        : await response.json().catch(() => undefined);
      if (!response.ok) {
        const details = responseDetails(responsePayload);
        throw new HotelogixTransportError(
          details.message || `Hotelogix request failed with status ${response.status}`,
          response.status,
          request.operation,
          request.requestId,
          details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof HotelogixTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new HotelogixTransportError(
          "Hotelogix request timed out", 504, request.operation, request.requestId,
        );
      }
      throw new HotelogixTransportError(
        "Hotelogix request failed", 502, request.operation, request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
