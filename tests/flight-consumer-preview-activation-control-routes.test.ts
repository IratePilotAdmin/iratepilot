import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockActivationControlError extends Error {
    readonly kind: "conflict" | "unavailable";

    constructor(kind: "conflict" | "unavailable" = "unavailable") {
      super("safe activation control error");
      this.kind = kind;
    }
  }
  return {
    MockActivationControlError,
    activate: vi.fn(),
    idempotency: vi.fn(),
    readJson: vi.fn(),
    relock: vi.fn(),
    requireRole: vi.fn(),
    sameOrigin: vi.fn(),
  };
});

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/flights/consumer-preview/activation-control.server", () => ({
  FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION:
    "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY",
  FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION:
    "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS",
  FlightConsumerPreviewActivationControlError: mocks.MockActivationControlError,
  activateFlightConsumerPreview: mocks.activate,
  relockFlightConsumerPreview: mocks.relock,
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

import { POST as activate } from "../app/api/admin/flights/consumer-preview/activation/route";
import { POST as relock } from "../app/api/admin/flights/consumer-preview/relock/route";

const originalVercelEnvironment = process.env.VERCEL_ENV;
const actorId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const supabase = { rpc: vi.fn() };

function request(path: string, origin = "https://preview.example.test") {
  return new Request(`https://preview.example.test${path}`, {
    method: "POST",
    headers: origin ? { Origin: origin } : undefined,
  });
}

afterAll(() => {
  if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnvironment;
});

describe("Flight Consumer Preview activation control routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_ENV = "preview";
    mocks.sameOrigin.mockReturnValue(true);
    mocks.idempotency.mockReturnValue(idempotencyKey);
    mocks.requireRole.mockResolvedValue({ supabase, user: { id: actorId } });
    mocks.readJson.mockResolvedValue({
      ok: true,
      value: { confirmation: "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY" },
    });
    mocks.activate.mockResolvedValue({ decision: "activated", controlKey: "global" });
    mocks.relock.mockResolvedValue({ decision: "relocked", controlKey: "global" });
  });

  it("requires a same-origin authenticated admin, exact phrase, and UUID idempotency for activation", async () => {
    const response = await activate(request(
      "/api/admin/flights/consumer-preview/activation",
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.activate).toHaveBeenCalledWith(supabase, {
      actorId,
      confirmation: "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY",
      idempotencyKey,
    });

    mocks.readJson.mockResolvedValueOnce({
      ok: true,
      value: {
        confirmation: "ACTIVATE_CONSUMER_FLIGHT_PREVIEW_TEST_ONLY",
        stripeAccountId: "acct_body_must_never_be_used",
      },
    });
    const extraField = await activate(request(
      "/api/admin/flights/consumer-preview/activation",
    ));
    expect(extraField.status).toBe(400);
    expect(mocks.activate).toHaveBeenCalledTimes(1);

    mocks.idempotency.mockReturnValueOnce(null);
    const missingKey = await activate(request(
      "/api/admin/flights/consumer-preview/activation",
    ));
    expect(missingKey.status).toBe(400);
  });

  it("rejects missing/cross-site origins and non-admin callers before activation", async () => {
    const missingOrigin = await activate(request(
      "/api/admin/flights/consumer-preview/activation",
      "",
    ));
    expect(missingOrigin.status).toBe(403);
    expect(mocks.requireRole).not.toHaveBeenCalled();

    mocks.sameOrigin.mockReturnValueOnce(false);
    const crossSite = await activate(request(
      "/api/admin/flights/consumer-preview/activation",
      "https://attacker.example",
    ));
    expect(crossSite.status).toBe(403);

    mocks.requireRole.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    const unauthenticated = await activate(request(
      "/api/admin/flights/consumer-preview/activation",
    ));
    expect(unauthenticated.status).toBe(401);
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("is unavailable outside Preview without evaluating authentication", async () => {
    process.env.VERCEL_ENV = "production";
    const response = await activate(request(
      "/api/admin/flights/consumer-preview/activation",
    ));
    expect(response.status).toBe(404);
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("uses a distinct relock phrase and delegates only the bounded relock operation", async () => {
    mocks.readJson.mockResolvedValueOnce({
      ok: true,
      value: {
        confirmation: "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS",
      },
    });
    const response = await relock(request(
      "/api/admin/flights/consumer-preview/relock",
    ));
    expect(response.status).toBe(200);
    expect(mocks.relock).toHaveBeenCalledWith(supabase, {
      actorId,
      confirmation: "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS",
      idempotencyKey,
    });
    expect(mocks.activate).not.toHaveBeenCalled();

    const wrongPhrase = await relock(request(
      "/api/admin/flights/consumer-preview/relock",
    ));
    expect(wrongPhrase.status).toBe(400);
    expect(mocks.relock).toHaveBeenCalledTimes(1);
  });

  it("maps state conflicts and outages to generic no-store responses", async () => {
    mocks.activate.mockRejectedValueOnce(new mocks.MockActivationControlError("conflict"));
    const conflict = await activate(request(
      "/api/admin/flights/consumer-preview/activation",
    ));
    expect(conflict.status).toBe(409);

    mocks.readJson.mockResolvedValueOnce({
      ok: true,
      value: {
        confirmation: "RELOCK_CONSUMER_FLIGHT_PREVIEW_AND_STOP_ALL_TEST_OPERATIONS",
      },
    });
    mocks.relock.mockRejectedValueOnce(new mocks.MockActivationControlError("unavailable"));
    const unavailable = await relock(request(
      "/api/admin/flights/consumer-preview/relock",
    ));
    expect(unavailable.status).toBe(503);
    const serialized = JSON.stringify(await unavailable.json());
    expect(serialized).not.toMatch(/nonce|secret|receipt|stripe|duffel|account/i);
  });
});
