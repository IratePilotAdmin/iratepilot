import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAdminClient: vi.fn(),
  decryptPmsCredentials: vi.fn(),
  encryptPmsCredentials: vi.fn(),
  listApaleoProperties: vi.fn(),
  availability: vi.fn(),
  createReservation: vi.fn(),
  cancelReservation: vi.fn(),
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
    createReservation = mocks.createReservation;
    cancelReservation = mocks.cancelReservation;
  },
  listApaleoProperties: mocks.listApaleoProperties,
}));

import { POST } from "../app/api/admin/integrations/pms/apaleo/booking-cancel/route";

const stored = {
  ciphertext: "ciphertext",
  initialization_vector: "iv",
  authentication_tag: "tag",
  key_version: "v1",
};

function selectionResult(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) })),
    })),
  };
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

function request(body: Record<string, unknown>) {
  return new Request("https://iratepilot.test/api/admin/integrations/pms/apaleo/booking-cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Apaleo admin sandbox booking/cancellation test", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: "admin-1" }, profile: { role: "admin" } });
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.decryptPmsCredentials.mockReturnValue({
      PMS_APALEO_BASE_URL: "https://api.apaleo.com",
      PMS_APALEO_CLIENT_ID: "client-id",
      PMS_APALEO_CLIENT_SECRET: "client-secret",
      PMS_APALEO_REFRESH_TOKEN: "refresh-token",
    });
    mocks.listApaleoProperties.mockResolvedValue({
      accessToken: "access-token",
      properties: [{ id: "BER", name: "Berlin Test Hotel" }],
    });
    mocks.availability.mockResolvedValue([{
      offerId: "private-offer-id",
      propertyCode: "BER",
      roomTypeCode: "DBL",
      ratePlanCode: "BAR",
      currency: "EUR",
      totalAmount: 203,
      available: true,
      raw: { private: true },
    }]);
    mocks.createReservation.mockResolvedValue({
      propertyCode: "BER",
      reservationId: "BER-RES-1",
      externalReference: "IRP-CERT-1",
      status: "Confirmed",
      raw: { private: true },
    });
    mocks.cancelReservation.mockResolvedValue({
      propertyCode: "BER",
      reservationId: "BER-RES-1",
      status: "Cancelled",
      raw: { private: true },
    });
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

  it("rejects unauthenticated requests before database access", async () => {
    mocks.requireRole.mockResolvedValueOnce({ error: "Access denied.", status: 401 });
    const response = await POST(request(validBody()));
    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("refuses a property that is no longer authorized", async () => {
    mocks.listApaleoProperties.mockResolvedValueOnce({
      accessToken: "access-token",
      properties: [{ id: "MUC", name: "Munich Test Hotel" }],
    });
    const response = await POST(request(validBody()));
    expect(response.status).toBe(409);
    expect(mocks.availability).not.toHaveBeenCalled();
  });

  it("creates and cancels one sandbox reservation without exposing raw payloads", async () => {
    const body = validBody();
    const response = await POST(request(body));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.availability).toHaveBeenCalledWith({
      propertyCode: "BER",
      arrivalDate: body.arrivalDate,
      departureDate: body.departureDate,
      adults: 2,
      rooms: 1,
    });
    expect(mocks.createReservation).toHaveBeenCalledWith(expect.objectContaining({
      propertyCode: "BER",
      offerId: "private-offer-id",
      guest: { firstName: "iRatePilot", lastName: "Certification" },
    }));
    expect(mocks.cancelReservation).toHaveBeenCalledWith(expect.objectContaining({
      propertyCode: "BER",
      reservationId: "BER-RES-1",
    }));
    expect(payload).toMatchObject({
      propertyCode: "BER",
      reservationId: "BER-RES-1",
      reservationStatus: "Confirmed",
      cancellationStatus: "Cancelled",
    });
    expect(JSON.stringify(payload)).not.toContain("private-offer-id");
    expect(JSON.stringify(payload)).not.toContain('"private":true');
    expect(payload.message).toContain("No payment was created");
  });

  it("fails closed when no available offer exists", async () => {
    mocks.availability.mockResolvedValueOnce([{ available: false }]);
    const response = await POST(request(validBody()));
    expect(response.status).toBe(409);
    expect(mocks.createReservation).not.toHaveBeenCalled();
  });

  it("returns an action-required receipt when automatic cancellation fails", async () => {
    mocks.cancelReservation.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await POST(request(validBody()));
    const payload = await response.json();
    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      actionRequired: true,
      propertyCode: "BER",
      reservationId: "BER-RES-1",
    });
    expect(payload.error).toContain("Cancel it in Apaleo");
  });
});
