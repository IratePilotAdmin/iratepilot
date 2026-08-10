import type { StandardPmsOperation, StandardPmsTransport, StandardPmsTransportRequest } from "../standard";

export type GuestlineEndpoint = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export type GuestlineConfig = {
  baseUrl: string;
  accessToken?: string;
  getAccessToken?: () => Promise<string>;
  endpoints: Record<StandardPmsOperation, GuestlineEndpoint>;
  authorizationHeader?: string;
  authorizationScheme?: string;
  timeoutMs?: number;
};

export type GuestlineFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class GuestlineTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "GuestlineTransportError";
  }
}

function validateConfig(config: GuestlineConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Guestline base URL must use HTTPS");
  if (!config.accessToken?.trim() && !config.getAccessToken) {
    throw new Error("Guestline access token or token provider is required");
  }
  for (const operation of ["availability", "create_reservation", "cancel_reservation"] as const) {
    if (!config.endpoints[operation]?.path) {
      throw new Error(`Guestline endpoint mapping is required for ${operation}`);
    }
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Guestline payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.confirmationNumber ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Guestline cancellation requires a reservation ID");
  }
  return String(value);
}

function responseDetails(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const message = source.message ?? source.detail ?? source.error ?? source.errorMessage;
  const code = source.code ?? source.type ?? source.errorCode;
  return {
    message: typeof message === "string" ? message : undefined,
    code: typeof code === "string" || typeof code === "number" ? String(code) : undefined,
  };
}

export class GuestlineHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;

  constructor(
    private readonly config: GuestlineConfig,
    private readonly fetcher: GuestlineFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
  }

  private async accessToken() {
    const token = this.config.getAccessToken
      ? await this.config.getAccessToken()
      : this.config.accessToken;
    if (!token?.trim()) throw new Error("Guestline token provider returned an empty token");
    return token;
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "guestline") {
      throw new Error("Guestline transport only accepts guestline requests");
    }
    const payload = payloadRecord(request.payload);
    const mapping = this.config.endpoints[request.operation];
    const id = request.operation === "cancel_reservation" ? reservationId(payload) : "";
    const path = mapping.path
      .replace("{propertyCode}", encodeURIComponent(request.propertyCode))
      .replace("{reservationId}", encodeURIComponent(id));
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Guestline endpoint must remain on the configured origin");
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      "x-iratepilot-request-id": request.requestId,
    };
    const authHeader = this.config.authorizationHeader ?? "authorization";
    const scheme = this.config.authorizationScheme ?? "Bearer";
    headers[authHeader] = `${scheme} ${await this.accessToken()}`.trim();

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
        throw new GuestlineTransportError(
          details.message || `Guestline request failed with status ${response.status}`,
          response.status,
          request.operation,
          request.requestId,
          details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof GuestlineTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new GuestlineTransportError("Guestline request timed out", 504, request.operation, request.requestId);
      }
      throw new GuestlineTransportError("Guestline request failed", 502, request.operation, request.requestId);
    } finally {
      clearTimeout(timeout);
    }
  }
}

