import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recover: vi.fn(),
  requireUser: vi.fn(),
  sameOrigin: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/flights/consumer-preview/completion-recovery.server", () => ({
  recoverFlightConsumerPreviewCompletion: mocks.recover,
}));
vi.mock("@/lib/flights/consumer-preview/completion-lease-contract", async () => (
  import("../lib/flights/consumer-preview/completion-lease-contract")
));
vi.mock("@/lib/flights/consumer-preview/http.server", () => ({
  validateSameOriginMutation: mocks.sameOrigin,
  privateNoStoreJson(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  },
}));

import { POST } from "../app/api/flights/preview/orders/[orderId]/resume/route";
import { FlightConsumerPreviewCompletionProcessingError } from "../lib/flights/consumer-preview/completion-lease-contract";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";

describe("Flight Consumer Preview completion-resume route", () => {
  beforeEach(() => {
    mocks.sameOrigin.mockReset().mockReturnValue(true);
    mocks.requireUser.mockReset().mockResolvedValue({ user: { id: customerId } });
    mocks.recover.mockReset().mockResolvedValue({
      decision: "completed",
      orderId,
      status: "ticketed",
      issuedTicketCount: 1,
    });
  });

  function request() {
    return new Request(`https://preview.example.test/api/flights/preview/orders/${orderId}/resume`, {
      method: "POST",
    });
  }

  it("passes only authenticated owner/order identity to server-authoritative recovery", async () => {
    const response = await POST(request(), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.recover).toHaveBeenCalledWith({ customerId, orderId });
    expect(JSON.stringify(mocks.recover.mock.calls)).not.toMatch(/payment_intent|client_secret/i);
  });

  it("blocks cross-site, unauthenticated, malformed, and unsafe recovery", async () => {
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await POST(request(), { params: Promise.resolve({ orderId }) })).status).toBe(403);
    mocks.requireUser.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    expect((await POST(request(), { params: Promise.resolve({ orderId }) })).status).toBe(401);
    expect((await POST(request(), { params: Promise.resolve({ orderId: "bad" }) })).status).toBe(400);
    mocks.recover.mockRejectedValueOnce(new Error("sk_test_secret pi_secret ord_secret"));
    const failed = await POST(request(), { params: Promise.resolve({ orderId }) });
    expect(failed.status).toBe(409);
    expect(JSON.stringify(await failed.json())).not.toMatch(/sk_test|pi_secret|ord_secret/i);
  });

  it("returns accepted while an exact durable completion owner is still processing", async () => {
    mocks.recover.mockRejectedValueOnce(new FlightConsumerPreviewCompletionProcessingError());
    const response = await POST(request(), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { decision: "processing" } });
  });
});
