import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockServiceRequestError extends Error {
    readonly kind: "conflict" | "unavailable";
    constructor(kind: "conflict" | "unavailable" = "unavailable") {
      super("safe service request error");
      this.kind = kind;
    }
  }
  return {
    MockServiceRequestError,
    create: vi.fn(),
    idempotency: vi.fn(),
    listAdmin: vi.fn(),
    listOwner: vi.fn(),
    readJson: vi.fn(),
    requireRole: vi.fn(),
    requireUser: vi.fn(),
    sameOrigin: vi.fn(),
  };
});

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/flights/consumer-preview/service-request-contract", async () => (
  import("../lib/flights/consumer-preview/service-request-contract")
));
vi.mock("@/lib/flights/consumer-preview/service-requests.server", () => ({
  FlightConsumerPreviewServiceRequestError: mocks.MockServiceRequestError,
  createFlightConsumerPreviewServiceRequest: mocks.create,
  listFlightConsumerPreviewServiceRequests: mocks.listOwner,
  listFlightConsumerPreviewAdminServiceRequests: mocks.listAdmin,
}));
vi.mock("@/lib/flights/consumer-preview/http.server", () => ({
  validateSameOriginMutation: mocks.sameOrigin,
  readPreviewIdempotencyKey: mocks.idempotency,
  readPreviewJson: mocks.readJson,
  privateNoStoreJson(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  },
}));

import { GET as listAdmin } from "../app/api/admin/flights/consumer-preview/service-requests/route";
import {
  GET as listOwner,
  POST as createOwner,
} from "../app/api/flights/preview/orders/[orderId]/service-requests/route";

const orderId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const supabase = { rpc: vi.fn() };

function request(path: string, method = "GET") {
  return new Request(`https://preview.example.test${path}`, { method });
}

describe("Flight Consumer Preview support request routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ supabase, user: { id: "owner" } });
    mocks.requireRole.mockResolvedValue({ supabase, user: { id: "admin" } });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.idempotency.mockReturnValue(idempotencyKey);
    mocks.readJson.mockResolvedValue({
      ok: true,
      value: { requestType: "cancel", reasonCode: "plans_changed" },
    });
    mocks.create.mockResolvedValue({ decision: "created", request: { id: "request" } });
    mocks.listOwner.mockResolvedValue([]);
    mocks.listAdmin.mockResolvedValue([]);
  });

  it("requires same-origin owner auth, UUID idempotency, and enum-only JSON", async () => {
    const response = await createOwner(request(
      `/api/flights/preview/orders/${orderId}/service-requests`,
      "POST",
    ), { params: Promise.resolve({ orderId }) });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.create).toHaveBeenCalledWith(supabase, {
      orderId,
      idempotencyKey,
      requestType: "cancel",
      reasonCode: "plans_changed",
    });

    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await createOwner(request(
      `/api/flights/preview/orders/${orderId}/service-requests`, "POST",
    ), { params: Promise.resolve({ orderId }) })).status).toBe(403);

    mocks.requireUser.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    expect((await createOwner(request(
      `/api/flights/preview/orders/${orderId}/service-requests`, "POST",
    ), { params: Promise.resolve({ orderId }) })).status).toBe(401);

    mocks.idempotency.mockReturnValueOnce(null);
    expect((await createOwner(request(
      `/api/flights/preview/orders/${orderId}/service-requests`, "POST",
    ), { params: Promise.resolve({ orderId }) })).status).toBe(400);

    mocks.readJson.mockResolvedValueOnce({
      ok: true,
      value: { requestType: "cancel", reasonCode: "plans_changed", message: "freeform PII" },
    });
    expect((await createOwner(request(
      `/api/flights/preview/orders/${orderId}/service-requests`, "POST",
    ), { params: Promise.resolve({ orderId }) })).status).toBe(400);
  });

  it("lists only through authenticated owner/admin RPC wrappers with bounded queries", async () => {
    const owner = await listOwner(request(
      `/api/flights/preview/orders/${orderId}/service-requests`,
    ), { params: Promise.resolve({ orderId }) });
    expect(owner.status).toBe(200);
    expect(mocks.listOwner).toHaveBeenCalledWith(supabase, { orderId });

    const admin = await listAdmin(request(
      "/api/admin/flights/consumer-preview/service-requests?status=requested&limit=25",
    ));
    expect(admin.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.listAdmin).toHaveBeenCalledWith(supabase, { limit: 25, status: "requested" });

    for (const query of [
      "status=unknown",
      "limit=0",
      "limit=101",
      "status=requested&status=failed",
      "unexpected=1",
    ]) {
      expect((await listAdmin(request(
        `/api/admin/flights/consumer-preview/service-requests?${query}`,
      ))).status).toBe(400);
    }
  });

  it("returns generic conflict/unavailable errors without leaking provider details", async () => {
    mocks.create.mockRejectedValueOnce(new mocks.MockServiceRequestError("conflict"));
    const conflict = await createOwner(request(
      `/api/flights/preview/orders/${orderId}/service-requests`, "POST",
    ), { params: Promise.resolve({ orderId }) });
    expect(conflict.status).toBe(409);
    expect(JSON.stringify(await conflict.json())).not.toMatch(/duffel|provider_ref|traveler_name|secret/i);

    mocks.create.mockRejectedValueOnce(new mocks.MockServiceRequestError());
    const unavailable = await createOwner(request(
      `/api/flights/preview/orders/${orderId}/service-requests`, "POST",
    ), { params: Promise.resolve({ orderId }) });
    expect(unavailable.status).toBe(503);
  });
});
