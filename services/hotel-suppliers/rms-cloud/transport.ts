import type {
  StandardPmsOperation,
  StandardPmsTransport,
  StandardPmsTransportRequest,
} from "../standard";

const defaultOperationPaths: Record<StandardPmsOperation, string> = {
  availability: "availableFacilities",
  create_reservation: "reservations?ignoreMandatoryFieldWarnings=false",
  cancel_reservation: "reservations/{reservationId}/status",
};

export type RmsCloudConfig = {
  baseUrl: string;
  authToken?: string;
  getAuthToken?: () => Promise<string>;
  timeoutMs?: number;
  operationPaths?: Partial<Record<StandardPmsOperation, string>>;
};

export type RmsCloudFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class RmsCloudTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "RmsCloudTransportError";
  }
}

function validateConfig(config: RmsCloudConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("RMS Cloud base URL must use HTTPS");
  if (!config.authToken?.trim() && !config.getAuthToken) {
    throw new Error("RMS Cloud auth token or token provider is required");
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("RMS Cloud payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload.reservationId ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("RMS Cloud cancellation requires a reservation ID");
  }
  return String(value);
}

function responseDetails(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = Array.isArray(payload) ? payload[0] : payload;
  if (!source || typeof source !== "object") return {};
  const value = source as Record<string, unknown>;
  const message = value.message ?? value.error ?? value.description;
  const code = value.code ?? value.errorCode;
  return {
    message: typeof message === "string" ? message : undefined,
    code: typeof code === "string" || typeof code === "number" ? String(code) : undefined,
  };
}

export class RmsCloudHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: RmsCloudConfig,
    private readonly fetcher: RmsCloudFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private async authToken() {
    const value = this.config.getAuthToken
      ? await this.config.getAuthToken()
      : this.config.authToken;
    if (!value?.trim()) throw new Error("RMS Cloud token provider returned an empty token");
    return value;
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "rms-cloud") {
      throw new Error("RMS Cloud transport only accepts rms-cloud requests");
    }
    const payload = payloadRecord(request.payload);
    let path = this.config.operationPaths?.[request.operation]
      ?? defaultOperationPaths[request.operation];
    if (request.operation === "cancel_reservation") {
      path = path.replace("{reservationId}", encodeURIComponent(reservationId(payload)));
    }
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("RMS Cloud operation path must remain on the configured origin");
    }

    let body: Record<string, unknown>;
    if (request.operation === "availability") {
      body = { propertyId: Number(request.propertyCode), ...payload };
    } else if (request.operation === "create_reservation") {
      body = { propertyId: Number(request.propertyCode), ...payload };
    } else {
      body = {
        status: "cancelled",
        ...(payload.reasonId !== undefined ? { reasonid: payload.reasonId } : {}),
        ...(payload.reason ? { cancellationNote: payload.reason } : {}),
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(endpoint, {
        method: request.operation === "cancel_reservation" ? "PUT" : "POST",
        headers: {
          authtoken: await this.authToken(),
          "content-type": "application/json",
          accept: "application/json",
          "x-iratepilot-request-id": request.requestId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const responsePayload = response.status === 204
        ? undefined
        : await response.json().catch(() => undefined);
      if (!response.ok) {
        const details = responseDetails(responsePayload);
        throw new RmsCloudTransportError(
          details.message || `RMS Cloud request failed with status ${response.status}`,
          response.status,
          request.operation,
          request.requestId,
          details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof RmsCloudTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new RmsCloudTransportError("RMS Cloud request timed out", 504, request.operation, request.requestId);
      }
      throw new RmsCloudTransportError("RMS Cloud request failed", 502, request.operation, request.requestId);
    } finally {
      clearTimeout(timeout);
    }
  }
}
