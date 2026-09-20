import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentMode: vi.fn(),
  launchAuthorized: vi.fn(),
  requestClient: vi.fn(),
  adminClient: vi.fn(),
  stripe: vi.fn(),
}));

vi.mock("@/lib/stripe/booking-payment-mode", () => ({
  getApprovedBookingPaymentMode: mocks.paymentMode,
  getApprovedBookingMetadataMode: vi.fn(),
}));
vi.mock("@/lib/hotels/marketplace-launch-authorization", () => ({
  isHotelMarketplaceLaunchAuthorized: mocks.launchAuthorized,
}));
vi.mock("@/lib/supabase/request", () => ({ createRequestClient: mocks.requestClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.adminClient }));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.stripe }));
vi.mock("@/lib/stripe/live-payment-authorization", () => ({
  hasCurrentLivePaymentAuthorization: vi.fn(),
}));

import { POST } from "../app/api/bookings/[id]/payment-intent/route";

describe("live approved-reservation payment launch gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.paymentMode.mockReturnValue("live");
    mocks.launchAuthorized.mockResolvedValue(false);
  });

  it("blocks live payment creation before authentication, database, or Stripe access", async () => {
    const response = await POST(
      new Request("https://example.test/api/bookings/11111111-1111-4111-8111-111111111111/payment-intent", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Live payments require every production launch gate to pass.",
    });
    expect(mocks.launchAuthorized).toHaveBeenCalledOnce();
    expect(mocks.requestClient).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it("keeps the approved private-pilot test-payment path independent", async () => {
    mocks.paymentMode.mockReturnValue("test");
    mocks.requestClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await POST(
      new Request("https://example.test/api/bookings/11111111-1111-4111-8111-111111111111/payment-intent", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.launchAuthorized).not.toHaveBeenCalled();
    expect(mocks.requestClient).toHaveBeenCalledOnce();
  });
});
