import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { runBookingComReservationPoller } from "@/lib/booking-com-reservation-poller";

const propertyId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const connection = {
  connection_id: "booking-test-one",
  property_id: propertyId,
  provider_property_id: "12345",
  machine_account_id: accountId,
};
const reservationXml = `<OTA_HotelResNotifRQ><HotelReservation ResStatus="Book"><HotelReservationID ResID_Value="booking-1" ResID_Type="14"/><RoomStays><RoomStay IndexNumber="1"><BasicPropertyInfo HotelCode="12345"/><RoomType RoomTypeCode="provider-room"/><RatePlan RatePlanCode="provider-rate"/><TimeSpan Start="2026-10-02" End="2026-10-03"/><GuestCount Count="1"/><Total AmountAfterTax="10000" DecimalPlaces="2" CurrencyCode="USD"/></RoomStay></RoomStays><ResGlobalInfo><Customer><PersonName><GivenName>Test</GivenName><Surname>Guest</Surname></PersonName></Customer></ResGlobalInfo></HotelReservation></OTA_HotelResNotifRQ>`;

function makeDeps(options: { response?: string; status?: number; property?: string; tokenError?: boolean } = {}) {
  const stage = vi.fn(async () => "received" as const);
  const fetcher = vi.fn(async () => new Response(options.response ?? reservationXml.replace('HotelCode="12345"', `HotelCode="${options.property ?? "12345"}"`), { status: options.status ?? 200 }));
  const getToken = vi.fn(async () => {
    if (options.tokenError) throw new Error("token unavailable");
    return "test-token-long-enough-to-be-accepted";
  });
  return {
    stage, fetcher, getToken,
    dependencies: { store: { listApprovedTestConnections: async () => [connection], stage }, fetcher: fetcher as typeof fetch, getToken },
  };
}

describe("Booking.com reservation poller", () => {
  it("polls both queues and stages each matching reservation without acknowledging provider messages", async () => {
    const deps = makeDeps();
    const result = await runBookingComReservationPoller(deps.dependencies);
    expect(result).toEqual({ connections: 1, polled: 2, received: 2, duplicates: 0, mismatched: 0, retryable: 0, review: 0, acknowledgementsSent: 0 });
    expect(deps.getToken).toHaveBeenCalledWith(accountId, deps.fetcher);
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
});
