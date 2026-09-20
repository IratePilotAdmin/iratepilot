import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionDarkDuffelWebhookWorkflow,
  FlightConsumerProductionDuffelWebhookError,
} from "../lib/flights/consumer-production/duffel-webhook.server";

const nowSeconds = 1_787_747_200;
const secret = "duffel-production-webhook-secret";
const env = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_RUNTIME_MODE: "production",
  FLIGHT_RUNTIME_ENVIRONMENT: "production",
  FLIGHT_RUNTIME_ENABLED: "false",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
  FLIGHT_PROVIDER_TRAFFIC_ENABLED: "false",
  FLIGHT_BOOKING_ENABLED: "false",
  FLIGHT_PAYMENT_ENABLED: "false",
  FLIGHT_SETTLEMENT_ENABLED: "false",
  FLIGHT_TICKETING_ENABLED: "false",
  FLIGHT_SERVICING_ENABLED: "false",
  FLIGHT_WEBHOOKS_ENABLED: "false",
  FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
  FLIGHT_TRANSACTION_KILL_SWITCH: "engaged",
  DUFFEL_LIVE_ACCESS_TOKEN: "duffel_live_1234567890abcdef",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET: secret,
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

function inbox(decision: "created" | "replay" = "created") {
  return {
    record: vi.fn(async (parameters: { p_event_type: string; p_execution_scope_sha256: string }) => [{
      decision,
      inbox_id: "11111111-1111-4111-8111-111111111111",
      inbox_state: parameters.p_event_type === "ping.triggered"
        ? "verified_ping"
        : "quarantined",
      event_type: parameters.p_event_type,
      execution_scope_sha256: parameters.p_execution_scope_sha256,
    }]),
  };
}

function eventBody(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    id: "wev_0000A3tQSmKyqOrcySrGbo",
    api_version: "v2",
    type: "ping.triggered",
    live_mode: true,
    idempotency_key: "ping_0000ABd6wggSct7BoraU1o",
    created_at: "2026-08-26T16:18:00.123456Z",
    data: { object: {} },
    ...overrides,
  }));
}

function signature(rawBody: Uint8Array, version: "v1" | "v2" = "v1") {
  const payload = Buffer.concat([
    Buffer.from(String(nowSeconds), "ascii"),
    Buffer.from(".", "ascii"),
    Buffer.from(rawBody),
  ]);
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return `t=${nowSeconds},${version}=${digest}`;
}

describe("Flight Consumer Production dark Duffel webhook", () => {
  it("accepts a signed live v2 ping without authorizing any mutation", async () => {
    const rawBody = eventBody();
    const port = inbox();
    const result = await createFlightConsumerProductionDarkDuffelWebhookWorkflow(
      env,
      { inbox: port, nowSeconds: () => nowSeconds },
    ).ingest({ rawBody, signature: signature(rawBody, "v2") });
    expect(result).toEqual({
      version: "flight-consumer-production-duffel-webhook-result-v1",
      decision: "verified_ping",
      eventType: "ping.triggered",
      liveMode: true,
      durableInboxRecorded: true,
      consumerReleaseEnabled: false,
      providerMutationAuthorized: false,
    });
    expect(port.record).toHaveBeenCalledWith(expect.objectContaining({
      p_event_type: "ping.triggered",
      p_live_mode: true,
    }));
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(env.DUFFEL_LIVE_ACCESS_TOKEN);
  });

  it("durably quarantines every signed live commerce or unknown event", async () => {
    for (const type of [
      "order.created",
      "order.creation_failed",
      "air.order.changed",
      "order.airline_initiated_change_detected",
      "future.live.event",
    ]) {
      const rawBody = eventBody({ type });
      const port = inbox();
      await expect(createFlightConsumerProductionDarkDuffelWebhookWorkflow(
        env,
        { inbox: port, nowSeconds: () => nowSeconds },
      ).ingest({ rawBody, signature: signature(rawBody) })).resolves.toMatchObject({
        decision: "quarantined",
        eventType: type,
        durableInboxRecorded: true,
        providerMutationAuthorized: false,
      });
      expect(port.record).toHaveBeenCalledTimes(1);
    }
  });

  it("returns an immutable replay decision from the durable inbox", async () => {
    const rawBody = eventBody();
    await expect(createFlightConsumerProductionDarkDuffelWebhookWorkflow(
      env,
      { inbox: inbox("replay"), nowSeconds: () => nowSeconds },
    ).ingest({ rawBody, signature: signature(rawBody) })).resolves.toMatchObject({
      decision: "replayed",
      durableInboxRecorded: true,
    });
  });

  it("rejects test-mode, malformed, stale, and invalid-signature payloads", async () => {
    const workflow = createFlightConsumerProductionDarkDuffelWebhookWorkflow(
      env,
      { inbox: inbox(), nowSeconds: () => nowSeconds },
    );
    const testBody = eventBody({ live_mode: false });
    await expect(workflow.ingest({
      rawBody: testBody,
      signature: signature(testBody),
    })).rejects.toMatchObject({ status: 400, diagnostic: "event_contract_rejected" });

    const validBody = eventBody();
    await expect(workflow.ingest({
      rawBody: validBody,
      signature: `t=${nowSeconds},v1=${"0".repeat(64)}`,
    })).rejects.toMatchObject({ status: 400, diagnostic: "signature_invalid_signature" });

    const staleWorkflow = createFlightConsumerProductionDarkDuffelWebhookWorkflow(
      env,
      { inbox: inbox(), nowSeconds: () => nowSeconds + 301 },
    );
    await expect(staleWorkflow.ingest({
      rawBody: validBody,
      signature: signature(validBody),
    })).rejects.toMatchObject({
      status: 400,
      diagnostic: "signature_timestamp_outside_local_policy",
    });
  });

  it("fails closed before ingestion when any dark-runtime requirement is missing", () => {
    let thrown: unknown;
    try {
      createFlightConsumerProductionDarkDuffelWebhookWorkflow({
        ...env,
        FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET: undefined,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FlightConsumerProductionDuffelWebhookError);
    expect(thrown).toMatchObject({ status: 503, diagnostic: "workflow_unavailable" });
    expect(String(thrown)).not.toContain(secret);
  });
});
