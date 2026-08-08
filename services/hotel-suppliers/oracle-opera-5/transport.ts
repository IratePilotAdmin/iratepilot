import type { StandardPmsOperation, StandardPmsTransport, StandardPmsTransportRequest } from "../standard";

export type OracleOpera5Endpoint = { path: string; soapAction: string };
export type OracleOpera5SoapHeaders = Record<string, string>;
export type OracleOpera5Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type OracleOpera5Config = {
  baseUrl: string;
  endpoints: Record<StandardPmsOperation, OracleOpera5Endpoint>;
  getSoapHeaders: (request: StandardPmsTransportRequest) => Promise<OracleOpera5SoapHeaders>;
  buildEnvelope: (request: StandardPmsTransportRequest) => string;
  parseResponse?: (xml: string, request: StandardPmsTransportRequest) => unknown;
  timeoutMs?: number;
};

export class OracleOpera5TransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: StandardPmsOperation,
    readonly requestId: string,
  ) {
    super(message);
    this.name = "OracleOpera5TransportError";
  }
}

function validate(config: OracleOpera5Config) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("Oracle OPERA 5 base URL must use HTTPS");
  for (const operation of ["availability", "create_reservation", "cancel_reservation"] as const) {
    const endpoint = config.endpoints[operation];
    if (!endpoint?.path || !endpoint.soapAction) {
      throw new Error(`Oracle OPERA 5 endpoint and SOAP action are required for ${operation}`);
    }
  }
  return baseUrl;
}

function safeSoapHeaders(headers: OracleOpera5SoapHeaders) {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (["host", "content-length", "content-type", "soapaction"].includes(normalized)) {
      throw new Error(`Oracle OPERA 5 managed header cannot be overridden: ${name}`);
    }
    if (!value.trim()) throw new Error(`Oracle OPERA 5 SOAP header is empty: ${name}`);
    result[name] = value;
  }
  if (!Object.keys(result).length) throw new Error("Oracle OPERA 5 SOAP credentials are required");
  return result;
}

export class OracleOpera5Transport implements StandardPmsTransport {
  private readonly baseUrl: URL;

  constructor(
    private readonly config: OracleOpera5Config,
    private readonly fetcher: OracleOpera5Fetch = fetch,
  ) {
    this.baseUrl = validate(config);
  }

  async execute(request: StandardPmsTransportRequest): Promise<unknown> {
    if (request.providerId !== "oracle-opera-5") {
      throw new Error("Oracle OPERA 5 transport only accepts oracle-opera-5 requests");
    }
    const mapping = this.config.endpoints[request.operation];
    const endpoint = new URL(
      mapping.path.replace("{propertyCode}", encodeURIComponent(request.propertyCode)),
      this.baseUrl,
    );
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("Oracle OPERA 5 endpoint must remain on the configured origin");
    }
    const envelope = this.config.buildEnvelope(request);
    if (!envelope.trim() || !envelope.includes("Envelope")) {
      throw new Error("Oracle OPERA 5 envelope builder returned invalid SOAP XML");
    }
    const issuedHeaders = safeSoapHeaders(await this.config.getSoapHeaders(request));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 20_000);
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          ...issuedHeaders,
          "content-type": "text/xml; charset=utf-8",
          soapaction: mapping.soapAction,
          "x-iratepilot-request-id": request.requestId,
        },
        body: envelope,
        signal: controller.signal,
      });
      const xml = await response.text();
      if (!response.ok || /<(?:\w+:)?Fault\b/i.test(xml)) {
        throw new OracleOpera5TransportError(
          "Oracle OPERA 5 SOAP request failed", response.ok ? 502 : response.status,
          request.operation, request.requestId,
        );
      }
      return this.config.parseResponse ? this.config.parseResponse(xml, request) : xml;
    } catch (error) {
      if (error instanceof OracleOpera5TransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new OracleOpera5TransportError(
          "Oracle OPERA 5 request timed out", 504, request.operation, request.requestId,
        );
      }
      throw new OracleOpera5TransportError(
        "Oracle OPERA 5 request failed", 502, request.operation, request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
