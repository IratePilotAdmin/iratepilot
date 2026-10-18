import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), createAdminClient: vi.fn(), enqueue: vi.fn(), inventory: [] as object[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from "../app/api/partner/integrations/booking-com/sync/route";

const propertyId = "11111111-1111-4111-8111-111111111111";
const partnerId = "22222222-2222-4222-8222-222222222222";
const roomId = "33333333-3333-4333-8333-333333333333";
const connectionId = "booking-e3bb11c9a74e4e239f3e74073f0e8311";
const syncId = "44444444-4444-4444-8444-444444444444";

function query(data: unknown) {
  const result = { data, error: null };
  const chain = {
    select: () => chain, eq: () => chain, in: () => chain, gte: () => chain, lte: () => chain,
    order: () => chain, limit: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

function request(windowIndex: number) {
  return new Request("https://www.iratepilot.com/api/partner/integrations/booking-com/sync", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyId, connectionId, syncId, startDate: "2026-11-01", currency: "USD", priceBasis: "before_tax", windowIndex }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inventory = Array.from({ length: 90 }, (_, offset) => ({
    room_id: roomId, stay_date: new Date(Date.UTC(2026, 10, 1 + offset)).toISOString().slice(0, 10),
    available_units: 1, rate: "125.00",
  }));
  mocks.requireRole.mockResolvedValue({ user: { id: "owner" }, profile: { role: "partner" }, supabase: {
    from(table: string) {
      if (table === "partners") return query({ id: partnerId, status: "approved" });
      if (table === "properties") return query({ id: propertyId, active: true });
      if (table === "rooms") return query([{ id: roomId }]);
      if (table === "inventory") return query(mocks.inventory);
      throw new Error(`Unexpected partner table ${table}`);
    },
  } });
  mocks.enqueue.mockResolvedValue({ data: { outcome: "queued", jobId: "job-1" }, error: null });
  mocks.createAdminClient.mockReturnValue({
    from(table: string) {
      if (table === "irp_ota_channel_connections") return query({
        connection_id: connectionId, property_id: propertyId, provider_property_id: "test-hotel-1", environment: "test",
      });
      if (table === "irp_ota_channel_room_mappings") return query([{
        provider_room_type_id: "NDQ2", provider_rate_plan_id: "BAR", local_room_id: roomId,
      }]);
      throw new Error(`Unexpected admin table ${table}`);
    },
    rpc: mocks.enqueue,
  });
});

describe("Booking.com year-window sync API", () => {
  it("queues only the requested bounded test window", async () => {
    const response = await POST(request(0));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ yearWindowIndex: 0, yearWindowCount: 5, startDate: "2026-11-01", endDate: "2027-01-29", environment: "test", dispatched: false });
    expect(body.queued).toBeGreaterThan(0);
    expect(mocks.enqueue).toHaveBeenCalled();
  });

  it("rejects an incomplete window before any ARI job is queued", async () => {
    mocks.inventory.pop();
    const response = await POST(request(0));
    expect(response.status).toBe(409);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range year window", async () => {
    const response = await POST(request(5));
    expect(response.status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
