import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "../app/api/admin/finance/route";

describe("admin finance fee reporting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requireRole.mockResolvedValue({ user: { id: "admin" }, profile: { role: "admin" } });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([401, 403])("rejects access with %s before creating a privileged database client", async (status) => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status });

    const response = await GET();

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Access denied." });
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reports recorded legacy, current, and custom fees without applying today's rate to history", async () => {
    const rows = [
      {
        id: "legacy",
        gross_room_revenue: "1000.00",
        partner_commission: "140.00",
        partner_net: "860.00",
        status: "eligible",
        stripe_transfer_status: "paid",
      },
      {
        id: "current",
        gross_room_revenue: "1000.00",
        partner_commission: "130.00",
        reward_program_fee: "30.00",
        partner_commission_rate_bps: 1300,
        reward_program_fee_rate_bps: 300,
        fee_schedule_version: "hotel_partner_commission_13_reward_fee_3_v1",
        partner_net: "840.00",
        status: "eligible",
        stripe_transfer_status: "paid",
      },
      {
        id: "custom-stored-schedule",
        gross_room_revenue: 200,
        partner_commission: 20,
        reward_program_fee: 4,
        partner_commission_rate_bps: 1000,
        reward_program_fee_rate_bps: 200,
        fee_schedule_version: "previous-contract",
        partner_net: 176,
        status: "eligible",
        stripe_transfer_status: "failed",
      },
      {
        id: "void",
        gross_room_revenue: 1000,
        partner_commission: 130,
        reward_program_fee: 30,
        partner_net: 840,
        status: "void",
        stripe_transfer_status: "reversed",
      },
    ];
    const originalRows = structuredClone(rows);
    mocks.order.mockResolvedValueOnce({ data: rows, error: null });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(["admin"]);
    expect(mocks.from).toHaveBeenCalledWith("booking_financials");
    const selectedColumns = String(mocks.select.mock.calls[0][0]).split(",");
    expect(selectedColumns).toEqual(expect.arrayContaining([
      "gross_room_revenue", "partner_commission", "reward_program_fee", "partner_net",
      "partner_commission_rate_bps", "reward_program_fee_rate_bps", "fee_schedule_version",
    ]));
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(body.summary).toEqual({
      gross: 2200,
      commission: 290,
      rewardProgramFee: 34,
      totalHotelDeductions: 324,
      partnerNet: 1876,
      paidTransfers: 2,
      reversedTransfers: 1,
      failedTransfers: 1,
    });
    expect(body.data).toEqual(originalRows);
    expect(rows).toEqual(originalRows);
    expect(body.data[0]).not.toHaveProperty("reward_program_fee");
    expect(body.data[0]).not.toHaveProperty("fee_schedule_version");
  });

  it("treats absent and null legacy rewards as zero instead of inventing a 3% deduction", async () => {
    const legacyRow = {
      gross_room_revenue: 1000,
      partner_commission: 140,
      partner_net: 860,
      status: "eligible",
      stripe_transfer_status: "not_started",
    };
    mocks.order.mockResolvedValueOnce({
      data: [legacyRow, { ...legacyRow, reward_program_fee: null }],
      error: null,
    });

    const body = await (await GET()).json();

    expect(body.summary).toMatchObject({
      gross: 2000,
      commission: 280,
      rewardProgramFee: 0,
      totalHotelDeductions: 280,
      partnerNet: 1720,
    });
  });

  it("returns an empty report when there are no accounting rows", async () => {
    mocks.order.mockResolvedValueOnce({ data: null, error: null });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      summary: {
        gross: 0, commission: 0, rewardProgramFee: 0, totalHotelDeductions: 0,
        partnerNet: 0, paidTransfers: 0, reversedTransfers: 0, failedTransfers: 0,
      },
    });
  });

  it("fails the report without returning partial totals or database details", async () => {
    mocks.order.mockResolvedValueOnce({
      data: [{ gross_room_revenue: 1000, partner_commission: 130, reward_program_fee: 30 }],
      error: new Error("Private database diagnostic: booking_financials snapshot mismatch"),
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Admin finance reporting could not be loaded." });
  });
});
