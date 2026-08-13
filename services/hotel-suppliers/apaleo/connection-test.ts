import type { ApaleoFetch } from "./transport";

export type ApaleoConnectionTestConfig = {
  baseUrl?: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
};

export type ApaleoConnectionTestResult = {
  propertyCount: number;
};

export class ApaleoConnectionTestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "ApaleoConnectionTestError";
  }
}

function validate(config: ApaleoConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl ?? "https://api.apaleo.com");
  if (baseUrl.protocol !== "https:") throw new Error("Apaleo base URL must use HTTPS");
  if (!config.clientId.trim() || !config.clientSecret.trim()) {
    throw new Error("Apaleo client ID and client secret are required");
  }
  if (!/^[\x20-\x7E]+$/.test(config.clientId) || !/^[\x20-\x7E]+$/.test(config.clientSecret)) {
    throw new Error("Apaleo client credentials must contain printable ASCII characters");
  }
  return baseUrl;
}

function errorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const message = source.error_description ?? source.message ?? source.title ?? source.detail;
  const code = source.error ?? source.code ?? source.type;
  const serializedCode = typeof code === "string" || typeof code === "number"
    ? String(code)
    : undefined;
  return {
    message: typeof message === "string" ? message : undefined,
    code: serializedCode && /^[A-Za-z0-9_.:-]{1,80}$/.test(serializedCode)
      ? serializedCode
      : undefined,
  };
}

function propertiesFrom(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return undefined;
  const source = payload as Record<string, unknown>;
  if (Array.isArray(source.properties)) return source.properties;
  if (Array.isArray(source.data)) return source.data;
  return undefined;
}

export async function testApaleoSandboxConnection(
  config: ApaleoConnectionTestConfig,
  fetcher: ApaleoFetch = fetch,
): Promise<ApaleoConnectionTestResult> {
  const baseUrl = validate(config);
  const propertiesEndpoint = new URL("/inventory/v1/properties", baseUrl);
  if (propertiesEndpoint.origin !== baseUrl.origin) {
    throw new Error("Apaleo connection test must remain on the configured API origin");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const tokenResponse = await fetcher("https://identity.apaleo.com/connect/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      signal: controller.signal,
    });
    const tokenPayload = await tokenResponse.json().catch(() => undefined);
    if (!tokenResponse.ok) {
      const detail = errorDetail(tokenPayload);
      throw new ApaleoConnectionTestError(
        detail.message || `Apaleo identity returned status ${tokenResponse.status}`,
        tokenResponse.status,
        detail.code || "apaleo_identity_rejected",
      );
    }
    const accessToken = tokenPayload && typeof tokenPayload === "object"
      ? (tokenPayload as Record<string, unknown>).access_token
      : undefined;
    if (typeof accessToken !== "string" || !accessToken.trim()) {
      throw new ApaleoConnectionTestError(
        "Apaleo identity returned an invalid token response",
        502,
        "apaleo_invalid_token_response",
      );
    }

    const propertiesResponse = await fetcher(propertiesEndpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const propertiesPayload = await propertiesResponse.json().catch(() => undefined);
    if (!propertiesResponse.ok) {
      const detail = errorDetail(propertiesPayload);
      throw new ApaleoConnectionTestError(
        detail.message || `Apaleo API returned status ${propertiesResponse.status}`,
        propertiesResponse.status,
        detail.code || "apaleo_sandbox_rejected",
      );
    }
    const properties = propertiesFrom(propertiesPayload);
    if (!properties) {
      throw new ApaleoConnectionTestError(
        "Apaleo API returned an invalid properties response",
        502,
        "apaleo_invalid_properties_response",
      );
    }
    return { propertyCount: properties.length };
  } catch (error) {
    if (error instanceof ApaleoConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApaleoConnectionTestError(
        "Apaleo sandbox request timed out",
        504,
        "apaleo_sandbox_timeout",
      );
    }
    throw new ApaleoConnectionTestError(
      "Apaleo sandbox connection failed",
      502,
      "apaleo_sandbox_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}
