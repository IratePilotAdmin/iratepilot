import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  executeFlightConsumerPreviewDuffelWebhookBootstrap,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION,
  FlightConsumerPreviewDuffelWebhookBootstrapError,
  type FlightConsumerPreviewDuffelWebhookBootstrapDependencies,
} from "../lib/flights/consumer-preview/duffel-webhook-bootstrap.server";
import { FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS } from "../lib/flights/consumer-preview/duffel-webhook.server";

const actorId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const bypassSecret = "preview_bypass_secret_1234567890";
const signingSecret = "Duffel+one/time/signing/secret==";
const webhookId = "end_0000A3tQSmKyqOrcySrGbo";
const appOrigin = "https://iratepilot-consumer-flights-preview.vercel.app";
const receiverUrl = `${appOrigin}/api/flights/preview/webhooks/duffel?x-vercel-protection-bypass=${bypassSecret}`;
const listUrl = "https://api.duffel.com/air/webhooks?limit=200";
const createUrl = "https://api.duffel.com/air/webhooks";

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_APP_URL: appOrigin,
    DUFFEL_TEST_ACCESS_TOKEN: "duffel_test_1234567890abcdef",
    FLIGHT_CONSUMER_PREVIEW_PROVIDER_WEBHOOK_BYPASS_SECRET: bypassSecret,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function listResponse(data: unknown[], after: string | null = null) {
  return jsonResponse({
    data,
    meta: { after, before: null, limit: 200 },
  }, 200);
}

function webhook(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    events: [...FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS],
    id: webhookId,
    live_mode: false,
    url: receiverUrl,
    ...overrides,
  };
}

function dependencies(
  fetcher: ReturnType<typeof vi.fn>,
  env = environment(),
): FlightConsumerPreviewDuffelWebhookBootstrapDependencies {
  return { env, fetcher: fetcher as unknown as typeof fetch };
}

function input(confirmation: string) {
  return { actorId, confirmation, idempotencyKey };
}

describe("temporary Consumer Preview Duffel webhook bootstrap", () => {
  it("lists first and creates exactly one TEST webhook from only server-side configuration", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(jsonResponse({
        data: webhook({ secret: signingSecret }),
      }, 201));

    const result = await executeFlightConsumerPreviewDuffelWebhookBootstrap(
      input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION),
      dependencies(fetcher),
    );

    expect(result).toEqual({
      decision: "created",
      mode: "duffel_test_mode",
      signingSecret,
      storeSigningSecretImmediately: true,
      webhookIdSha256: createHash("sha256").update(webhookId).digest("hex"),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(listUrl);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "GET",
      cache: "no-store",
      redirect: "error",
    });
    expect(fetcher.mock.calls[1][0]).toBe(createUrl);
    const createRequest = fetcher.mock.calls[1][1] as RequestInit;
    expect(createRequest.method).toBe("POST");
    expect(JSON.parse(createRequest.body as string)).toEqual({
      data: {
        url: receiverUrl,
        events: [...FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_EVENTS],
      },
    });
    const headers = new Headers(createRequest.headers);
    expect(headers.get("authorization")).toBe("Bearer duffel_test_1234567890abcdef");
    expect(headers.get("duffel-version")).toBe("v2");
    expect(headers.get("x-client-correlation-id")).toBe(idempotencyKey);
    expect(headers.has("idempotency-key")).toBe(false);
    expect(JSON.stringify(result)).not.toContain(bypassSecret);
    expect(JSON.stringify(result)).not.toContain("duffel_test_1234567890abcdef");
  });

  it("never creates when any webhook exists or the complete-list proof is ambiguous", async () => {
    const existing = vi.fn().mockResolvedValueOnce(listResponse([webhook()]));
    await expect(executeFlightConsumerPreviewDuffelWebhookBootstrap(
      input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION),
      dependencies(existing),
    )).rejects.toMatchObject({ kind: "conflict" });
    expect(existing).toHaveBeenCalledTimes(1);

    const paginated = vi.fn().mockResolvedValueOnce(listResponse([], "next-page-secret"));
    await expect(executeFlightConsumerPreviewDuffelWebhookBootstrap(
      input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION),
      dependencies(paginated),
    )).rejects.toMatchObject({ kind: "unavailable" });
    expect(paginated).toHaveBeenCalledTimes(1);
  });

  it("fails closed before provider access for non-Preview, unstable URL, bypass, or live credentials", async () => {
    const cases = [
      environment({ VERCEL_ENV: "production" }),
      environment({ NEXT_PUBLIC_APP_URL: `${appOrigin}/` }),
      environment({ NEXT_PUBLIC_APP_URL: "https://different-preview.vercel.app" }),
      environment({ NEXT_PUBLIC_APP_URL: "http://preview.iratepilot.test" }),
      environment({ FLIGHT_CONSUMER_PREVIEW_PROVIDER_WEBHOOK_BYPASS_SECRET: "short" }),
      environment({ DUFFEL_TEST_ACCESS_TOKEN: "duffel_live_never_allowed_123456" }),
    ];
    for (const env of cases) {
      const fetcher = vi.fn();
      await expect(executeFlightConsumerPreviewDuffelWebhookBootstrap(
        input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION),
        dependencies(fetcher, env),
      )).rejects.toBeInstanceOf(FlightConsumerPreviewDuffelWebhookBootstrapError);
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("rejects a malformed or non-test create response without leaking returned secrets", async () => {
    for (const unsafeWebhook of [
      webhook({ live_mode: true, secret: "unsafe-live-signing-secret" }),
      webhook({ url: "https://attacker.example/webhook", secret: "unsafe-url-secret-1234" }),
      webhook({ events: ["order.created"], secret: "unsafe-events-secret-1234" }),
    ]) {
      const fetcher = vi.fn()
        .mockResolvedValueOnce(listResponse([]))
        .mockResolvedValueOnce(jsonResponse({ data: unsafeWebhook }, 201));
      const failure = await executeFlightConsumerPreviewDuffelWebhookBootstrap(
        input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION),
        dependencies(fetcher),
      ).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(FlightConsumerPreviewDuffelWebhookBootstrapError);
      expect((failure as Error).message).not.toMatch(/unsafe|attacker|secret|duffel_test_/i);
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });

  it("validates the single exact TEST webhook before requesting a ping", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(listResponse([webhook()]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await executeFlightConsumerPreviewDuffelWebhookBootstrap(
      input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION),
      dependencies(fetcher),
    );

    expect(result).toEqual({
      decision: "ping_requested",
      mode: "duffel_test_mode",
      webhookIdSha256: createHash("sha256").update(webhookId).digest("hex"),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(
      `https://api.duffel.com/air/webhooks/${webhookId}/actions/ping`,
    );
    const pingRequest = fetcher.mock.calls[1][1] as RequestInit;
    expect(pingRequest).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
    });
    expect(new Headers(pingRequest.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(pingRequest.body as string)).toEqual({});
    expect(JSON.stringify(result)).not.toContain(webhookId);
    expect(JSON.stringify(result)).not.toContain(bypassSecret);
  });

  it("never pings when count, URL, event set, mode, or active state differs", async () => {
    const mismatches = [
      [],
      [webhook(), webhook({ id: "end_0000B4tQSmKyqOrcySrGbo" })],
      [webhook({ url: "https://wrong.example/webhook" })],
      [webhook({ events: ["order.created"] })],
      [webhook({ live_mode: true })],
      [webhook({ active: false })],
    ];
    for (const data of mismatches) {
      const fetcher = vi.fn().mockResolvedValueOnce(listResponse(data));
      await expect(executeFlightConsumerPreviewDuffelWebhookBootstrap(
        input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION),
        dependencies(fetcher),
      )).rejects.toMatchObject({ kind: "conflict" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("requires an exact fixed operation and UUIDs without external access", async () => {
    for (const candidate of [
      input("CREATE_WEBHOOK"),
      { ...input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION), idempotencyKey: "not-a-uuid" },
      { ...input(FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION), actorId: "not-a-uuid" },
    ]) {
      const fetcher = vi.fn();
      await expect(executeFlightConsumerPreviewDuffelWebhookBootstrap(
        candidate,
        dependencies(fetcher),
      )).rejects.toMatchObject({ kind: "unavailable" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });
});
