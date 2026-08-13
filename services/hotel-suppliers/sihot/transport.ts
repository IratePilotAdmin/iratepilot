import type {
  StandardPmsOperation,
  StandardPmsTransport,
  StandardPmsTransportRequest,
} from "../standard";

const defaultOperationPaths: Record<StandardPmsOperation, string> = {
  availability: "S_AVAILABILITY_SEARCH",
  create_reservation: "S_RESERVATION_CREATE",
  cancel_reservation: "S_RESERVATION_CANCEL_V002",
};

export type SihotConfig = {
  baseUrl: string;
  securityId?: string;
  getSecurityId?: () => Promise<string>;
  timeoutMs?: number;
  operationPaths?: Partial<Record<StandardPmsOperation, string>>;
};

export type SihotFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class SihotTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "SihotTransportError";
  }
}

function validateConfig(config: SihotConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("SIHOT base URL must use HTTPS");
  if (!config.securityId?.trim() && !config.getSecurityId) {
    throw new Error("SIHOT SecurityID or SecurityID provider is required");
  }
  return baseUrl;
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("SIHOT payload must be an object");
  }
  return payload as Record<string, unknown>;
}

function reservationId(payload: Record<string, unknown>) {
  const value = payload["RESERVATION-OBJID"] ?? payload.reservationId ?? payload.id;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("SIHOT cancellation requires a reservation object ID");
  }
  return String(value);
}

function resultDetails(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const result = source.Result;
  if (!result || typeof result !== "object") return {};
  const value = result as Record<string, unknown>;
  return {
    success: value.Success,
    message: typeof value.ErrorMsg === "string" ? value.ErrorMsg : undefined,
    code: typeof value.ErrorCode === "string" ? value.ErrorCode : undefined,
  };
}

export class SihotHttpTransport implements StandardPmsTransport {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: SihotConfig,
    private readonly fetcher: SihotFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private async securityId() {
    const value = this.config.getSecurityId
      ? await this.config.getSecurityId()
      : this.config.securityId;
    if (!value?.trim()) throw new Error("SIHOT SecurityID provider returned an empty token");
    return value;
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "sihot") {
      throw new Error("SIHOT transport only accepts sihot requests");
    }
    const payload = payloadRecord(request.payload);
    const path = this.config.operationPaths?.[request.operation]
      ?? defaultOperationPaths[request.operation];
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("SIHOT operation path must remain on the configured origin");
    }

    const securityId = await this.securityId();
    const body: Record<string, unknown> = {
      TransactionID: request.requestId,
      Authentication: { SecurityID: securityId },
    };
    if (request.operation === "availability") {
      body["AVAILABILITY-SEARCH"] = { hotel: request.propertyCode, ...payload };
    } else if (request.operation === "create_reservation") {
      body.RESERVATION = { hotel: request.propertyCode, ...payload };
    } else {
      body.RESERVATION = {
        "RESERVATION-OBJID": reservationId(payload),
        ...(payload.reason ? { reasonforcancellation: payload.reason } : {}),
        ...(payload.note ? { note: payload.note } : {}),
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
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
      const details = resultDetails(responsePayload);
      if (!response.ok || details.success === false) {
        throw new SihotTransportError(
          details.message || `SIHOT request failed with status ${response.status}`,
          response.ok ? 422 : response.status,
          request.operation,
          request.requestId,
          details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof SihotTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SihotTransportError("SIHOT request timed out", 504, request.operation, request.requestId);
      }
      throw new SihotTransportError("SIHOT request failed", 502, request.operation, request.requestId);
    } finally {
      clearTimeout(timeout);
    }
  }

  async executeService(
    path: string,
    requestId: string,
    envelopeKey: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("SIHOT service path must remain on the configured origin");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-iratepilot-request-id": requestId,
        },
        body: JSON.stringify({
          TransactionID: requestId,
          Authentication: { SecurityID: await this.securityId() },
          [envelopeKey]: payload,
        }),
        signal: controller.signal,
      });
      const responsePayload = response.status === 204
        ? undefined
        : await response.json().catch(() => undefined);
      const details = resultDetails(responsePayload);
      if (!response.ok || details.success === false) {
        throw new SihotTransportError(
          details.message || `SIHOT request failed with status ${response.status}`,
          response.ok ? 422 : response.status,
          "availability",
          requestId,
          details.code,
        );
      }
      return responsePayload;
    } catch (error) {
      if (error instanceof SihotTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SihotTransportError("SIHOT request timed out", 504, "availability", requestId);
      }
      throw new SihotTransportError("SIHOT request failed", 502, "availability", requestId);
    } finally {
      clearTimeout(timeout);
    }
  }
}
