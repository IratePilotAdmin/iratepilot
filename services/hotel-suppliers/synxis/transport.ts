export type SynxisAriOperation = "rate_push" | "inventory_push";
export type SynxisSoapVersion = "1.1" | "1.2";
export type SynxisAuthenticationProfile = "htng-1.1" | "ws-security";
export type SynxisEnvironment = "certification" | "production";
export type SynxisTrafficMode = "certification" | "production_smoke" | "live";
export type SynxisTrafficAuthorizer = (mode: SynxisTrafficMode) => Promise<void>;
export type SynxisFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type SynxisCredentials = {
  username: string;
  password: string;
};

export type SynxisTransportConfig = {
  baseUrl: string;
  endpointPath: string;
  soapVersion: SynxisSoapVersion;
  authenticationProfile: SynxisAuthenticationProfile;
  soapActions: Record<SynxisAriOperation, string>;
  credentials?: SynxisCredentials;
  getCredentials?: () => Promise<SynxisCredentials>;
  environment: SynxisEnvironment;
  trafficMode: SynxisTrafficMode;
  authorizeTraffic: SynxisTrafficAuthorizer;
  timeoutMs?: number;
};

export type SynxisTransportRequest = {
  operation: SynxisAriOperation;
  requestId: string;
  body: string;
};

export class SynxisTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: SynxisAriOperation,
    readonly requestId: string,
  ) {
    super(message);
    this.name = "SynxisTransportError";
  }
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function validate(config: SynxisTransportConfig) {
  const baseUrl = new URL(config.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("SynXis base URL must use HTTPS");
  if (!config.endpointPath.trim()) throw new Error("SynXis endpoint path is required");
  if (!config.credentials && !config.getCredentials) {
    throw new Error("SynXis credentials or credential provider is required");
  }
  if (typeof config.authorizeTraffic !== "function") {
    throw new Error("SynXis persisted traffic authorizer is required");
  }
  if (config.environment === "certification" && config.trafficMode !== "certification") {
    throw new Error("SynXis certification endpoints require certification traffic mode");
  }
  if (config.environment === "production" && config.trafficMode === "certification") {
    throw new Error("SynXis production endpoints require production smoke or live traffic mode");
  }
  for (const operation of ["rate_push", "inventory_push"] as const) {
    if (!config.soapActions[operation]?.trim()) {
      throw new Error(`SynXis SOAP action is required for ${operation}`);
    }
  }
  if (config.authenticationProfile === "ws-security" && config.soapVersion !== "1.2") {
    throw new Error("SynXis WS-Security ARI requires SOAP 1.2");
  }
  const timeout = config.timeoutMs ?? 20_000;
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new Error("SynXis timeout must be between 1000 and 120000 milliseconds");
  }
  return baseUrl;
}

function expectedRoot(operation: SynxisAriOperation) {
  return operation === "rate_push"
    ? "OTA_HotelRateAmountNotifRQ"
    : "OTA_HotelInvCountNotifRQ";
}

function assertBody(request: SynxisTransportRequest) {
  const root = expectedRoot(request.operation);
  if (!request.requestId.trim()) throw new Error("SynXis request ID is required");
  if (!request.body.includes(`<${root}`) || !request.body.includes(`</${root}>`)) {
    throw new Error(`SynXis ${request.operation} body must contain ${root}`);
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(request.body)) {
    throw new Error("SynXis request body cannot contain XML entities or a doctype");
  }
}

function htng11Envelope(body: string, credentials: SynxisCredentials) {
  return [
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    "<soap:Header>",
    '<HTNGHeader xmlns="http://htng.org/1.1/Header/">',
    "<From><systemId/><Credential>",
    `<userName>${xml(credentials.username)}</userName>`,
    `<password>${xml(credentials.password)}</password>`,
    "</Credential></From><To><systemId/></To>",
    "</HTNGHeader>",
    "</soap:Header>",
    `<soap:Body>${body}</soap:Body>`,
    "</soap:Envelope>",
  ].join("");
}

function wsSecurityEnvelope(
  body: string,
  credentials: SynxisCredentials,
  action: string,
  endpoint: URL,
  requestId: string,
) {
  return [
    '<soap2:Envelope xmlns:soap2="http://www.w3.org/2003/05/soap-envelope"',
    ' xmlns:wsa="http://www.w3.org/2005/08/addressing"',
    ' xmlns:wss="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">',
    "<soap2:Header>",
    `<wsa:Action>${xml(action)}</wsa:Action>`,
    "<wsa:ReplyTo><wsa:Address>http://www.w3.org/2005/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>",
    '<wss:Security soap2:mustUnderstand="true"><wss:UsernameToken>',
    `<wss:Username>${xml(credentials.username)}</wss:Username>`,
    `<wss:Password>${xml(credentials.password)}</wss:Password>`,
    "</wss:UsernameToken></wss:Security>",
    `<wsa:MessageID>urn:uuid:${xml(requestId)}</wsa:MessageID>`,
    `<wsa:To>${xml(endpoint.toString())}</wsa:To>`,
    "</soap2:Header>",
    `<soap2:Body>${body}</soap2:Body>`,
    "</soap2:Envelope>",
  ].join("");
}

export class SynxisSoapTransport {
  private readonly baseUrl: URL;

  constructor(
    private readonly config: SynxisTransportConfig,
    private readonly fetcher: SynxisFetch = fetch,
  ) {
    this.baseUrl = validate(config);
  }

  private async credentials() {
    const credentials = this.config.getCredentials
      ? await this.config.getCredentials()
      : this.config.credentials;
    if (!credentials?.username.trim() || !credentials.password.trim()) {
      throw new Error("SynXis credential provider returned incomplete credentials");
    }
    return credentials;
  }

  async execute(request: SynxisTransportRequest): Promise<string> {
    assertBody(request);
    await this.config.authorizeTraffic(this.config.trafficMode);

    const endpoint = new URL(this.config.endpointPath, this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("SynXis endpoint must remain on the configured origin");
    }
    const action = this.config.soapActions[request.operation];
    const credentials = await this.credentials();
    const envelope = this.config.authenticationProfile === "ws-security"
      ? wsSecurityEnvelope(request.body, credentials, action, endpoint, request.requestId)
      : htng11Envelope(request.body, credentials);

    const headers: Record<string, string> = {
      accept: this.config.soapVersion === "1.2" ? "application/soap+xml" : "text/xml",
      "x-iratepilot-request-id": request.requestId,
    };
    if (this.config.soapVersion === "1.2") {
      headers["content-type"] = `application/soap+xml; charset=utf-8; action="${action}"`;
    } else {
      headers["content-type"] = "text/xml; charset=utf-8";
      headers.soapaction = action;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 20_000);
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers,
        body: envelope,
        signal: controller.signal,
      });
      const responseXml = await response.text();
      if (!response.ok || /<(?:\w+:)?Fault\b/i.test(responseXml)) {
        throw new SynxisTransportError(
          "SynXis SOAP request failed",
          response.ok ? 502 : response.status,
          request.operation,
          request.requestId,
        );
      }
      return responseXml;
    } catch (error) {
      if (error instanceof SynxisTransportError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SynxisTransportError(
          "SynXis request timed out", 504, request.operation, request.requestId,
        );
      }
      throw new SynxisTransportError(
        "SynXis request failed", 502, request.operation, request.requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
