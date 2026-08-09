import type { RmsCloudFetch } from "./transport";

export type RmsCloudConnectionTestConfig = {
  baseUrl?: string;
  agentId: string;
  agentPassword: string;
  clientId: string;
  clientPassword: string;
  propertyId: string;
  moduleType?: string;
  useTrainingDatabase?: boolean;
  timeoutMs?: number;
};

export type RmsCloudConnectionTestResult = { propertyCount: number };

export class RmsCloudConnectionTestError extends Error {
  constructor(message: string, readonly status: number, readonly detailCode: string) {
    super(message);
    this.name = "RmsCloudConnectionTestError";
  }
}

function validate(config: RmsCloudConnectionTestConfig) {
  const baseUrl = new URL(config.baseUrl ?? "https://restapi8.rmscloud.com/");
  if (baseUrl.protocol !== "https:") throw new Error("RMS Cloud base URL must use HTTPS");
  for (const [label, value] of Object.entries({
    "agent ID": config.agentId,
    "agent password": config.agentPassword,
    "client ID": config.clientId,
    "client password": config.clientPassword,
    "property ID": config.propertyId,
  })) if (!value.trim()) throw new Error(`RMS Cloud ${label} is required`);
  return baseUrl;
}

function token(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const source = payload as Record<string, unknown>;
  const value = source.token ?? source.authToken ?? source.authtoken;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Creates a short-lived RMS token, then verifies the configured property with a read-only call. */
export async function testRmsCloudSandboxConnection(
  config: RmsCloudConnectionTestConfig,
  fetcher: RmsCloudFetch = fetch,
): Promise<RmsCloudConnectionTestResult> {
  const baseUrl = validate(config);
  const authEndpoint = new URL("authToken", baseUrl);
  const propertyEndpoint = new URL(
    `properties/${encodeURIComponent(config.propertyId)}`,
    baseUrl,
  );
  if (authEndpoint.origin !== baseUrl.origin || propertyEndpoint.origin !== baseUrl.origin) {
    throw new Error("RMS Cloud connection test must remain on the configured API origin");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const authResponse = await fetcher(authEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        agentId: Number(config.agentId),
        agentPassword: config.agentPassword,
        clientId: Number(config.clientId),
        clientPassword: config.clientPassword,
        moduleType: [config.moduleType ?? "DataWarehouse"],
        useTrainingDatabase: config.useTrainingDatabase ?? true,
      }),
      signal: controller.signal,
    });
    const authPayload = await authResponse.json().catch(() => undefined);
    if (!authResponse.ok) {
      throw new RmsCloudConnectionTestError(
        `RMS Cloud authentication returned status ${authResponse.status}`,
        authResponse.status,
        authResponse.status === 401 ? "rms_cloud_authentication_failed" : "rms_cloud_authentication_rejected",
      );
    }
    const authToken = token(authPayload);
    if (!authToken) {
      throw new RmsCloudConnectionTestError(
        "RMS Cloud returned an invalid authentication response",
        502,
        "rms_cloud_invalid_authentication_response",
      );
    }

    const propertyResponse = await fetcher(propertyEndpoint, {
      method: "GET",
      headers: { authtoken: authToken, accept: "application/json" },
      signal: controller.signal,
    });
    const propertyPayload = await propertyResponse.json().catch(() => undefined);
    if (!propertyResponse.ok) {
      throw new RmsCloudConnectionTestError(
        `RMS Cloud property read returned status ${propertyResponse.status}`,
        propertyResponse.status,
        propertyResponse.status === 401 || propertyResponse.status === 403
          ? "rms_cloud_property_access_denied"
          : "rms_cloud_sandbox_rejected",
      );
    }
    if (!propertyPayload || (typeof propertyPayload !== "object" && !Array.isArray(propertyPayload))) {
      throw new RmsCloudConnectionTestError(
        "RMS Cloud returned an invalid property response",
        502,
        "rms_cloud_invalid_property_response",
      );
    }
    return { propertyCount: Array.isArray(propertyPayload) ? propertyPayload.length : 1 };
  } catch (error) {
    if (error instanceof RmsCloudConnectionTestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RmsCloudConnectionTestError("RMS Cloud sandbox request timed out", 504, "rms_cloud_sandbox_timeout");
    }
    throw new RmsCloudConnectionTestError("RMS Cloud sandbox connection failed", 502, "rms_cloud_sandbox_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}
