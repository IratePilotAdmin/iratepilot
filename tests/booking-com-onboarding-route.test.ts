import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  provision: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/services/hotel-channels/booking-com/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/hotel-channels/booking-com/onboarding")>();
  return { ...actual, provisionBookingComTestConnection: mocks.provision };
});

import { POST } from "../app/api/partner/integrations/booking-com/route";

const userId = "33333333-3333-4333-8333-333333333333";
const partnerId = "22222222-2222-4222-8222-222222222222";
const propertyId = "11111111-1111-4111-8111-111111111111";
const clientSecret = "private-booking-test-secret";

function authContext(ownsProperty: boolean) {
  return {
    user: { id: userId },
    profile: { role: "partner" },
    supabase: {
      from(table: string) {
        const filters = new Map<string, unknown>();
        const query = {
          select: () => query,
          eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
          maybeSingle: async () => {
            if (table === "partners" && filters.get("owner_id") === userId) return { data: { id: partnerId, status: "approved" }, error: null };
            if (table === "properties" && filters.get("id") === propertyId && filters.get("partner_id") === partnerId && ownsProperty) {
              return { data: { id: propertyId, active: true }, error: null };
            }
            return { data: null, error: null };
          },
        };
        return query;
      },
    },
  };
}

function request(payload: Record<string, unknown>) {
  return new Request("https://pms.iratepilot.com/api/partner/integrations/booking-com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue(authContext(true));
  mocks.provision.mockResolvedValue({
    accountId: "e3bb11c9-a74e-4e23-9f3e-74073f0e8311",
    connectionId: "booking-e3bb11c9a74e4e239f3e74073f0e8311",
    environment: "test",
    status: "partner_approval_pending",
  });
});

describe("Booking.com onboarding API security", () => {
  it("rejects requests from unauthenticated users before parsing or saving credentials", async () => {
    mocks.requireRole.mockResolvedValue({ error: "Authentication required.", status: 401 });
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(mocks.provision).not.toHaveBeenCalled();
  });

  it("does not allow a partner to onboard another partner's property", async () => {
    mocks.requireRole.mockResolvedValue(authContext(false));
    const response = await POST(request({
      propertyId,
      providerPropertyId: "booking-property-123",
      clientId: "test-client-id",
      clientSecret,
    }));
    expect(response.status).toBe(404);
    expect(mocks.provision).not.toHaveBeenCalled();
  });

  it("returns only disabled test onboarding metadata, never the submitted secret", async () => {
    const response = await POST(request({
      propertyId,
      providerPropertyId: "booking-property-123",
      clientId: "test-client-id",
      clientSecret,
    }));
    const body = await response.text();
    expect(response.status).toBe(201);
    expect(body).not.toContain(clientSecret);
    expect(body).toContain("synchronization remains off");
    expect(mocks.provision).toHaveBeenCalledWith({
      propertyId, providerPropertyId: "booking-property-123", clientId: "test-client-id", clientSecret,
    });
  });
});
