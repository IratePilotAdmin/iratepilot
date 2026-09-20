import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentMode: vi.fn(),
  launchAuthorized: vi.fn(),
  requestClient: vi.fn(),
}));

vi.mock("@/lib/stripe/booking-payment-mode", () => ({
  getApprovedBookingPaymentMode: mocks.paymentMode,
}));
vi.mock("@/lib/hotels/marketplace-launch-authorization", () => ({
  isHotelMarketplaceLaunchAuthorized: mocks.launchAuthorized,
}));
vi.mock("@/lib/supabase/request", () => ({
  createRequestClient: mocks.requestClient,
}));
vi.mock("@/config/fees", () => ({ fees: { serviceFeeRate: 0.03 } }));
vi.mock("@/config/memberships", () => ({ memberships: {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/validation", () => ({
  bookingSchema: { safeParse: () => ({ success: false }) },
}));
vi.mock("@/lib/bookings/stay-pricing", () => ({ calculateVerifiedStayPricing: vi.fn() }));
vi.mock("@/lib/memberships/eligibility", () => ({ getActiveMembershipTier: vi.fn() }));
vi.mock("@/lib/email/booking-notifications", () => ({ queueBookingNotification: vi.fn() }));

import { POST } from "../app/api/bookings/route";

beforeEach(() => {
  vi.resetAllMocks();
  process.env.PILOT_MODE = "false";
  mocks.paymentMode.mockReturnValue("live");
  mocks.launchAuthorized.mockResolvedValue(false);
});

afterEach(() => {
  delete process.env.PILOT_MODE;
});

describe("commercial booking launch gate", () => {
  it("blocks direct commercial booking requests before authentication or database access", async () => {
    const response = await POST(new Request("https://example.test/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Commercial booking requests require every production launch gate to pass.",
    });
    expect(mocks.launchAuthorized).toHaveBeenCalledOnce();
    expect(mocks.requestClient).not.toHaveBeenCalled();
  });

  it("preserves the separately controlled private-pilot request flow", async () => {
    process.env.PILOT_MODE = "true";
    mocks.paymentMode.mockReturnValue(null);

    const response = await POST(new Request("https://example.test/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    expect(mocks.launchAuthorized).not.toHaveBeenCalled();
    expect(mocks.requestClient).not.toHaveBeenCalled();
  });
});
