import type { StandardPmsOperation, StandardPmsTransport, StandardPmsTransportRequest } from "../standard";

export type ShijiEndpoint = { path: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" };
export type ShijiConfig = {
  baseUrl: string;
  accessToken?: string;
  getAccessToken?: () => Promise<string>;
  endpoints: Record<StandardPmsOperation, ShijiEndpoint>;
  authorizationScheme?: "Bearer" | "Basic";
  timeoutMs?: number;
};
export type ShijiFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class ShijiTransportError extends Error {
  constructor(message: string, readonly status: number, readonly operation: StandardPmsOperation,
    readonly requestId: string, readonly responseCode?: string) {
    super(message); this.name = "ShijiTransportError";
  }
}

function validate(config: ShijiConfig) {
  const base = new URL(config.baseUrl);
  if (base.protocol !== "https:") throw new Error("Shiji base URL must use HTTPS");
  if (!config.accessToken?.trim() && !config.getAccessToken) throw new Error("Shiji token or token provider is required");
  for (const operation of ["availability", "create_reservation", "cancel_reservation"] as const) {
    if (!config.endpoints[operation]?.path) throw new Error(`Shiji endpoint mapping is required for ${operation}`);
  }
  return base;
}
function record(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Shiji payload must be an object");
  return payload as Record<string, unknown>;
}
function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Shiji cancellation requires a reservation ID");
  }
  return String(value);
}
function details(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const message = source.message ?? source.detail ?? source.error;
  const code = source.code ?? source.type;
  return { message: typeof message === "string" ? message : undefined,
    code: typeof code === "string" || typeof code === "number" ? String(code) : undefined };
}

export class ShijiHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;
  constructor(private readonly config: ShijiConfig, private readonly fetcher: ShijiFetch = fetch) {
    this.baseUrl = validate(config);
  }
  private async token() {
    const token = this.config.getAccessToken ? await this.config.getAccessToken() : this.config.accessToken;
    if (!token?.trim()) throw new Error("Shiji token provider returned an empty token");
    return token;
  }
  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "shiji-pms") throw new Error("Shiji transport only accepts shiji-pms requests");
    const payload = record(request.payload);
    const mapping = this.config.endpoints[request.operation];
    const id = request.operation === "cancel_reservation" ? reservationId(payload) : "";
    const path = mapping.path.replace("{propertyCode}", encodeURIComponent(request.propertyCode))
      .replace("{reservationId}", encodeURIComponent(id));
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) throw new Error("Shiji endpoint must remain on the configured origin");
    const headers: Record<string, string> = { accept: "application/json",
      authorization: `${this.config.authorizationScheme ?? "Bearer"} ${await this.token()}`,
      "x-iratepilot-request-id": request.requestId };
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
      const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
      if (!response.ok) {
        const error = details(body);
        throw new ShijiTransportError(error.message || `Shiji request failed with status ${response.status}`,
          response.status, request.operation, request.requestId, error.code);
      }
      return body;
    } catch (error) {
      if (error instanceof ShijiTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ShijiTransportError("Shiji request timed out", 504, request.operation, request.requestId);
      }
      throw new ShijiTransportError("Shiji request failed", 502, request.operation, request.requestId);
    } finally { clearTimeout(timeout); }
  }
}

