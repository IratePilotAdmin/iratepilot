import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));

import { requireRole } from "@/lib/auth/require-role";
import { PATCH } from "../app/api/revenue/recommendations/[id]/route";

const context = { params: Promise.resolve({ id: "recommendation-id" }) };
const request = (decision: "approve" | "reject") => new Request("http://localhost/api/revenue/recommendations/recommendation-id", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
});

afterEach(() => {
  delete process.env.REVENUE_AI_ENABLED;
  vi.resetAllMocks();
});

describe("Revenue AI review activation", () => {
  it("does not authenticate or write a rate while release is disabled", async () => {
    const response = await PATCH(request("approve"), context);
    expect(response.status).toBe(503);
    expect(requireRole).not.toHaveBeenCalled();
  });

  it("prevents PMS-only approval even when revenue review is enabled", async () => {
    process.env.REVENUE_AI_ENABLED = "true";
    const rpc = vi.fn();
    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "owner" }, profile: { role: "partner" },
      supabase: {
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({
          data: { status: "pending", properties: { pms_only: true, partners: { owner_id: "owner", status: "approved" } } },
        }) }) }) }), rpc,
      },
    } as never);
    const response = await PATCH(request("approve"), context);
    expect(response.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows a verified owner to reject through the review RPC", async () => {
    process.env.REVENUE_AI_ENABLED = "true";
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "owner" }, profile: { role: "partner" },
      supabase: {
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({
          data: { status: "pending", properties: { pms_only: true, partners: { owner_id: "owner", status: "approved" } } },
        }) }) }) }), rpc,
      },
    } as never);
    const response = await PATCH(request("reject"), context);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("review_revenue_recommendation", { p_recommendation_id: "recommendation-id", p_decision: "reject" });
  });
});
