import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTravelPlan: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/ai/openai-provider", async () => {
  const { z } = await import("zod");
  return {
    createTravelPlan: mocks.createTravelPlan,
    travelPlanRequestSchema: z.object({ message: z.string().trim().min(3).max(2_000) }),
  };
});

import { POST } from "../app/api/ai/travel/route";

function request(body: BodyInit = JSON.stringify({ message: "Plan a weekend in Miami" })) {
  return new Request("https://www.iratepilot.com/api/ai/travel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("OpenAI travel route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { allowed: true, retry_after_seconds: 0 },
        error: null,
      }),
    };
    mocks.requireRole.mockResolvedValue({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      profile: { role: "customer" },
      supabase,
    });
    mocks.createTravelPlan.mockResolvedValue({ message: "A concise plan", model: "gpt-5.6-luna" });
  });

  it("authenticates and returns an uncached server-generated plan", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ message: "A concise plan", model: "gpt-5.6-luna" });
    expect(mocks.requireRole).toHaveBeenCalledWith(["customer", "partner", "admin"]);
    expect(mocks.createTravelPlan).toHaveBeenCalledWith("Plan a weekend in Miami");
    const auth = await mocks.requireRole.mock.results[0]?.value;
    expect(auth.supabase.rpc).toHaveBeenCalledWith("reserve_ai_travel_request_slot", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("stops before parsing input when authentication fails", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Authentication required.", status: 401 });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(401);
    expect(mocks.createTravelPlan).not.toHaveBeenCalled();
  });

  it("rejects oversized or malformed input without calling OpenAI", async () => {
    const response = await POST(request(JSON.stringify({ message: "x".repeat(2_001) })));
    expect(response.status).toBe(400);
    expect(mocks.createTravelPlan).not.toHaveBeenCalled();
    const auth = await mocks.requireRole.mock.results[0]?.value;
    expect(auth.supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns a retry window without calling OpenAI when the account quota is exhausted", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { allowed: false, retry_after_seconds: 317 },
        error: null,
      }),
    };
    mocks.requireRole.mockResolvedValueOnce({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      profile: { role: "customer" },
      supabase,
    });

    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("317");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createTravelPlan).not.toHaveBeenCalled();
  });

  it("fails closed when distributed admission cannot be verified", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "P0001" },
      }),
    };
    mocks.requireRole.mockResolvedValueOnce({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      profile: { role: "customer" },
      supabase,
    });

    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.createTravelPlan).not.toHaveBeenCalled();
  });

  it("fails closed when the explicit provider gate is disabled", async () => {
    mocks.createTravelPlan.mockRejectedValueOnce(new Error("OPENAI_PROVIDER_DISABLED"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "The AI travel planner is not enabled yet." });
  });
});
