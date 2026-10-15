import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), createAdminClient: vi.fn(), filters: new Map<string, unknown>(), selects: new Map<string, string>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "@/app/api/partner/integrations/booking-com/health/route";

const userId = "33333333-3333-4333-8333-333333333333";
const partnerId = "22222222-2222-4222-8222-222222222222";
const propertyId = "11111111-1111-4111-8111-111111111111";
const connectionId = "booking-e3bb11c9a74e4e239f3e74073f0e8311";

const data: Record<string, unknown[]> = {
  irp_ota_channel_connections: [{
    connection_id: connectionId, property_id: propertyId, environment: "test", enabled: false,
    partner_approved: false, pii_compliance_approved: false, updated_at: "2026-09-25T12:00:00Z",
  }],
  irp_ota_reservation_inbox: [
    { connection_id: connectionId, status: "review", event_kind: "new", result_code: "pms_review_required", received_at: "2026-09-25T12:02:00Z" },
    { connection_id: connectionId, status: "review", event_kind: "new", result_code: "payment_treatment_required", received_at: "2026-09-25T12:01:00Z" },
    { connection_id: connectionId, status: "imported", event_kind: "cancelled", result_code: "pms_persisted_and_provider_acknowledged", received_at: "2026-09-25T11:00:00Z" },
  ],
  irp_ota_ari_outbox: [{
    connection_id: connectionId, status: "retry", request_kind: "rate", last_http_status: 503, updated_at: "2026-09-25T12:02:00Z",
  }],
};

function result(table: string) {
  const query: Record<string, unknown> = {
    select: (columns: string) => { mocks.selects.set(table, columns); return query; },
    eq: (key: string, value: unknown) => { mocks.filters.set(`${table}.${key}`, value); return query; },
    in: (key: string, value: unknown) => { mocks.filters.set(`${table}.${key}`, value); return query; },
    order: () => query,
    limit: async () => ({ data: data[table] ?? [], error: null }),
    maybeSingle: async () => table === "partners"
      ? { data: mocks.filters.get("partners.owner_id") === userId ? { id: partnerId, status: "approved" } : null, error: null }
      : { data: null, error: null },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({
      data: table === "properties" ? [{ id: propertyId, name: "Test Hotel", active: true }] : data[table] ?? [], error: null,
    }).then(resolve, reject),
  };
  return query;
}

function authContext() {
  return {
    user: { id: userId }, profile: { role: "partner" },
    supabase: { from: (table: string) => result(table) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters.clear();
  mocks.selects.clear();
  mocks.requireRole.mockResolvedValue(authContext());
  mocks.createAdminClient.mockReturnValue({ from: (table: string) => result(table) });
});

describe("Booking.com partner health view", () => {
  it("requires an authenticated partner", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns only safe queue metadata scoped to owned test properties", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.connections[0]).toMatchObject({
      environment: "test",
      reservations: {
        recentCount: 3, statuses: { received: 0, leased: 0, imported: 1, review: 2 },
        reviewReasons: [{ code: "payment_treatment_required", count: 1 }, { code: "pms_review_required", count: 1 }],
        recentReviewEvents: [
          { eventKind: "new", code: "pms_review_required", receivedAt: "2026-09-25T12:02:00Z" },
          { eventKind: "new", code: "payment_treatment_required", receivedAt: "2026-09-25T12:01:00Z" },
        ],
      },
      availabilityAndRates: { recentCount: 1, statuses: { queued: 0, retry: 1, processing: 0, sent: 0, review: 0 }, lastHttpStatus: 503 },
    });
    expect(mocks.filters.get("irp_ota_channel_connections.property_id")).toEqual([propertyId]);
    expect(mocks.selects.get("irp_ota_reservation_inbox")).toBe("connection_id,status,event_kind,result_code,received_at");
    expect(JSON.stringify(body.connections)).not.toMatch(/payload|reservationId|ciphertext/i);
    expect(JSON.stringify(body.connections)).not.toMatch(/guest|email|phone/i);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("normalizes unexpected event kinds and omits malformed review codes", async () => {
    const original = data.irp_ota_reservation_inbox;
    data.irp_ota_reservation_inbox = [{
      connection_id: connectionId, status: "review", event_kind: "<script>alert(1)</script>",
      result_code: "guest@example.com", received_at: "2026-09-25T12:03:00Z",
    }];
    try {
      const response = await GET();
      const body = await response.json();
      expect(body.connections[0].reservations).toMatchObject({
        reviewReasons: [],
        recentReviewEvents: [{ eventKind: "unknown", code: "unknown_review_reason", receivedAt: "2026-09-25T12:03:00Z" }],
      });
      expect(JSON.stringify(body.connections)).not.toContain("<script>");
      expect(JSON.stringify(body.connections)).not.toContain("guest@example.com");
    } finally {
      data.irp_ota_reservation_inbox = original;
    }
  });
});
