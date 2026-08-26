import { beforeEach, describe, expect, it, vi } from "vitest";
import { FlightConsumerPreviewCompletionProcessingError } from "../lib/flights/consumer-preview/completion-lease-contract";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  requireUser: vi.fn(),
  sameOrigin: vi.fn(),
  idempotencyKey: vi.fn(),
  readJson: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/email/flight-notification-delivery.server", () => ({
  queueFlightConsumerPreviewNotification: mocks.notify,
}));
vi.mock("@/lib/flights/consumer-preview/complete-order-workflow.server", () => ({
  completeFlightConsumerPreviewOrder: mocks.complete,
}));
vi.mock("@/lib/flights/consumer-preview/completion-lease-contract", async () => (
  import("../lib/flights/consumer-preview/completion-lease-contract")
));
vi.mock("@/lib/flights/consumer-preview/http.server", () => ({
  validateSameOriginMutation: mocks.sameOrigin,
  readPreviewIdempotencyKey: mocks.idempotencyKey,
  readPreviewJson: mocks.readJson,
  privateNoStoreJson(body: unknown, status = 200) {
    return Response.json(body, {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
  },
}));
vi.mock("@/lib/flights/consumer-preview/request-schemas", () => ({
  flightConsumerPreviewCompleteOrderRequestSchema: {
    safeParse(value: unknown) {
      const paymentIntentId = (value as { paymentIntentId?: unknown } | null)?.paymentIntentId;
      return typeof paymentIntentId === "string" && /^pi_[A-Za-z0-9]{8,252}$/.test(paymentIntentId)
        ? { success: true, data: { paymentIntentId } }
        : { success: false };
    },
  },
}));

import { POST } from "../app/api/flights/preview/orders/[orderId]/complete/route";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";
const paymentIntentId = "pi_preview12345678";

function request() {
  return new Request(`https://preview.example.test/api/flights/preview/orders/${orderId}/complete`, {
    method: "POST",
  });
}

describe("Flight Consumer Preview complete-order route", () => {
  beforeEach(() => {
    mocks.notify.mockReset();
    mocks.complete.mockReset().mockResolvedValue({
      orderId,
      status: "ticketed",
      issuedTicketCount: 1,
    });
    mocks.requireUser.mockReset().mockResolvedValue({ user: { id: customerId } });
    mocks.sameOrigin.mockReset().mockReturnValue(true);
    mocks.idempotencyKey.mockReset().mockReturnValue(idempotencyKey);
    mocks.readJson.mockReset().mockResolvedValue({
      ok: true,
      value: { paymentIntentId },
    });
  });

  it("passes only authenticated owner and exact idempotency/payment identities", async () => {
    const response = await POST(request(), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      data: { orderId, status: "ticketed", issuedTicketCount: 1 },
    });
    expect(mocks.complete).toHaveBeenCalledWith({
      customerId,
      orderId,
      idempotencyKey,
      paymentIntentId,
    });
  });

  it("fails closed before orchestration for cross-site, unauthenticated, and malformed requests", async () => {
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await POST(request(), { params: Promise.resolve({ orderId }) })).status).toBe(403);

    mocks.requireUser.mockResolvedValueOnce({ error: "Sign in required.", status: 401 });
    expect((await POST(request(), { params: Promise.resolve({ orderId }) })).status).toBe(401);

    mocks.idempotencyKey.mockReturnValueOnce(null);
    expect((await POST(request(), { params: Promise.resolve({ orderId }) })).status).toBe(400);

    mocks.readJson.mockResolvedValueOnce({ ok: true, value: { paymentIntentId: "bad" } });
    expect((await POST(request(), { params: Promise.resolve({ orderId }) })).status).toBe(400);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("returns a generic review-only failure without leaking provider or payment details", async () => {
    mocks.complete.mockRejectedValueOnce(new Error(
      "sk_test_secret ord_provider pi_provider raw passenger payload",
    ));
    const response = await POST(request(), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(409);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({
      error: "The test booking was not safely finalized. Its durable status must be reviewed before any retry.",
    });
    expect(JSON.stringify(body)).not.toMatch(/sk_test|ord_provider|pi_provider|passenger payload/i);
  });

  it("returns processing 409 without classifying the active owner as failed", async () => {
    mocks.complete.mockRejectedValueOnce(new FlightConsumerPreviewCompletionProcessingError());
    const response = await POST(request(), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "The test booking completion is already processing.",
    });
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.objectContaining({
      event: "order_failed",
    }));
  });
});
