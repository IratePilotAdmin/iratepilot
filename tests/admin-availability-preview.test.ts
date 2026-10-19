import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { GET } from "../app/api/admin/properties/[id]/availability/route";

const propertyId = "33000000-0000-4000-8000-000000000033";
const roomId = "44000000-0000-4000-8000-000000000044";
const url = `https://example.test/api/admin/properties/${propertyId}/availability?checkIn=2099-10-25&checkOut=2099-10-26&guests=2`;

beforeEach(() => vi.resetAllMocks());

describe("private admin availability preview", () => {
  it("rejects unauthenticated access before using the server database key", async () => {
    mocks.auth.mockResolvedValue({ error: "Authentication required.", status: 401 });
    const response = await GET(new Request(url), { params: Promise.resolve({ id: propertyId }) });
    expect(response.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("shows only complete saved stay availability without opening booking", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-a" }, profile: { role: "admin" } });
    const from = vi.fn((table: string) => {
      if (table === "properties") return {
        select: () => ({ eq: () => ({ single: async () => ({
          data: { id: propertyId, name: "Synthetic Approval Hotel", active: true, pms_only: false, partners: [{ status: "approved" }] }, error: null,
        }) }) }),
      };
      if (table === "rooms") return {
        select: () => ({ eq: async () => ({ data: [
          { id: roomId, name: "Synthetic King", active: true, base_rate: 109, max_guests: 2 },
          { id: "55000000-0000-4000-8000-000000000055", name: "No Inventory", active: true, base_rate: 80, max_guests: 2 },
        ], error: null }) }),
      };
      if (table === "inventory") return {
        select: () => ({ in: () => ({ gte: () => ({ lt: async () => ({ data: [
          { room_id: roomId, stay_date: "2099-10-25", available_units: 1, rate: 109 },
        ], error: null }) }) }) }),
      };
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.admin.mockReturnValue({ from });

    const response = await GET(new Request(url), { params: Promise.resolve({ id: propertyId }) });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.mode).toBe("private-read-only");
    expect(result.bookingEnabled).toBe(false);
    expect(result.rooms).toEqual([{ id: roomId, name: "Synthetic King", averageNightlyRate: 109, staySubtotal: 109, maxGuests: 2 }]);
    expect(from).toHaveBeenCalledTimes(3);
  });
});
