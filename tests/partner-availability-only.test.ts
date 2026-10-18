import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));

import { requireRole } from "@/lib/auth/require-role";
import { POST } from "../app/api/partner/rates/route";

const roomId = "d498ed39-d34f-498f-84d3-9fe523f8ce65";
const dates = ["2099-01-01", "2099-01-02"];

function setup(savedDates = dates, pmsOnly = false, updateError: unknown = null) {
  const update = vi.fn(() => ({
    eq: () => ({ gte: () => ({ lte: () => ({
      select: async () => ({ data: updateError ? null : dates.map((stay_date) => ({ stay_date })), error: updateError }),
    }) }) }),
  }));
  const from = vi.fn((table: string) => {
    if (table === "rooms") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: roomId, properties: { partner_id: "partner", pms_only: pmsOnly } }, error: null,
      }) }) }),
    };
    if (table === "inventory") return {
      select: () => ({ eq: () => ({ gte: () => ({
        lte: async () => ({ data: savedDates.map((stay_date) => ({ stay_date })), error: null }),
      }) }) }),
      update,
    };
    throw Error(`Unexpected table: ${table}`);
  });
  vi.mocked(requireRole).mockResolvedValue({
    user: { id: "admin" }, profile: { role: "admin" }, supabase: { from },
  } as never);
  return { from, update };
}

function request() {
  return new Request("http://localhost/api/partner/rates", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set_availability", roomId,
      startDate: dates[0], endDate: dates[1], availableUnits: 2 }),
  });
}

afterEach(() => vi.resetAllMocks());

describe("availability-only partner rate editor", () => {
  it("updates saved dates without sending price, tax, or fee fields", async () => {
    const { update } = setup();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({ available_units: 2 });
    expect((await response.json()).message).toContain("rates, taxes, and fees were unchanged");
  });

  it("refuses a date range with a missing saved night before writing", async () => {
    const { update } = setup([dates[0]]);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps PMS-only inventory read-only", async () => {
    const { from, update } = setup(dates, true);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(from).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("explains an active booking hold without retrying a blocked change", async () => {
    const { update } = setup(dates, false, {
      code: "P0001", message: "Active direct hotel offer inventory is immutable until release or expiry",
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(update).toHaveBeenCalledOnce();
    expect((await response.json()).error).toContain("active direct booking request");
  });
});
