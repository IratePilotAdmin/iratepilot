import type {
  MewsOperation,
  MewsTransport,
  MewsTransportRequest,
} from "./contracts";

const defaultOperationPaths: Record<MewsOperation, string> = {
  availability: "/api/connector/v1/services/getAvailability",
  create_reservation: "/api/connector/v1/reservations/add",
  cancel_reservation: "/api/connector/v1/reservations/cancel",
};

export type MewsConnectorConfig = {
  baseUrl: string;
  clientToken: string;
  accessToken: string;
  client: string;
  timeoutMs?: number;
  operationPaths?: Partial<Record<MewsOperation, string>>;
};

export type MewsFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class MewsTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: MewsOperation,
    readonly requestId: string,
    readonly responseCode?: string,
  ) {
    super(message);
    this.name = "MewsTransportError";
  }
}

function validateConfig(config: MewsConnectorConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") {
    throw new Error("Mews base URL must use HTTPS");
  }
  if (!config.clientToken.trim() || !config.accessToken.trim() || !config.client.trim()) {
    throw new Error("Mews client token, access token, and client name are required");
  }
  return baseUrl;
}

function responseMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    if (typeof source.Message === "string") return source.Message;
    if (typeof source.message === "string") return source.message;
  }
  return `Mews request failed with status ${status}`;
}

function responseCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  const code = source.Code ?? source.code;
  return typeof code === "string" ? code : undefined;
}

export class MewsHttpTransport implements MewsTransport {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: MewsConnectorConfig,
    private readonly fetcher: MewsFetch = fetch,
  ) {
    this.baseUrl = validateConfig(config);
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async execute(request: MewsTransportRequest): Promise<unknown> {
    const path = this.config.operationPaths?.[request.operation]
      ?? defaultOperationPaths[request.operation];
    const endpoint = new URL(path, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Mews operation path must remain on the configured origin");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-iratepilot-request-id": request.requestId,
        },
        body: JSON.stringify({
          ClientToken: this.config.clientToken,
          AccessToken: this.config.accessToken,
          Client: this.config.client,
          ...(request.payload && typeof request.payload === "object"
            ? request.payload as Record<string, unknown>
            : { Payload: request.payload }),
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => undefined);
      if (!response.ok) {
        throw new MewsTransportError(
          responseMessage(payload, response.status),
          response.status,
          request.operation,
          request.requestId,
          responseCode(payload),
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof MewsTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new MewsTransportError(
          "Mews request timed out",
          504,
          request.operation,
          request.requestId,
        );
      }
      throw new MewsTransportError(
        "Mews request failed",
        502,
        request.operation,
        request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

