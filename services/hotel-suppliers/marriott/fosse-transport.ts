import type { MarriottOperation, MarriottPmsTransport, MarriottTransportRequest } from "./contracts";

export type MarriottFosseEndpoint = { path: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" };
export type MarriottFosseConfig = {
  baseUrl: string;
  apiCredential?: string;
  getApiCredential?: () => Promise<string>;
  endpoints: Partial<Record<MarriottOperation, MarriottFosseEndpoint>>;
  credentialHeader?: string;
  credentialScheme?: string;
  timeoutMs?: number;
};
export type MarriottFosseFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class MarriottFosseTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: MarriottOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "MarriottFosseTransportError";
  }
}

function validateConfig(config: MarriottFosseConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Marriott FOSSE base URL must use HTTPS");
  if (!config.apiCredential?.trim() && !config.getApiCredential) {
    throw new Error("Marriott FOSSE API credential or credential provider is required");
  }
  for (const operation of ["availability", "create_reservation", "cancel_reservation"] as const) {
    if (!config.endpoints[operation]?.path) throw new Error(`Marriott FOSSE endpoint mapping is required for ${operation}`);
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Marriott FOSSE payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.confirmationNumber ?? payload.bookingId ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Marriott FOSSE cancellation requires a reservation ID");
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

export class MarriottFosseHttpTransport implements MarriottPmsTransport {
  private readonly baseUrl: URL;

  constructor(private readonly config: MarriottFosseConfig, private readonly fetcher: MarriottFosseFetch = fetch) {
    this.baseUrl = validateConfig(config);
  }

  private async credential() {
    const value = this.config.getApiCredential ? await this.config.getApiCredential() : this.config.apiCredential;
    if (!value?.trim()) throw new Error("Marriott FOSSE credential provider returned an empty value");
    return value;
  }

  async execute(request: MarriottTransportRequest): Promise<unknown> {
    if (request.provider !== "marriott-fosse") {
      throw new Error("Marriott FOSSE transport only accepts marriott-fosse requests");
    }
    const payload = payloadRecord(request.payload);
    const mapping = this.config.endpoints[request.operation];
    if (!mapping) throw new Error(`Marriott FOSSE endpoint mapping is required for ${request.operation}`);
    const id = ["get_reservation", "modify_reservation", "cancel_reservation"].includes(request.operation)
      ? reservationId(payload)
      : "";
    const path = mapping.path
      .replace("{propertyCode}", encodeURIComponent(request.propertyCode))
      .replace("{reservationId}", encodeURIComponent(id));
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Marriott FOSSE endpoint must remain on the configured origin");
    }

    const headers: Record<string, string> = { accept: "application/json", "x-iratepilot-request-id": request.requestId };
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
      const responsePayload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
      if (!response.ok) {
        const details = responseDetails(responsePayload);
        throw new MarriottFosseTransportError(
          details.message || `Marriott FOSSE request failed with status ${response.status}`,
          response.status, request.operation, request.requestId, details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof MarriottFosseTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new MarriottFosseTransportError("Marriott FOSSE request timed out", 504, request.operation, request.requestId);
      }
      throw new MarriottFosseTransportError("Marriott FOSSE request failed", 502, request.operation, request.requestId);
    } finally {
      clearTimeout(timeout);
    }
  }
}

