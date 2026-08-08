import type {
  ApaleoOperation,
  ApaleoTransport,
  ApaleoTransportRequest,
} from "./contracts";

const defaultOperationPaths: Record<ApaleoOperation, string> = {
  availability: "/booking/v1/offers",
  create_reservation: "/booking/v1/bookings",
  cancel_reservation: "/booking/v1/reservation-actions/{id}/cancel",
};

export type ApaleoConfig = {
  baseUrl?: string;
  accessToken?: string;
  getAccessToken?: () => Promise<string>;
  timeoutMs?: number;
  operationPaths?: Partial<Record<ApaleoOperation, string>>;
};

export type ApaleoFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class ApaleoTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: ApaleoOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "ApaleoTransportError";
  }
}

function validateConfig(config: ApaleoConfig) {
  const baseUrl = new URL(config.baseUrl ?? "https://api.apaleo.com");
  if (baseUrl.protocol !== "https:") {
    throw new Error("Apaleo base URL must use HTTPS");
  }
  if (!config.accessToken?.trim() && !config.getAccessToken) {
    throw new Error("Apaleo access token or token provider is required");
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Apaleo payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function appendQuery(searchParams: URLSearchParams, payload: Record<string, unknown>) {
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, String(item)));
    } else {
      searchParams.append(key, String(value));
    }
  });
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.reservationID ?? payload.id;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Apaleo cancellation requires a reservation ID");
  }
  return value;
}

function responseMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    const message = source.message ?? source.title ?? source.detail;
    if (typeof message === "string") return message;
    if (Array.isArray(source.messages) && source.messages.length > 0) {
      const first = source.messages[0];
      if (first && typeof first === "object" && typeof (first as Record<string, unknown>).message === "string") {
        return (first as Record<string, unknown>).message as string;
      }
    }
  }
  return `Apaleo request failed with status ${status}`;
}

function responseCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  const code = source.code ?? source.type;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

export class ApaleoHttpTransport implements ApaleoTransport {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ApaleoConfig,
    private readonly fetcher: ApaleoFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private async accessToken() {
    const token = this.config.getAccessToken
      ? await this.config.getAccessToken()
      : this.config.accessToken;
    if (!token?.trim()) throw new Error("Apaleo token provider returned an empty token");
    return token;
  }

  async execute(request: ApaleoTransportRequest): Promise<unknown> {
    const payload = payloadRecord(request.payload);
    let path = this.config.operationPaths?.[request.operation]
      ?? defaultOperationPaths[request.operation];
    if (request.operation === "cancel_reservation") {
      path = path.replace("{id}", encodeURIComponent(reservationId(payload)));
    }
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Apaleo operation path must remain on the configured origin");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const token = await this.accessToken();
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        "x-iratepilot-request-id": request.requestId,
      };
      let init: RequestInit;

      if (request.operation === "availability") {
        appendQuery(endpoint.searchParams, {
          propertyId: request.propertyCode,
          channelCode: "Ibe",
          ...payload,
        });
        init = { method: "GET", headers, signal: controller.signal };
      } else if (request.operation === "create_reservation") {
        headers["content-type"] = "application/json";
        headers["idempotency-key"] = request.requestId;
        init = {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        };
      } else {
        init = { method: "PUT", headers, signal: controller.signal };
      }

      const response = await this.fetcher(endpoint, init);
      const responsePayload = response.status === 204
        ? undefined
        : await response.json().catch(() => undefined);
      if (!response.ok) {
        throw new ApaleoTransportError(
          responseMessage(responsePayload, response.status),
          response.status,
          request.operation,
          request.requestId,
          responseCode(responsePayload),
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof ApaleoTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApaleoTransportError(
          "Apaleo request timed out",
          504,
          request.operation,
          request.requestId,
        );
      }
      throw new ApaleoTransportError(
        "Apaleo request failed",
        502,
        request.operation,
        request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
