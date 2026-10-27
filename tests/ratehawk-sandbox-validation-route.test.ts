import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), runValidation: vi.fn(), createAdminClient: vi.fn(), from: vi.fn(),
  insert: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/services/hotel-suppliers/ratehawk-sandbox-validation.server", () => ({
  RatehawkSandboxValidationError: class RatehawkSandboxValidationError extends Error {
    constructor(readonly code: string) { super(code); }
  },
  runRatehawkSandboxValidation: mocks.runValidation,
}));

import { GET, POST } from "../app/api/admin/integrations/inventory/ratehawk/validate/route";

const validationResult = {
  testedAt: "2026-10-27T12:00:00.000Z", checkin: "2026-11-26", checkout: "2026-11-28",
  hotelCount: 1, rateCount: 18,
};

describe("RateHawk sandbox validation route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.runValidation.mockResolvedValue(validationResult);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.limit.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.order.mockReturnValue({ limit: mocks.limit });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  it("checks admin access before contacting RateHawk or the database", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });
    const response = await POST();
    expect(response.status).toBe(403);
    expect(mocks.runValidation).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("records only safe validation evidence", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "08b4c025e83d57a28e4bf8eeb6183d61fd5a5e02";
    const response = await POST();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.from).toHaveBeenCalledWith("inventory_supplier_validation_evidence");
    expect(mocks.insert).toHaveBeenCalledWith({
      supplier_id: "ratehawk", environment: "sandbox", validation_kind: "hotel_search", result: "passed",
      checkin: "2026-11-26", checkout: "2026-11-28", hotel_count: 1, rate_count: 18,
      tested_by: "admin-1", tested_at: "2026-10-27T12:00:00.000Z",
      deployment_revision: "08b4c025e83d57a28e4bf8eeb6183d61fd5a5e02",
    });
    const body = await response.json();
    expect(body).toEqual({
      ...validationResult, validationPassed: true, evidenceRecorded: true,
      message: "RateHawk sandbox search passed and its evidence was saved. No booking or payment was created.",
    });
    expect(JSON.stringify(body)).not.toMatch(/api.?key|credential|raw.?response/i);
  });

  it("reports a passed validation as incomplete when evidence cannot be saved", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { message: "database detail" } });
    const response = await POST();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ...validationResult, validationPassed: true, evidenceRecorded: false,
      error: "RateHawk sandbox search passed, but its evidence could not be saved.",
    });
  });

  it("returns the latest safe evidence without contacting RateHawk", async () => {
    const latestEvidence = {
      tested_at: "2026-10-27T12:00:00.000Z", checkin: "2026-11-26", checkout: "2026-11-28",
      hotel_count: 1, rate_count: 18, deployment_revision: null,
    };
    mocks.maybeSingle.mockResolvedValueOnce({ data: latestEvidence, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ evidenceAvailable: true, latestEvidence });
    expect(mocks.runValidation).not.toHaveBeenCalled();
  });
});
