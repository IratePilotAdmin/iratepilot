import { describe, expect, it, vi } from "vitest";
import {
  buildBookingComReservationAcknowledgement,
  buildBookingComReservationPoll,
  callBookingComReservationTestApi,
} from "../services/hotel-channels/booking-com/reservations";

const approval = {
  mode: "test" as const, propertyId: "12345", machineAccountPropertyScope: "12345",
  partnerApproved: true as const, reservationConnectionApproved: true as const,
  endpointEnabled: true as const, certificationComplete: true as const,
  piiComplianceApproved: true as const, testProperty: true as const,
};
const timestamp = "2026-09-25T12:00:00.000Z";

describe("Booking.com reservation queue protocol", () => {
  it("builds property-scoped polls for new and modified/cancelled reservation queues", () => {
    expect(buildBookingComReservationPoll("12345", "new")).toMatchObject({
      method: "GET", kind: "new", url: "https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResNotif?hotel_ids=12345",
    });
    expect(buildBookingComReservationPoll("12345", "modified_or_cancelled").url)
      .toBe("https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResModifyNotif?hotel_ids=12345");
    expect(() => buildBookingComReservationPoll("12345&hotel_ids=999", "new")).toThrow("invalid_reservation_poll");
  });

  it("requires durable-persistence success before building a success acknowledgement", () => {
    const ack = buildBookingComReservationAcknowledgement({ kind: "new", reservationId: "987654", persisted: true, timestamp });
    expect(ack.method).toBe("POST");
    expect(ack.url).toBe("https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResNotif");
    expect(ack.body).toContain("<Success/>");
    expect(ack.body).toContain('ResID_Value="987654"');
    expect(ack.body).toContain('Target="Test"');
    expect(buildBookingComReservationAcknowledgement({ kind: "modified_or_cancelled", reservationId: "abc-1", persisted: true, timestamp }).body)
      .toContain("OTA_HotelResModifyNotifRS");
    expect(() => buildBookingComReservationAcknowledgement({ kind: "new", reservationId: "987654", persisted: false, timestamp }))
      .toThrow("reservation_failure_reason_required");
    expect(buildBookingComReservationAcknowledgement({ kind: "new", reservationId: "987654", persisted: false, timestamp, failureCode: "193", failureMessage: "PMS write failed" }).body)
      .toContain('Error Code="193" RecordID="987654"');
  });

  it("uses the injected test fetcher and classifies transient versus successful queue retrieval", async () => {
    const fetcher = vi.fn(async () => new Response("<OTA_HotelResNotifRQ/>", { status: 200 }));
    const request = buildBookingComReservationPoll("12345", "new");
    const result = await callBookingComReservationTestApi(request, approval, { bearerToken: "b".repeat(40), fetcher });
    expect(result).toMatchObject({ outcome: "received", status: 200, body: "<OTA_HotelResNotifRQ/>" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(request.url);
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${"b".repeat(40)}`);

    const transient = await callBookingComReservationTestApi(request, approval, {
      bearerToken: "b".repeat(40), fetcher: vi.fn(async () => new Response("", { status: 503 })),
    });
    expect(transient).toMatchObject({ outcome: "retryable", status: 503, body: "" });
  });

  it("never calls the transport without reservation, PII, property-scope, and test gates", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const request = buildBookingComReservationPoll("12345", "new");
    await expect(callBookingComReservationTestApi(request, { ...approval, piiComplianceApproved: false } as never, { bearerToken: "b".repeat(40), fetcher }))
      .rejects.toThrow("booking_com_reservation_connection_not_authorized");
    await expect(callBookingComReservationTestApi(request, { ...approval, machineAccountPropertyScope: "99999" }, { bearerToken: "b".repeat(40), fetcher }))
      .rejects.toThrow("booking_com_reservation_connection_not_authorized");
    await expect(callBookingComReservationTestApi(request, { ...approval, mode: "production" } as never, { bearerToken: "b".repeat(40), fetcher }))
      .rejects.toThrow("booking_com_reservation_connection_not_authorized");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects forged production acknowledgements and bounds provider responses", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const request = buildBookingComReservationPoll("12345", "new");
    await expect(callBookingComReservationTestApi({
      ...buildBookingComReservationAcknowledgement({ kind: "new", reservationId: "456", persisted: true, timestamp }),
      body: '<OTA_HotelResNotifRS Target="Production"><Success/></OTA_HotelResNotifRS>',
    }, approval, { bearerToken: "b".repeat(40), fetcher })).rejects.toThrow("invalid_reservation_transport");
    expect(fetcher).not.toHaveBeenCalled();

    const tooLarge = await callBookingComReservationTestApi(request, approval, {
      bearerToken: "b".repeat(40), fetcher: vi.fn(async () => new Response("x".repeat(1_000_001), { status: 200 })),
    });
    expect(tooLarge).toMatchObject({ outcome: "unknown", status: 200, body: "" });
  });
});
