import type { StandardPmsOperation, StandardPmsTransport, StandardPmsTransportRequest } from "../standard";

export type InforHmsEndpoint = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export type InforHmsConfig = {
  baseUrl: string;
  accessToken?: string;
  getAccessToken?: () => Promise<string>;
  endpoints: Record<StandardPmsOperation, InforHmsEndpoint>;
  tenantId?: string;
  tenantHeader?: string;
  timeoutMs?: number;
};

export type InforHmsFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class InforHmsTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "InforHmsTransportError";
  }
}

function validateConfig(config: InforHmsConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Infor HMS base URL must use HTTPS");
  if (!config.accessToken?.trim() && !config.getAccessToken) {
    throw new Error("Infor HMS access token or token provider is required");
  }
  for (const operation of ["availability", "create_reservation", "cancel_reservation"] as const) {
    if (!config.endpoints[operation]?.path) {
      throw new Error(`Infor HMS endpoint mapping is required for ${operation}`);
    }
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Infor HMS payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.confirmationNumber ?? payload.bookingId ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Infor HMS cancellation requires a reservation ID");
  }
  return String(value);
}

function responseDetails(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const message = source.message ?? source.detail ?? source.error ?? source.errorMessage;
  const code = source.code ?? source.errorCode ?? source.status;
  return {
    message: typeof message === "string" ? message : undefined,
    code: typeof code === "string" || typeof code === "number" ? String(code) : undefined,
  };
}

export class InforHmsHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;

  constructor(
    private readonly config: InforHmsConfig,
    private readonly fetcher: InforHmsFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
  }

  private async accessToken() {
    const token = this.config.getAccessToken ? await this.config.getAccessToken() : this.config.accessToken;
    if (!token?.trim()) throw new Error("Infor HMS token provider returned an empty token");
    return token;
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "infor-hms") {
      throw new Error("Infor HMS transport only accepts infor-hms requests");
    }
    const payload = payloadRecord(request.payload);
    const mapping = this.config.endpoints[request.operation];
    const id = request.operation === "cancel_reservation" ? reservationId(payload) : "";
    const path = mapping.path
      .replace("{propertyCode}", encodeURIComponent(request.propertyCode))
      .replace("{reservationId}", encodeURIComponent(id))
      .replace("{tenantId}", encodeURIComponent(this.config.tenantId ?? ""));
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Infor HMS endpoint must remain on the configured origin");
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${await this.accessToken()}`,
      "x-iratepilot-request-id": request.requestId,
    };
    if (this.config.tenantId?.trim()) {
      headers[this.config.tenantHeader ?? "x-infor-tenant"] = this.config.tenantId;
    }

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
        throw new InforHmsTransportError(
          details.message || `Infor HMS request failed with status ${response.status}`,
          response.status,
          request.operation,
          request.requestId,
          details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof InforHmsTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new InforHmsTransportError(
          "Infor HMS request timed out", 504, request.operation, request.requestId,
        );
      }
      throw new InforHmsTransportError(
        "Infor HMS request failed", 502, request.operation, request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
