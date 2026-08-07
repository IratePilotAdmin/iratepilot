import type { OracleOperaConfig } from "./config";

type Fetch = typeof fetch;

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

export type OracleOperaRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: BodyInit | Record<string, unknown>;
  headers?: HeadersInit;
  hotelId?: string;
};

export class OracleOperaClientError extends Error {
  constructor(
    message: string,
    readonly code: "authentication_failed" | "request_failed" | "timeout",
    readonly status?: number,
  ) {
    super(message);
    this.name = "OracleOperaClientError";
  }
}

export class OracleOperaClient {
  private token?: CachedToken;
  private tokenRefresh?: Promise<string>;

  constructor(
    private readonly config: OracleOperaConfig,
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async request<T>(path: string, options: OracleOperaRequestOptions = {}): Promise<T> {
    const token = await this.accessToken();
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("x-app-key", this.config.appKey);

    if (options.hotelId) {
      headers.set("x-hotelid", options.hotelId);
    }

    let body = options.body;
    if (body && this.isJsonBody(body)) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }

    return this.fetchWithTimeout(
      this.resolvePath(path),
      { ...options, headers, body, hotelId: undefined } as RequestInit,
      "request_failed",
      async (response) => {
        if (!response.ok) {
          throw new OracleOperaClientError(
            "Oracle OPERA request failed",
            "request_failed",
            response.status,
          );
        }

        if (response.status === 204) return undefined as T;
        try {
          return await response.json() as T;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") throw error;
          throw new OracleOperaClientError(
            "Oracle OPERA response was invalid",
            "request_failed",
            response.status,
          );
        }
      },
    );
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > this.now() + 30_000) {
      return this.token.value;
    }

    if (!this.tokenRefresh) {
      this.tokenRefresh = this.refreshAccessToken().finally(() => {
        this.tokenRefresh = undefined;
      });
    }

    return this.tokenRefresh;
  }

  private async refreshAccessToken() {

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");
    return this.fetchWithTimeout(
      this.config.tokenUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "x-app-key": this.config.appKey,
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
      },
      "authentication_failed",
      async (response) => {
        if (!response.ok) {
          throw new OracleOperaClientError(
            "Oracle OPERA authentication failed",
            "authentication_failed",
            response.status,
          );
        }

        let payload: TokenResponse;
        try {
          payload = await response.json() as TokenResponse;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") throw error;
          throw new OracleOperaClientError(
            "Oracle OPERA authentication response was invalid",
            "authentication_failed",
            response.status,
          );
        }

        if (!payload.access_token) {
          throw new OracleOperaClientError(
            "Oracle OPERA authentication response was invalid",
            "authentication_failed",
            response.status,
          );
        }

        this.token = {
          value: payload.access_token,
          expiresAt: this.now() + Math.max(payload.expires_in ?? 300, 1) * 1_000,
        };
        return this.token.value;
      },
    );
  }

  private async fetchWithTimeout<T>(
    url: string,
    init: RequestInit,
    failureCode: "authentication_failed" | "request_failed",
    consume: (response: Response) => Promise<T>,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

    try {
      const response = await this.fetcher(url, { ...init, signal });
      return await consume(response);
    } catch (error) {
      if (error instanceof OracleOperaClientError) throw error;
      if (controller.signal.aborted) {
        throw new OracleOperaClientError("Oracle OPERA request timed out", "timeout");
      }
      throw new OracleOperaClientError("Oracle OPERA request could not be completed", failureCode);
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolvePath(path: string) {
    if (!path.startsWith("/")) {
      throw new OracleOperaClientError(
        "Oracle OPERA request path must start with a slash",
        "request_failed",
      );
    }
    return `${this.config.baseUrl}${path}`;
  }

  private isJsonBody(body: BodyInit | Record<string, unknown>): body is Record<string, unknown> {
    return Object.getPrototypeOf(body) === Object.prototype;
  }
}
