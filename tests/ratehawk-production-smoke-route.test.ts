import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  runSmoke: vi.fn(),
  createAdminClient: vi.fn(),
  insert: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/services/hotel-suppliers/ratehawk-production-smoke.server", () => ({
  RatehawkProductionSmokeError: class RatehawkProductionSmokeError extends Error {},
  runRatehawkProductionSmoke: mocks.runSmoke,
}));

import { GET, POST } from "../app/api/admin/integrations/inventory/ratehawk/production-smoke/route";

const smokeResult = {
  testedAt: "2026-11-01T12:00:00.000Z",
  checkin: "2026-12-01",
  checkout: "2026-12-03",
  hotelCount: 1,
  rateCount: 3,
};

function query() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.maybeSingle = mocks.maybeSingle;
  return builder;
}

describe("RateHawk production smoke route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.runSmoke.mockResolvedValue(smokeResult);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.createAdminClient.mockImplementation(() => ({
      from: () => ({ ...query(), insert: mocks.insert }),
    }));
  });

  it("requires an administrator and an explicit production confirmation", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });
    expect((await POST(new Request("https://example.test", { method: "POST", body: "{}" }))).status).toBe(403);
    expect(mocks.runSmoke).not.toHaveBeenCalled();

    const response = await POST(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "wrong" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.runSmoke).not.toHaveBeenCalled();
  });

  it("records only sanitized read-only production evidence", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "1234567890abcdef";
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "RUN RATEHAWK PRODUCTION SMOKE" }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({
      supplier_id: "ratehawk",
      environment: "production",
      validation_kind: "production_smoke",
      result: "passed",
      checkin: "2026-12-01",
      checkout: "2026-12-03",
      hotel_count: 1,
      rate_count: 3,
      price_changed: null,
      tested_by: "admin-1",
      tested_at: "2026-11-01T12:00:00.000Z",
      deployment_revision: "1234567890abcdef",
    });
    const body = await response.json();
    expect(body.evidenceRecorded).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/api.?key|credential|raw.?response/i);
  });

  it("returns the latest production receipt without contacting RateHawk", async () => {
    const evidence = { tested_at: smokeResult.testedAt, hotel_count: 1, rate_count: 3 };
    mocks.maybeSingle.mockResolvedValueOnce({ data: evidence, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ evidenceAvailable: true, latestEvidence: evidence });
    expect(mocks.runSmoke).not.toHaveBeenCalled();
  });
});
