import type { StandardPmsOperation, StandardPmsTransport, StandardPmsTransportRequest } from "../standard";

export type PlanetProtelEndpoint = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export type PlanetProtelConfig = {
  baseUrl: string;
  apiCredential?: string;
  getApiCredential?: () => Promise<string>;
  endpoints: Record<StandardPmsOperation, PlanetProtelEndpoint>;
  credentialHeader?: string;
  credentialScheme?: string;
  timeoutMs?: number;
};

export type PlanetProtelFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class PlanetProtelTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "PlanetProtelTransportError";
  }
}

function validateConfig(config: PlanetProtelConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Planet Protel base URL must use HTTPS");
  if (!config.apiCredential?.trim() && !config.getApiCredential) {
    throw new Error("Planet Protel API credential or credential provider is required");
  }
  for (const operation of ["availability", "create_reservation", "cancel_reservation"] as const) {
    if (!config.endpoints[operation]?.path) {
      throw new Error(`Planet Protel endpoint mapping is required for ${operation}`);
    }
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Planet Protel payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.confirmationNumber ?? payload.bookingId ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Planet Protel cancellation requires a reservation ID");
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

export class PlanetProtelHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;

  constructor(
    private readonly config: PlanetProtelConfig,
    private readonly fetcher: PlanetProtelFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
  }

  private async credential() {
    const value = this.config.getApiCredential
      ? await this.config.getApiCredential()
      : this.config.apiCredential;
    if (!value?.trim()) throw new Error("Planet Protel credential provider returned an empty value");
    return value;
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "planet-protel") {
      throw new Error("Planet Protel transport only accepts planet-protel requests");
    }
    const payload = payloadRecord(request.payload);
    const mapping = this.config.endpoints[request.operation];
    const id = request.operation === "cancel_reservation" ? reservationId(payload) : "";
    const path = mapping.path
      .replace("{propertyCode}", encodeURIComponent(request.propertyCode))
      .replace("{reservationId}", encodeURIComponent(id));
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Planet Protel endpoint must remain on the configured origin");
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      "x-iratepilot-request-id": request.requestId,
    };
    const header = this.config.credentialHeader ?? "authorization";
    const scheme = this.config.credentialScheme ?? "Bearer";
    headers[header] = `${scheme} ${await this.credential()}`.trim();

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
        throw new PlanetProtelTransportError(
          details.message || `Planet Protel request failed with status ${response.status}`,
          response.status,
          request.operation,
          request.requestId,
          details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof PlanetProtelTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PlanetProtelTransportError(
          "Planet Protel request timed out", 504, request.operation, request.requestId,
        );
      }
      throw new PlanetProtelTransportError(
        "Planet Protel request failed", 502, request.operation, request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
