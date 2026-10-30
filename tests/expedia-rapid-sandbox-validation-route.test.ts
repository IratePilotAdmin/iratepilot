import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    }),
  },
}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), runValidation: vi.fn(), createAdminClient: vi.fn(), from: vi.fn(),
  insert: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/services/hotel-suppliers/expedia-rapid-sandbox-validation.server", () => ({
  ExpediaRapidSandboxValidationError: class ExpediaRapidSandboxValidationError extends Error {
    constructor(readonly code: string) { super(code); }
  },
  runExpediaRapidSandboxValidation: mocks.runValidation,
}));

import { GET, POST } from "../app/api/admin/integrations/inventory/expedia-rapid/validate/route";

const validationResult = {
  testedAt: "2026-10-30T12:00:00.000Z", checkin: "2026-11-29", checkout: "2026-12-01",
  hotelCount: 1, rateCount: 2,
};

describe("Expedia Rapid sandbox validation route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.runValidation.mockResolvedValue(validationResult);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.limit.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.order.mockReturnValue({ limit: mocks.limit });
    mocks.eq.mockReturnValue({ eq: mocks.eq, order: mocks.order });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  it("checks admin access before contacting Expedia or the database", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });
    const response = await POST();
    expect(response.status).toBe(403);
    expect(mocks.runValidation).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("records only safe validation evidence", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "43ac267b1c3f74e2f90b3231a89106c81e523ec0";
    const response = await POST();
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({
      supplier_id: "expedia-rapid", environment: "sandbox", validation_kind: "hotel_search", result: "passed",
      checkin: "2026-11-29", checkout: "2026-12-01", hotel_count: 1, rate_count: 2,
      tested_by: "admin-1", tested_at: "2026-10-30T12:00:00.000Z",
      deployment_revision: "43ac267b1c3f74e2f90b3231a89106c81e523ec0",
    });
    expect(await response.json()).toEqual({
      ...validationResult, validationPassed: true, evidenceRecorded: true,
      message: "Expedia Rapid sandbox search passed and its evidence was saved. No booking or payment was created.",
    });
  });

  it("returns the latest safe evidence without contacting Expedia", async () => {
    const latestEvidence = {
      tested_at: "2026-10-30T12:00:00.000Z", checkin: "2026-11-29", checkout: "2026-12-01",
      hotel_count: 1, rate_count: 2, deployment_revision: null,
    };
    mocks.maybeSingle.mockResolvedValueOnce({ data: latestEvidence, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ evidenceAvailable: true, latestEvidence });
    expect(mocks.runValidation).not.toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("supplier_id", "expedia-rapid");
  });
});
