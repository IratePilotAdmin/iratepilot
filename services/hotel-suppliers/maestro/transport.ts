import type {
  StandardPmsOperation,
  StandardPmsTransport,
  StandardPmsTransportRequest,
} from "../standard";

export type MaestroEndpoint = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export type MaestroConfig = {
  baseUrl: string;
  accessToken?: string;
  getAccessToken?: () => Promise<string>;
  endpoints: Record<StandardPmsOperation, MaestroEndpoint>;
  authorizationHeader?: string;
  authorizationScheme?: string;
  timeoutMs?: number;
};

export type MaestroFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class MaestroTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "MaestroTransportError";
  }
}

function validateConfig(config: MaestroConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Maestro base URL must use HTTPS");
  if (!config.accessToken?.trim() && !config.getAccessToken) {
    throw new Error("Maestro access token or token provider is required");
  }
  for (const operation of ["availability", "create_reservation", "cancel_reservation"] as const) {
    if (!config.endpoints[operation]?.path) {
      throw new Error(`Maestro endpoint mapping is required for ${operation}`);
    }
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Maestro payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.confirmationNumber ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Maestro cancellation requires a reservation ID");
  }
  return String(value);
}

function responseDetails(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const message = source.message ?? source.error ?? source.errorMessage;
  const code = source.code ?? source.errorCode;
  return {
    message: typeof message === "string" ? message : undefined,
    code: typeof code === "string" || typeof code === "number" ? String(code) : undefined,
  };
}

export class MaestroHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: MaestroConfig,
    private readonly fetcher: MaestroFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private async accessToken() {
    const value = this.config.getAccessToken
      ? await this.config.getAccessToken()
      : this.config.accessToken;
    if (!value?.trim()) throw new Error("Maestro token provider returned an empty token");
    return value;
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "maestro-pms") {
      throw new Error("Maestro transport only accepts maestro-pms requests");
    }
    const payload = payloadRecord(request.payload);
    const mapping = this.config.endpoints[request.operation];
    const id = request.operation === "cancel_reservation" ? reservationId(payload) : "";
    const path = mapping.path
      .replace("{propertyCode}", encodeURIComponent(request.propertyCode))
      .replace("{reservationId}", encodeURIComponent(id));
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Maestro endpoint must remain on the configured origin");
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
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    init.signal = controller.signal;
    try {
      const response = await this.fetcher(endpoint, init);
      const responsePayload = response.status === 204
        ? undefined
        : await response.json().catch(() => undefined);
      if (!response.ok) {
        const details = responseDetails(responsePayload);
        throw new MaestroTransportError(
          details.message || `Maestro request failed with status ${response.status}`,
          response.status,
          request.operation,
          request.requestId,
          details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof MaestroTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new MaestroTransportError("Maestro request timed out", 504, request.operation, request.requestId);
      }
      throw new MaestroTransportError("Maestro request failed", 502, request.operation, request.requestId);
    } finally {
      clearTimeout(timeout);
    }
  }
}
