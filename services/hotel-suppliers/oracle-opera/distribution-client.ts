import type { OracleOperaRequestOptions } from "./client";

type Fetch = typeof fetch;

export type OracleOperaDistributionConfig = {
  baseUrl: string;
  tokenUrl: string;
  username: string;
  password: string;
  appKey: string;
  channelCode: string;
  originatingApplication: string;
  timeoutMs: number;
};

type CachedToken = { value: string; expiresAt: number };

export class OracleOperaDistributionError extends Error {
  constructor(
    message: string,
    readonly code: "authentication_failed" | "request_failed" | "timeout",
    readonly status?: number,
  ) {
    super(message);
    this.name = "OracleOperaDistributionError";
  }
}

export class OracleOperaDistributionClient {
  private token?: CachedToken;
  private tokenRefresh?: Promise<string>;

  constructor(
    private readonly config: OracleOperaDistributionConfig,
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async request<T>(path: string, options: OracleOperaRequestOptions = {}): Promise<T> {
    if (!path.startsWith("/")) {
      throw new OracleOperaDistributionError(
        "Oracle OPERA Distribution path must start with a slash",
        "request_failed",
      );
    }

    const headers = new Headers(options.headers);
    const idempotencyKey = headers.get("Idempotency-Key");
    if (idempotencyKey) headers.delete("Idempotency-Key");
    headers.set("Authorization", `Bearer ${await this.accessToken()}`);
    headers.set("x-app-key", this.config.appKey);
    headers.set("x-channelCode", this.config.channelCode);
    headers.set("x-originating-application", this.config.originatingApplication);
    headers.set("x-request-id", headers.get("x-request-id") || idempotencyKey || crypto.randomUUID());

    let body = options.body;
    if (body && Object.getPrototypeOf(body) === Object.prototype) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      body = JSON.stringify(body);
    }

    return this.fetchJson<T>(`${this.config.baseUrl}${path}`, {
      ...options,
      headers,
      body,
      hotelId: undefined,
    } as RequestInit, "request_failed");
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > this.now() + 30_000) return this.token.value;
    if (!this.tokenRefresh) {
      this.tokenRefresh = this.refreshToken().finally(() => { this.tokenRefresh = undefined; });
    }
    return this.tokenRefresh;
  }

  private async refreshToken() {
    const payload = await this.fetchJson<{ access_token?: string; expires_in?: number }>(
      this.config.tokenUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: this.config.username,
          password: this.config.password,
        }),
      },
      "authentication_failed",
    );
    if (!payload.access_token) {
      throw new OracleOperaDistributionError(
        "Oracle OPERA Distribution authentication response was invalid",
        "authentication_failed",
      );
    }
    this.token = {
      value: payload.access_token,
      expiresAt: this.now() + Math.max(payload.expires_in ?? 300, 1) * 1_000,
    };
    return this.token.value;
  }

  private async fetchJson<T>(
    url: string,
    init: RequestInit,
    failureCode: "authentication_failed" | "request_failed",
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new OracleOperaDistributionError(
          failureCode === "authentication_failed"
            ? "Oracle OPERA Distribution authentication failed"
            : "Oracle OPERA Distribution request failed",
          failureCode,
          response.status,
        );
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof OracleOperaDistributionError) throw error;
      if (controller.signal.aborted) {
        throw new OracleOperaDistributionError("Oracle OPERA Distribution request timed out", "timeout");
      }
      throw new OracleOperaDistributionError(
        "Oracle OPERA Distribution request could not be completed",
        failureCode,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

type Environment = Record<string, string | undefined>;

function required(environment: Environment, key: string) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Missing required Oracle OPERA Distribution configuration: ${key}`);
  return value;
}

function url(environment: Environment, key: string) {
  const value = required(environment, key);
  try { return new URL(value).toString().replace(/\/$/, ""); }
  catch { throw new Error(`Invalid URL in Oracle OPERA Distribution configuration: ${key}`); }
}

export function loadOracleOperaDistributionConfig(
  environment: Environment = process.env,
): OracleOperaDistributionConfig {
  const timeout = environment.PMS_ORACLE_OPERA_DISTRIBUTION_TIMEOUT_MS?.trim();
  const timeoutMs = timeout ? Number(timeout) : 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid positive number in Oracle OPERA Distribution configuration: PMS_ORACLE_OPERA_DISTRIBUTION_TIMEOUT_MS");
  }
  return {
    baseUrl: url(environment, "PMS_ORACLE_OPERA_DISTRIBUTION_BASE_URL"),
    tokenUrl: url(environment, "PMS_ORACLE_OPERA_DISTRIBUTION_TOKEN_URL"),
    username: required(environment, "PMS_ORACLE_OPERA_DISTRIBUTION_USERNAME"),
    password: required(environment, "PMS_ORACLE_OPERA_DISTRIBUTION_PASSWORD"),
    appKey: required(environment, "PMS_ORACLE_OPERA_DISTRIBUTION_APP_KEY"),
    channelCode: required(environment, "PMS_ORACLE_OPERA_DISTRIBUTION_CHANNEL_CODE"),
    originatingApplication: environment.PMS_ORACLE_OPERA_DISTRIBUTION_ORIGIN?.trim() || "iRatePilot",
    timeoutMs,
  };
}
