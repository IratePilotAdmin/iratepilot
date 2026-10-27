import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), runEvidence: vi.fn(), createAdminClient: vi.fn(), from: vi.fn(),
  insert: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/services/hotel-suppliers/ratehawk-prebook-evidence.server", () => ({
  runRatehawkSandboxPrebookEvidence: mocks.runEvidence,
}));

import { GET, POST } from "../app/api/admin/integrations/inventory/ratehawk/prebook/route";

const evidenceResult = {
  testedAt: "2026-10-27T12:00:00.000Z",
  checkin: "2026-11-26",
  checkout: "2026-11-28",
  hotelCount: 1,
  rateCount: 1,
  priceChanged: false,
};

describe("RateHawk sandbox prebook route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.runEvidence.mockResolvedValue(evidenceResult);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.limit.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.order.mockReturnValue({ limit: mocks.limit });
    mocks.eq.mockReturnValue({ eq: mocks.eq, order: mocks.order });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  it("checks admin access before contacting RateHawk or the database", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });
    const response = await POST();
    expect(response.status).toBe(403);
    expect(mocks.runEvidence).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("records only safe prebook evidence", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "08b4c025e83d57a28e4bf8eeb6183d61fd5a5e02";
    const response = await POST();
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({
      supplier_id: "ratehawk", environment: "sandbox", validation_kind: "hotel_prebook", result: "passed",
      checkin: "2026-11-26", checkout: "2026-11-28", hotel_count: 1, rate_count: 1,
      price_changed: false, tested_by: "admin-1", tested_at: "2026-10-27T12:00:00.000Z",
      deployment_revision: "08b4c025e83d57a28e4bf8eeb6183d61fd5a5e02",
    });
    const body = await response.json();
    expect(body).toEqual({
      ...evidenceResult, validationPassed: true, evidenceRecorded: true,
      message: "RateHawk sandbox search and prebook passed. No booking or payment was created.",
    });
    expect(JSON.stringify(body)).not.toMatch(/book.?hash|api.?key|credential|raw.?response/i);
  });

  it("returns the latest sanitized prebook evidence without contacting RateHawk", async () => {
    const latestEvidence = {
      tested_at: "2026-10-27T12:00:00.000Z", checkin: "2026-11-26", checkout: "2026-11-28",
      hotel_count: 1, rate_count: 1, price_changed: false, deployment_revision: null,
    };
    mocks.maybeSingle.mockResolvedValueOnce({ data: latestEvidence, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ evidenceAvailable: true, latestEvidence });
    expect(mocks.eq).toHaveBeenCalledWith("validation_kind", "hotel_prebook");
    expect(mocks.runEvidence).not.toHaveBeenCalled();
  });
});
