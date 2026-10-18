import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));

import { requireRole } from "@/lib/auth/require-role";
import { POST } from "../app/api/partner/rates/route";

const roomId = "d498ed39-d34f-498f-84d3-9fe523f8ce65";
const dates = ["2099-01-01", "2099-01-02"];

function setup(pmsOnly = false, rpcResult: { data: number | null; error: unknown } = { data: 2, error: null }) {
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn((table: string) => {
    if (table === "rooms") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: roomId, properties: { partner_id: "partner", pms_only: pmsOnly } }, error: null,
      }) }) }),
    };
    throw Error(`Unexpected table: ${table}`);
  });
  vi.mocked(requireRole).mockResolvedValue({
    user: { id: "admin" }, profile: { role: "admin" }, supabase: { from, rpc },
  } as never);
  return { from, rpc };
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
  it("requests one atomic availability-only operation", async () => {
    const { from, rpc } = setup();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("set_partner_inventory_availability", {
      p_room_id: roomId, p_start_date: dates[0], p_end_date: dates[1], p_available_units: 2,
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect((await response.json()).message).toContain("rates, taxes, and fees were unchanged");
  });

  it("explains a missing saved night without retrying", async () => {
    const { rpc } = setup(false, { data: null, error: {
      code: "P0001", message: "One or more dates have no saved inventory",
    } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledOnce();
    expect((await response.json()).error).toContain("no saved inventory");
  });

  it("keeps PMS-only inventory read-only", async () => {
    const { from, rpc } = setup(true);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("explains an active booking hold without retrying a blocked change", async () => {
    const { rpc } = setup(false, { data: null, error: {
      code: "P0001", message: "Active direct hotel offer inventory is immutable until release or expiry",
    } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledOnce();
    expect((await response.json()).error).toContain("active direct booking request");
  });
});
