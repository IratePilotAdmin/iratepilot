import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { assessBookingComReservationPollScope, runBookingComReservationPoller } from "@/lib/booking-com-reservation-poller";

const propertyId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const connection = {
  connection_id: "booking-test-one",
  property_id: propertyId,
  provider_property_id: "12345",
  machine_account_id: accountId,
  certification_complete: true,
};
const reservationXml = `<OTA_HotelResNotifRQ><HotelReservation ResStatus="Book"><HotelReservationID ResID_Value="booking-1" ResID_Type="14"/><RoomStays><RoomStay IndexNumber="1"><BasicPropertyInfo HotelCode="12345"/><RoomType RoomTypeCode="provider-room"/><RatePlan RatePlanCode="provider-rate"/><TimeSpan Start="2026-10-02" End="2026-10-03"/><GuestCount Count="1"/><Total AmountAfterTax="10000" DecimalPlaces="2" CurrencyCode="USD"/></RoomStay></RoomStays><ResGlobalInfo><Customer><PersonName><GivenName>Test</GivenName><Surname>Guest</Surname></PersonName></Customer></ResGlobalInfo></HotelReservation></OTA_HotelResNotifRQ>`;

function makeDeps(options: { response?: string; status?: number; property?: string; tokenError?: boolean } = {}) {
  const stage = vi.fn(async () => "received" as const);
  const fetcher = vi.fn(async () => new Response(options.response ?? reservationXml.replace('HotelCode="12345"', `HotelCode="${options.property ?? "12345"}"`), { status: options.status ?? 200 }));
  const getToken = vi.fn(async () => {
    if (options.tokenError) throw new Error("token unavailable");
    return "test-token-long-enough-to-be-accepted";
  });
  const validateScope = vi.fn(async (): Promise<"ready" | "paused" | "stale" | "unavailable"> => "ready");
  return {
    stage, fetcher, getToken, validateScope,
    dependencies: { store: { listApprovedTestConnections: async () => [connection], validateScope, stage }, fetcher: fetcher as typeof fetch, getToken },
  };
}

describe("Booking.com reservation poller", () => {
  it("polls both queues and stages each matching reservation without acknowledging provider messages", async () => {
    const deps = makeDeps();
    const result = await runBookingComReservationPoller(deps.dependencies);
    expect(result).toEqual({ connections: 1, polled: 2, received: 2, duplicates: 0, mismatched: 0, retryable: 0, review: 0, acknowledgementsSent: 0 });
    expect(deps.getToken).toHaveBeenCalledWith(accountId, deps.fetcher);
    expect(deps.validateScope).toHaveBeenCalledTimes(3);
    expect(deps.fetcher).toHaveBeenCalledTimes(2);
    expect(deps.stage).toHaveBeenNthCalledWith(1, connection, "new", expect.objectContaining({ providerPropertyId: "12345" }));
    expect(deps.stage).toHaveBeenNthCalledWith(2, connection, "modified_or_cancelled", expect.objectContaining({ providerPropertyId: "12345" }));
    for (const [, init] of deps.fetcher.mock.calls as unknown as Array<[string, RequestInit]>) expect(init.method).toBe("GET");
  });

  it("does not stage another property's reservation or acknowledge it", async () => {
    const deps = makeDeps({ property: "99999" });
    const result = await runBookingComReservationPoller(deps.dependencies);
    expect(result.mismatched).toBe(2);
    expect(result.acknowledgementsSent).toBe(0);
    expect(deps.stage).not.toHaveBeenCalled();
  });

  it("records transient provider failures and never sends an acknowledgement", async () => {
    const deps = makeDeps({ status: 503, response: "" });
    const result = await runBookingComReservationPoller(deps.dependencies);
    expect(result.retryable).toBe(2);
    expect(deps.stage).not.toHaveBeenCalled();
    expect(result.acknowledgementsSent).toBe(0);
  });

  it("moves malformed connection rows to review without provider traffic", async () => {
    const deps = makeDeps();
    const result = await runBookingComReservationPoller({
      ...deps.dependencies,
      store: { ...deps.dependencies.store, listApprovedTestConnections: async () => [{ ...connection, property_id: "bad" }] },
    });
    expect(result.review).toBe(1);
    expect(deps.fetcher).not.toHaveBeenCalled();
  });

  it("does not obtain a token or poll when certification is incomplete", async () => {
    const deps = makeDeps();
    const result = await runBookingComReservationPoller({
      ...deps.dependencies,
      store: { ...deps.dependencies.store, listApprovedTestConnections: async () => [{ ...connection, certification_complete: false }] },
    });
    expect(result).toMatchObject({ polled: 0, received: 0, review: 1, acknowledgementsSent: 0 });
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(deps.fetcher).not.toHaveBeenCalled();
    expect(deps.stage).not.toHaveBeenCalled();
  });

  it("does not load credentials when the current hotel scope is paused", async () => {
    const deps = makeDeps();
    deps.validateScope.mockResolvedValueOnce("paused");
    const result = await runBookingComReservationPoller(deps.dependencies);
    expect(result).toMatchObject({ polled: 0, review: 1, acknowledgementsSent: 0 });
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(deps.fetcher).not.toHaveBeenCalled();
  });

  it("stops after token acquisition if the exact hotel scope changed", async () => {
    const deps = makeDeps();
    deps.validateScope.mockResolvedValueOnce("ready").mockResolvedValueOnce("stale");
    const result = await runBookingComReservationPoller(deps.dependencies);
    expect(result).toMatchObject({ polled: 0, review: 1, acknowledgementsSent: 0 });
    expect(deps.getToken).toHaveBeenCalledTimes(1);
    expect(deps.fetcher).not.toHaveBeenCalled();
    expect(deps.stage).not.toHaveBeenCalled();
  });

  it("holds the second queue when approval is withdrawn during the first poll", async () => {
    const deps = makeDeps();
    deps.validateScope.mockResolvedValueOnce("ready")
      .mockResolvedValueOnce("ready").mockResolvedValueOnce("paused");
    const result = await runBookingComReservationPoller(deps.dependencies);
    expect(result).toMatchObject({ polled: 1, received: 1, review: 1, acknowledgementsSent: 0 });
    expect(deps.fetcher).toHaveBeenCalledTimes(1);
    expect(deps.stage).toHaveBeenCalledTimes(1);
  });

  it("holds provider traffic when the fresh scope lookup fails", async () => {
    const deps = makeDeps();
    deps.validateScope.mockResolvedValueOnce("unavailable");
    const result = await runBookingComReservationPoller(deps.dependencies);
    expect(result).toMatchObject({ polled: 0, review: 1, acknowledgementsSent: 0 });
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(deps.fetcher).not.toHaveBeenCalled();
  });
});

describe("Booking.com reservation poll scope", () => {
  const scope = {
    connection: { ...connection, provider: "booking_com", environment: "test", enabled: true,
      partner_approved: true, pii_compliance_approved: true },
    property: { id: propertyId, partner_id: "33333333-3333-4333-8333-333333333333", active: true },
    partner: { id: "33333333-3333-4333-8333-333333333333", status: "approved" },
    account: { id: accountId, property_id: propertyId, provider: "booking_com", environment: "test",
      enabled: true, partner_approved: true, approved_at: "2026-10-01T00:00:00Z" },
  };

  it("requires the current mapping, approvals, active property and approved machine account", () => {
    expect(assessBookingComReservationPollScope(connection, scope)).toBe("ready");
    expect(assessBookingComReservationPollScope(connection, {
      ...scope, connection: { ...scope.connection, provider_property_id: "different-hotel" },
    })).toBe("stale");
    expect(assessBookingComReservationPollScope(connection, {
      ...scope, connection: { ...scope.connection, certification_complete: false },
    })).toBe("paused");
    expect(assessBookingComReservationPollScope(connection, {
      ...scope, account: { ...scope.account, approved_at: null },
    })).toBe("paused");
    expect(assessBookingComReservationPollScope(connection, {
      ...scope, partner: { ...scope.partner, status: "suspended" },
    })).toBe("paused");
  });
});
