import type { ApaleoFetch } from "./transport";

export type ApaleoWebhookSubscription = {
  id: string;
};

export class ApaleoWebhookError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detailCode: string,
  ) {
    super(message);
    this.name = "ApaleoWebhookError";
  }
}

function errorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const source = payload as Record<string, unknown>;
  const message = source.message ?? source.title ?? source.detail ?? source.error_description;
  return typeof message === "string" ? message.slice(0, 300) : undefined;
}

function webhookEndpoint(path: string) {
  return new URL(path, "https://webhook.apaleo.com");
}

async function request(
  endpoint: URL,
  accessToken: string,
  init: RequestInit,
  fetcher: ApaleoFetch,
  timeoutMs: number,
) {
  if (!accessToken.trim()) throw new Error("Apaleo webhook access token is required");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(endpoint, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApaleoWebhookError("Apaleo webhook request timed out", 504, "apaleo_webhook_timeout");
    }
    throw new ApaleoWebhookError("Apaleo webhook service could not be reached", 502, "apaleo_webhook_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}

export async function createApaleoWebhookSubscription(
  config: {
    accessToken: string;
    endpointUrl: string;
    propertyCode: string;
    events?: string[];
    timeoutMs?: number;
  },
  fetcher: ApaleoFetch = fetch,
): Promise<ApaleoWebhookSubscription> {
  const endpointUrl = new URL(config.endpointUrl);
  if (endpointUrl.protocol !== "https:") throw new Error("Apaleo webhook endpoint must use HTTPS");
  const propertyCode = config.propertyCode.trim();
  if (!propertyCode || propertyCode.length > 120) throw new Error("Apaleo webhook property is invalid");
  const events = config.events ?? ["reservation/*"];
  if (events.length === 0 || events.some((event) => !/^[a-z][a-z0-9-]*\/(?:\*|[a-z][a-z0-9-]*)$/.test(event))) {
    throw new Error("Apaleo webhook event filters are invalid");
  }
  const response = await request(
    webhookEndpoint("/v1/subscriptions"),
    config.accessToken,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpointUrl: endpointUrl.toString(),
        events,
        propertyIds: [propertyCode],
      }),
    },
    fetcher,
    config.timeoutMs ?? 15_000,
  );
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApaleoWebhookError(
      errorDetail(payload) || `Apaleo webhook service returned status ${response.status}`,
      response.status,
      "apaleo_webhook_create_rejected",
    );
  }
  const id = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).id
    : undefined;
  if (typeof id !== "string" || !id.trim() || id.length > 120) {
    throw new ApaleoWebhookError(
      "Apaleo webhook service returned an invalid subscription",
      502,
      "apaleo_webhook_invalid_subscription",
    );
  }
  return { id: id.trim() };
}

export async function deleteApaleoWebhookSubscription(
  config: { accessToken: string; subscriptionId: string; timeoutMs?: number },
  fetcher: ApaleoFetch = fetch,
) {
  const subscriptionId = config.subscriptionId.trim();
  if (!subscriptionId || subscriptionId.length > 120 || !/^[A-Za-z0-9-]+$/.test(subscriptionId)) {
    throw new Error("Apaleo webhook subscription ID is invalid");
  }
  const response = await request(
    webhookEndpoint(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`),
    config.accessToken,
    { method: "DELETE" },
    fetcher,
    config.timeoutMs ?? 15_000,
  );
  if (response.status === 204 || response.status === 404) return;
  const payload = await response.json().catch(() => undefined);
  throw new ApaleoWebhookError(
    errorDetail(payload) || `Apaleo webhook service returned status ${response.status}`,
    response.status,
    "apaleo_webhook_delete_rejected",
  );
}
