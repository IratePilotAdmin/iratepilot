import type {
  StandardPmsOperation,
  StandardPmsTransport,
  StandardPmsTransportRequest,
} from "../standard";

const defaultOperationPaths: Record<StandardPmsOperation, string> = {
  availability: "hotels/{hotelId}/availability",
  create_reservation: "reservations",
  cancel_reservation: "reservations/{reservationId}/cancel",
};

export type StayntouchConfig = {
  baseUrl?: string;
  accessToken?: string;
  getAccessToken?: () => Promise<string>;
  apiVersion?: string;
  timeoutMs?: number;
  operationPaths?: Partial<Record<StandardPmsOperation, string>>;
};

export type StayntouchFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class StayntouchTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "StayntouchTransportError";
  }
}

function validateConfig(config: StayntouchConfig) {
  const baseUrl = new URL(config.baseUrl ?? "https://api.stayntouch.com/connect/");
  if (baseUrl.protocol !== "https:") {
    throw new Error("Stayntouch base URL must use HTTPS");
  }
  if (!config.accessToken?.trim() && !config.getAccessToken) {
    throw new Error("Stayntouch access token or token provider is required");
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Stayntouch payload must be an object");
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
  const value = payload.reservationId ?? payload.reservation_id ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
    throw new Error("Stayntouch cancellation requires a reservation ID");
  }
  return String(value);
}

function responseMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    const message = source.message ?? source.error;
    if (typeof message === "string") return message;
    if (Array.isArray(source.type) && source.type.length > 0) {
      const first = source.type[0];
      if (first && typeof first === "object" && typeof (first as Record<string, unknown>).message === "string") {
        return (first as Record<string, unknown>).message as string;
      }
    }
  }
  return `Stayntouch request failed with status ${status}`;
}

function responseCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  if (typeof source.code === "string") return source.code;
  if (Array.isArray(source.type) && source.type.length > 0) {
    const first = source.type[0];
    if (first && typeof first === "object") {
      const code = (first as Record<string, unknown>).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

export class StayntouchHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: StayntouchConfig,
    private readonly fetcher: StayntouchFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private async accessToken() {
    const token = this.config.getAccessToken
      ? await this.config.getAccessToken()
      : this.config.accessToken;
    if (!token?.trim()) throw new Error("Stayntouch token provider returned an empty token");
    return token;
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "stayntouch") {
      throw new Error("Stayntouch transport only accepts stayntouch requests");
    }
    const payload = payloadRecord(request.payload);
    let path = this.config.operationPaths?.[request.operation]
      ?? defaultOperationPaths[request.operation];
    path = path.replace("{hotelId}", encodeURIComponent(request.propertyCode));
    if (request.operation === "cancel_reservation") {
      path = path.replace("{reservationId}", encodeURIComponent(reservationId(payload)));
    }
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Stayntouch operation path must remain on the configured origin");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const token = await this.accessToken();
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        "api-version": this.config.apiVersion ?? "2.0",
        "x-iratepilot-request-id": request.requestId,
      };
      let init: RequestInit;

      if (request.operation === "availability") {
        appendQuery(endpoint.searchParams, payload);
        init = { method: "GET", headers, signal: controller.signal };
      } else if (request.operation === "create_reservation") {
        headers["content-type"] = "application/json";
        init = {
          method: "POST",
          headers,
          body: JSON.stringify({ hotel_id: Number(request.propertyCode), ...payload }),
          signal: controller.signal,
        };
      } else {
        headers["content-type"] = "application/json";
        const body = Object.fromEntries(
          Object.entries(payload).filter(([key]) => !["reservationId", "reservation_id", "id"].includes(key)),
        );
        init = { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal };
      }

      const response = await this.fetcher(endpoint, init);
      const responsePayload = response.status === 204
        ? undefined
        : await response.json().catch(() => undefined);
      if (!response.ok) {
        throw new StayntouchTransportError(
          responseMessage(responsePayload, response.status),
          response.status,
          request.operation,
          request.requestId,
          responseCode(responsePayload),
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof StayntouchTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new StayntouchTransportError(
          "Stayntouch request timed out",
          504,
          request.operation,
          request.requestId,
        );
      }
      throw new StayntouchTransportError(
        "Stayntouch request failed",
        502,
        request.operation,
        request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
