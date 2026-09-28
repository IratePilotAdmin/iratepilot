import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));

import { requireRole } from "@/lib/auth/require-role";
import { POST } from "../app/api/partner/rates/route";

const roomId = "d498ed39-d34f-498f-84d3-9fe523f8ce65";

afterEach(() => vi.resetAllMocks());

describe("PMS-only partner rate editor", () => {
  it.each([
    { action: "update_room", name: "King", maxGuests: 2, baseRate: 110, active: true },
    { action: "set_inventory", roomId, startDate: "2026-10-01", endDate: "2026-10-01", availableUnits: 3, rate: 110 },
  ])("blocks $action before writing when the room relation is an object", async (body) => {
    const update = vi.fn();
    const upsert = vi.fn();
    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "admin" }, profile: { role: "admin" },
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({
              data: { id: roomId, base_rate: 100, properties: { partner_id: "partner", pms_only: true } },
              error: null,
            }) }),
          }),
          update, upsert,
        }),
      },
    } as never);
    const request = new Request("http://localhost/api/partner/rates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, roomId }),
    });
    const response = await POST(request);
    expect(response.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
