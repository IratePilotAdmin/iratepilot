import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), createAdminClient: vi.fn(), saved: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { PUT } from "../app/api/partner/integrations/booking-com/mappings/route";

const userId = "33333333-3333-4333-8333-333333333333";
const partnerId = "22222222-2222-4222-8222-222222222222";
const propertyId = "11111111-1111-4111-8111-111111111111";
const roomId = "44444444-4444-4444-8444-444444444444";
const connectionId = "booking-e3bb11c9a74e4e239f3e74073f0e8311";

function queryResult() {
  const filters = new Map<string, unknown>();
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
    maybeSingle: async () => {
      if (filters.get("owner_id") === userId) return { data: { id: partnerId, status: "approved" }, error: null };
      if (filters.get("partner_id") === partnerId && filters.get("id") === propertyId) return { data: { id: propertyId, active: true }, error: null };
      if (filters.get("property_id") === propertyId && filters.get("id") === roomId) return { data: { id: roomId }, error: null };
      if (filters.get("connection_id") === connectionId && filters.get("property_id") === propertyId) return { data: { connection_id: connectionId }, error: null };
      return { data: null, error: null };
    },
    upsert: (value: unknown, options: unknown) => {
      mocks.saved(value, options);
      return { select: () => ({ single: async () => ({ data: { ...value as object }, error: null }) }) };
    },
  };
  return query;
}

function context() {
  return {
    user: { id: userId }, profile: { role: "partner" },
    supabase: {
      from(table: string) {
        if (table === "partners") return queryResult();
        if (table === "properties") return queryResult();
        if (table === "rooms") return queryResult();
        throw new Error(`Unexpected partner table: ${table}`);
      },
    },
  };
}

function request(payload: Record<string, unknown>) {
  return new Request("https://pms.iratepilot.com/api/partner/integrations/booking-com/mappings", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue(context());
  mocks.createAdminClient.mockReturnValue({
    from(table: string) {
      if (table !== "irp_ota_channel_connections" && table !== "irp_ota_channel_room_mappings") throw new Error("Unexpected admin table");
      return queryResult();
    },
  });
});

describe("Booking.com room mapping API", () => {
  it("rejects a room outside the partner's property before saving a mapping", async () => {
    const response = await PUT(request({
      propertyId, connectionId, providerRoomTypeId: "DLX-K", providerRatePlanId: "BAR", localRoomId: "55555555-5555-4555-8555-555555555555",
    }));
    expect(response.status).toBe(404);
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it("saves the exact test mapping after confirming property, room, and connection scope", async () => {
    const response = await PUT(request({ propertyId, connectionId, providerRoomTypeId: "DLX-K", providerRatePlanId: "BAR", localRoomId: roomId }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.message).toContain("remains disabled");
    expect(mocks.saved).toHaveBeenCalledWith({
      connection_id: connectionId, provider_room_type_id: "DLX-K", provider_rate_plan_id: "BAR", local_room_id: roomId,
    }, { onConflict: "connection_id,provider_room_type_id,provider_rate_plan_id" });
  });

  it("rejects extra or malformed mapping fields", async () => {
    const response = await PUT(request({ propertyId, connectionId, providerRoomTypeId: "../bad", providerRatePlanId: "BAR", localRoomId: roomId }));
    expect(response.status).toBe(400);
    expect(mocks.saved).not.toHaveBeenCalled();
  });
});
