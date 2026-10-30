import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  runScenario: vi.fn(),
  classifyFailure: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/services/hotel-suppliers/ratehawk-certification-runner.server", () => ({
  ratehawkCertificationScenarioIds: [
    "children", "citizenship", "multiroom", "price_change", "unknown_success",
    "unknown_soldout", "unknown_book_limit",
  ],
  runRatehawkCertificationScenario: mocks.runScenario,
  classifyRatehawkCertificationFailure: mocks.classifyFailure,
}));

import { GET, POST } from "../app/api/admin/integrations/inventory/ratehawk/certification/route";

const result = {
  scenario: "unknown_soldout",
  partnerOrderId: "certification-order_unknown_soldout",
  finalStatus: "failed",
  finalError: "soldout",
  bookingFormAttempts: 1,
  statusAttempts: 2,
  cancelled: false,
  cancellationAmount: null,
  cancellationCurrency: null,
};

function request() {
  return new Request("https://example.test/api/admin/integrations/inventory/ratehawk/certification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario: "unknown_soldout",
      confirmation: "RUN RATEHAWK SANDBOX CERTIFICATION",
    }),
  });
}

describe("RateHawk certification route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T21:15:00.000Z"));
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.runScenario.mockResolvedValue(result);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.limit.mockResolvedValue({ data: [], error: null });
    mocks.order.mockReturnValue({ limit: mocks.limit });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  it("loads the latest saved result for each certification scenario", async () => {
    mocks.limit.mockResolvedValueOnce({
      data: [
        {
          scenario: "unknown_soldout",
          partner_order_id: "latest-order_unknown_soldout",
          final_status: "failed",
          final_error: "soldout",
          booking_form_attempts: 1,
          status_attempts: 2,
          cancelled: false,
          cancellation_amount: null,
          cancellation_currency: null,
          tested_at: "2026-10-29T22:00:00.000Z",
        },
        {
          scenario: "unknown_soldout",
          partner_order_id: "older-order_unknown_soldout",
          final_status: "failed",
          final_error: "soldout",
          booking_form_attempts: 1,
          status_attempts: 2,
          cancelled: false,
          cancellation_amount: null,
          cancellation_currency: null,
          tested_at: "2026-10-29T21:00:00.000Z",
        },
      ],
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("ratehawk_certification_receipts");
    expect(mocks.eq).toHaveBeenCalledWith("result", "passed");
    expect(mocks.order).toHaveBeenCalledWith("tested_at", { ascending: false });
    expect(await response.json()).toEqual({
      results: [{
        scenario: "unknown_soldout",
        partnerOrderId: "latest-order_unknown_soldout",
        finalStatus: "failed",
        finalError: "soldout",
        bookingFormAttempts: 1,
        statusAttempts: 2,
        cancelled: false,
        cancellationAmount: null,
        cancellationCurrency: null,
      }],
    });
  });

  it("authorizes the administrator before loading saved evidence", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("records an expected sold-out result as passed certification evidence", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "8f15c58d24a";
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("ratehawk_certification_receipts");
    expect(mocks.insert).toHaveBeenCalledWith({
      scenario: "unknown_soldout",
      result: "passed",
      partner_order_id: "certification-order_unknown_soldout",
      final_status: "failed",
      final_error: "soldout",
      booking_form_attempts: 1,
      status_attempts: 2,
      cancelled: false,
      cancellation_amount: null,
      cancellation_currency: null,
      tested_by: "admin-1",
      tested_at: "2026-10-29T21:15:00.000Z",
      deployment_revision: "8f15c58d24a",
    });
    expect(await response.json()).toEqual({
      result,
      certificationPassed: true,
      evidenceRecorded: true,
      message: "RateHawk sandbox certification scenario completed and its evidence was saved. No production traffic or customer payment was used.",
    });
  });

  it("does not claim completion when the receipt cannot be saved", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { message: "database detail" } });
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      result,
      certificationPassed: true,
      evidenceRecorded: false,
      error: "The RateHawk sandbox certification scenario passed, but its evidence could not be saved.",
    });
  });

  it("authorizes the administrator before supplier or database work", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });
    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.runScenario).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
