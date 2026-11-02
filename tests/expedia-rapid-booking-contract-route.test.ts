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

const mocks = vi.hoisted(() => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));

import { POST } from "../app/api/admin/integrations/inventory/expedia-rapid/booking-contract/route";

describe("Expedia Rapid booking contract route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
  });

  it("checks admin access before validating the local contract", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 403 });
    const response = await POST();
    expect(response.status).toBe(403);
  });

  it("returns complete PII-free software coverage without contacting Expedia", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      softwareContractOnly: true,
      supplierRequestSent: false,
      bookingCreated: false,
      paymentCreated: false,
      requirementCoverage: {
        TR1: true,
        TR3: true,
        TR3a: true,
        TR3b: true,
        TR3c: true,
        TR4: true,
        TR5: true,
        TR5a: true,
        TR5b: true,
      },
      errorHandlingCoverage: { TR7: true },
      operationalLogging: {
        events: ["expedia_rapid_booking_confirmed", "expedia_rapid_booking_action_required"],
        fields: ["outcome", "status", "recovery", "transactionIdPresent"],
        piiIncluded: false,
      },
    });
    expect(body.recoveryGuidance).toHaveLength(4);
    expect(body.recoveryGuidance.every((item: { retryOriginalBooking: boolean }) => !item.retryOriginalBooking)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/synthetic|411111|43215|example\.com/i);
  });
});
