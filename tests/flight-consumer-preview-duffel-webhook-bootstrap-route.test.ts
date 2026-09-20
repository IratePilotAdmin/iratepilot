import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockBootstrapError extends Error {
    readonly kind: "conflict" | "unavailable";

    constructor(kind: "conflict" | "unavailable" = "unavailable") {
      super("safe bootstrap error");
      this.kind = kind;
    }
  }
  return {
    MockBootstrapError,
    execute: vi.fn(),
    idempotency: vi.fn(),
    readJson: vi.fn(),
    requireRole: vi.fn(),
    sameOrigin: vi.fn(),
  };
});

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/flights/consumer-preview/duffel-webhook-bootstrap.server", () => ({
  executeFlightConsumerPreviewDuffelWebhookBootstrap: mocks.execute,
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_BOOTSTRAP_CONFIRMATION:
    "BOOTSTRAP_ONE_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW",
  FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_PING_CONFIRMATION:
    "PING_EXACT_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW",
  FlightConsumerPreviewDuffelWebhookBootstrapError: mocks.MockBootstrapError,
}));
vi.mock("@/lib/flights/consumer-preview/http.server", () => ({
  validateSameOriginMutation: mocks.sameOrigin,
  readPreviewIdempotencyKey: mocks.idempotency,
  readPreviewJson: mocks.readJson,
  privateNoStoreJson(body: unknown, status = 200) {
    return Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store, private" },
    });
  },
}));

import { POST } from "../app/api/admin/flights/consumer-preview/duffel-webhook-bootstrap/route";

const originalVercelEnvironment = process.env.VERCEL_ENV;
const actorId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const bootstrapConfirmation =
  "BOOTSTRAP_ONE_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW";
const pingConfirmation =
  "PING_EXACT_DUFFEL_TEST_WEBHOOK_FOR_CONSUMER_PREVIEW";

function request(origin = "https://preview.example.test") {
  return new Request(
    "https://preview.example.test/api/admin/flights/consumer-preview/duffel-webhook-bootstrap",
    {
      method: "POST",
      headers: origin ? { Origin: origin } : undefined,
    },
  );
}

afterAll(() => {
  if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnvironment;
});

describe("temporary Consumer Preview Duffel webhook bootstrap route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_ENV = "preview";
    mocks.sameOrigin.mockReturnValue(true);
    mocks.idempotency.mockReturnValue(idempotencyKey);
    mocks.requireRole.mockResolvedValue({ user: { id: actorId }, supabase: {} });
    mocks.readJson.mockResolvedValue({
      ok: true,
      value: { confirmation: bootstrapConfirmation },
    });
    mocks.execute.mockResolvedValue({
      decision: "created",
      mode: "duffel_test_mode",
      signingSecret: "one-time-signing-secret-value",
      storeSigningSecretImmediately: true,
      webhookIdSha256: "a".repeat(64),
    });
  });

  it("requires same-origin admin auth, exact bootstrap phrase, and UUID idempotency", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.execute).toHaveBeenCalledWith({
      actorId,
      confirmation: bootstrapConfirmation,
      idempotencyKey,
    });
    expect(await response.json()).toEqual({
      data: {
        decision: "created",
        mode: "duffel_test_mode",
        signingSecret: "one-time-signing-secret-value",
        storeSigningSecretImmediately: true,
        webhookIdSha256: "a".repeat(64),
      },
    });

    mocks.readJson.mockResolvedValueOnce({
      ok: true,
      value: { confirmation: bootstrapConfirmation, accessToken: "body-token" },
    });
    const extraField = await POST(request());
    expect(extraField.status).toBe(400);
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    mocks.idempotency.mockReturnValueOnce(null);
    const missingKey = await POST(request());
    expect(missingKey.status).toBe(400);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("uses a distinct exact phrase for the bounded ping operation", async () => {
    mocks.readJson.mockResolvedValueOnce({
      ok: true,
      value: { confirmation: pingConfirmation },
    });
    mocks.execute.mockResolvedValueOnce({
      decision: "ping_requested",
      mode: "duffel_test_mode",
      webhookIdSha256: "b".repeat(64),
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith({
      actorId,
      confirmation: pingConfirmation,
      idempotencyKey,
    });
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toMatch(/signingSecret|bypass|accessToken|end_/i);

    mocks.readJson.mockResolvedValueOnce({
      ok: true,
      value: { confirmation: "PING_DUFFEL" },
    });
    const wrongPhrase = await POST(request());
    expect(wrongPhrase.status).toBe(400);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects missing/cross-site origins and non-admin callers before provider delegation", async () => {
    const missingOrigin = await POST(request(""));
    expect(missingOrigin.status).toBe(403);
    expect(mocks.requireRole).not.toHaveBeenCalled();

    mocks.sameOrigin.mockReturnValueOnce(false);
    const crossSite = await POST(request("https://attacker.example"));
    expect(crossSite.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();

    mocks.requireRole.mockResolvedValueOnce({
      error: "Authentication required.",
      status: 401,
    });
    const unauthenticated = await POST(request());
    expect(unauthenticated.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("is unavailable outside Preview without evaluating authentication", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns sanitized private conflicts and outages with no provider material", async () => {
    mocks.execute.mockRejectedValueOnce(new mocks.MockBootstrapError("conflict"));
    const conflict = await POST(request());
    expect(conflict.status).toBe(409);
    const conflictBody = JSON.stringify(await conflict.json());
    expect(conflictBody).not.toMatch(/secret|token|url|event|live_mode|end_/i);

    mocks.execute.mockRejectedValueOnce(new mocks.MockBootstrapError("unavailable"));
    const unavailable = await POST(request());
    expect(unavailable.status).toBe(503);
    const unavailableBody = JSON.stringify(await unavailable.json());
    expect(unavailableBody).not.toMatch(/secret|token|url|event|live_mode|end_/i);
  });
});
