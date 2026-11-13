import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAdminClient: vi.fn(),
  decryptPmsCredentials: vi.fn(),
  encryptPmsCredentials: vi.fn(),
  getApaleoAccessToken: vi.fn(),
  availability: vi.fn(),
  from: vi.fn(),
  credentialUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/integrations/pms-credentials", () => ({
  decryptPmsCredentials: mocks.decryptPmsCredentials,
  encryptPmsCredentials: mocks.encryptPmsCredentials,
}));
vi.mock("@/services/hotel-suppliers/apaleo", () => ({
  ApaleoConnectionTestError: class ApaleoConnectionTestError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
  ApaleoTransportError: class ApaleoTransportError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
  ApaleoHttpTransport: class ApaleoHttpTransport {},
  ApaleoBookingMapper: class ApaleoBookingMapper {},
  ApaleoAdapter: class ApaleoAdapter {
    availability = mocks.availability;
  },
  getApaleoAccessToken: mocks.getApaleoAccessToken,
}));

import { POST } from "../app/api/admin/integrations/pms/apaleo/offers/route";

const stored = {
  ciphertext: "ciphertext",
  initialization_vector: "iv",
  authentication_tag: "tag",
  key_version: "v1",
};

function selectionResult(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      })),
    })),
  };
}

function request(body: Record<string, unknown>) {
  return new Request("https://iratepilot.test/api/admin/integrations/pms/apaleo/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody() {
  const arrival = new Date();
  arrival.setUTCDate(arrival.getUTCDate() + 14);
  const departure = new Date(arrival);
  departure.setUTCDate(departure.getUTCDate() + 2);
  return {
    connectionId: "connection-1",
    arrivalDate: arrival.toISOString().slice(0, 10),
    departureDate: departure.toISOString().slice(0, 10),
    adults: 2,
  };
}

describe("Apaleo admin sandbox offer search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.decryptPmsCredentials.mockReturnValue({
      PMS_APALEO_BASE_URL: "https://api.apaleo.com",
      PMS_APALEO_CLIENT_ID: "client-id",
      PMS_APALEO_CLIENT_SECRET: "client-secret",
      PMS_APALEO_REFRESH_TOKEN: "saved-refresh-token",
    });
    mocks.getApaleoAccessToken.mockResolvedValue({ accessToken: "access-token" });
    mocks.availability.mockResolvedValue([{
      offerId: "private-offer-id",
      propertyCode: "BER",
      roomTypeCode: "DBL",
      ratePlanCode: "BAR",
      currency: "EUR",
      totalAmount: 240,
      available: true,
      raw: { private: "provider payload" },
    }]);
    mocks.credentialUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mocks.from.mockImplementation((table: string) => {
      if (table === "property_pms_connections") {
        return selectionResult({ id: "connection-1", provider_id: "apaleo", external_property_code: "BER" });
      }
      if (table === "property_pms_credentials") {
        return { ...selectionResult(stored), update: mocks.credentialUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("rejects unauthenticated requests before privileged database access", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 401 });
    const response = await POST(request(validBody()));
    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects invalid stay input without contacting Apaleo", async () => {
    const response = await POST(request({ ...validBody(), departureDate: "2026-01-01" }));
    expect(response.status).toBe(400);
    expect(mocks.getApaleoAccessToken).not.toHaveBeenCalled();
  });

  it("returns sanitized read-only offer evidence for the selected property", async () => {
    const body = validBody();
    const response = await POST(request(body));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getApaleoAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://api.apaleo.com",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "saved-refresh-token",
    });
    expect(mocks.availability).toHaveBeenCalledWith({
      propertyCode: "BER",
      arrivalDate: body.arrivalDate,
      departureDate: body.departureDate,
      adults: 2,
      rooms: 1,
    });
    expect(payload).toMatchObject({
      propertyCode: "BER",
      offerCount: 1,
      offers: [{ roomTypeCode: "DBL", ratePlanCode: "BAR", currency: "EUR", totalAmount: 240 }],
    });
    expect(JSON.stringify(payload)).not.toContain("private-offer-id");
    expect(JSON.stringify(payload)).not.toContain("provider payload");
    expect(payload.message).toContain("No booking or payment was created");
  });

  it("stores a rotated refresh token without exposing it", async () => {
    mocks.getApaleoAccessToken.mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "rotated-refresh-token",
    });
    mocks.encryptPmsCredentials.mockReturnValueOnce({
      ciphertext: "rotated-ciphertext",
      initializationVector: "rotated-iv",
      authenticationTag: "rotated-tag",
      keyVersion: "v1",
    });
    const response = await POST(request(validBody()));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.encryptPmsCredentials).toHaveBeenCalledWith(expect.objectContaining({
      PMS_APALEO_REFRESH_TOKEN: "rotated-refresh-token",
    }));
    expect(mocks.credentialUpdate).toHaveBeenCalledWith(expect.objectContaining({
      configured_by: "admin-1",
      ciphertext: "rotated-ciphertext",
    }));
    expect(JSON.stringify(payload)).not.toContain("rotated-refresh-token");
  });
});
