import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  runValidation: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/services/hotel-suppliers/ratehawk-sandbox-validation.server", () => ({
  RatehawkSandboxValidationError: class RatehawkSandboxValidationError extends Error {
    constructor(readonly code: string) { super(code); }
  },
  runRatehawkSandboxValidation: mocks.runValidation,
}));

import { POST } from "../app/api/admin/integrations/inventory/ratehawk/validate/route";

describe("RateHawk sandbox validation route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.runValidation.mockResolvedValue({
      testedAt: "2026-10-27T12:00:00.000Z",
      checkin: "2026-11-26",
      checkout: "2026-11-28",
      hotelCount: 1,
      rateCount: 18,
    });
  });

  it("checks admin access before contacting RateHawk", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });
    const response = await POST();
    expect(response.status).toBe(403);
    expect(mocks.runValidation).not.toHaveBeenCalled();
  });

  it("returns only a safe validation summary", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      testedAt: "2026-10-27T12:00:00.000Z",
      checkin: "2026-11-26",
      checkout: "2026-11-28",
      hotelCount: 1,
      rateCount: 18,
      message: "RateHawk sandbox search passed. No booking or payment was created.",
    });
  });
});
