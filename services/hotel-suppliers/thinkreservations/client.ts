export type ThinkReservationsFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ThinkReservationsClientConfig = {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  audience: string;
  timeoutMs?: number;
};

export type ThinkReservationsHotel = Record<string, unknown> & {
  externalId?: string;
  name?: string;
  currency?: string;
};

export class ThinkReservationsClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "ThinkReservationsClientError";
  }
}

function httpsUrl(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return url;
}

function credentials(config: ThinkReservationsClientConfig) {
  if (!config.clientId.trim() || !config.clientSecret.trim()) {
    throw new Error("ThinkReservations client ID and client secret are required");
  }
  if (!config.audience.trim()) throw new Error("ThinkReservations audience is required");
}

function errorDetail(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { message: fallback, code: undefined };
  }
  const source = payload as Record<string, unknown>;
  const rawMessage = source.error_description ?? source.message ?? source.title;
  const rawCode = source.error ?? source.code ?? source.name;
  const code = typeof rawCode === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(rawCode)
    ? rawCode
    : undefined;
  return {
    message: typeof rawMessage === "string" && rawMessage.length <= 300 ? rawMessage : fallback,
    code,
  };
}

export class ThinkReservationsClient {
  private readonly baseUrl: URL;
  private readonly tokenUrl: URL;
  private readonly timeoutMs: number;
  private token?: { value: string; expiresAt: number };
  private tokenRequest?: Promise<string>;

  constructor(
    private readonly config: ThinkReservationsClientConfig,
    private readonly fetcher: ThinkReservationsFetch = fetch,
  ) {
    credentials(config);
    this.baseUrl = httpsUrl(config.baseUrl, "ThinkReservations base URL");
    this.tokenUrl = httpsUrl(config.tokenUrl, "ThinkReservations token URL");
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private async requestToken() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          audience: this.config.audience,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => undefined);
      const source = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      const accessToken = typeof source.access_token === "string" ? source.access_token.trim() : "";
      if (!response.ok || !accessToken) {
        const detail = errorDetail(payload, `ThinkReservations identity returned status ${response.status}`);
        throw new ThinkReservationsClientError(
          detail.message,
          response.ok ? 502 : response.status,
          detail.code || "thinkreservations_identity_rejected",
        );
      }
      const expiresIn = Number(source.expires_in);
      this.token = {
        value: accessToken,
        expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300) * 1_000,
      };
      return accessToken;
    } catch (error) {
      if (error instanceof ThinkReservationsClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ThinkReservationsClientError(
          "ThinkReservations identity request timed out",
          504,
          "thinkreservations_identity_timeout",
        );
      }
      throw new ThinkReservationsClientError(
        "ThinkReservations identity request failed",
        502,
        "thinkreservations_identity_unreachable",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    if (!this.tokenRequest) {
      this.tokenRequest = this.requestToken().finally(() => { this.tokenRequest = undefined; });
    }
    return this.tokenRequest;
  }

  async listHotels(): Promise<ThinkReservationsHotel[]> {
    const endpoint = new URL("/v1/hotels", this.baseUrl);
    if (endpoint.origin !== this.baseUrl.origin) {
      throw new Error("ThinkReservations hotel request must remain on the configured API origin");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(endpoint, {
        method: "GET",
        headers: { authorization: `Bearer ${await this.accessToken()}` },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => undefined);
      if (!response.ok) {
        const detail = errorDetail(payload, `ThinkReservations API returned status ${response.status}`);
        throw new ThinkReservationsClientError(
          detail.message,
          response.status,
          detail.code || "thinkreservations_api_rejected",
        );
      }
      if (!Array.isArray(payload) || payload.some((hotel) => !hotel || typeof hotel !== "object" || Array.isArray(hotel))) {
        throw new ThinkReservationsClientError(
          "ThinkReservations API returned an invalid hotels response",
          502,
          "thinkreservations_invalid_hotels_response",
        );
      }
      return payload as ThinkReservationsHotel[];
    } catch (error) {
      if (error instanceof ThinkReservationsClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ThinkReservationsClientError(
          "ThinkReservations API request timed out",
          504,
          "thinkreservations_api_timeout",
        );
      }
      throw new ThinkReservationsClientError(
        "ThinkReservations API request failed",
        502,
        "thinkreservations_api_unreachable",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
