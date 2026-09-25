import { describe, expect, it, vi } from "vitest";
import { buildBookingComAriRequests } from "../services/hotel-channels/booking-com/ari";
import { parseBookingComAcknowledgement, postBookingComAriTestRequest, type BookingComDispatchApproval } from "../services/hotel-channels/booking-com/client";

const request = buildBookingComAriRequests([
  { kind: "availability", channelPropertyId: "hotel-1", roomTypeId: "room-1", date: "2026-09-25", roomsToSell: 2 },
], new Date("2026-09-25T12:00:00Z"))[0];
const approval: BookingComDispatchApproval = {
  mode: "test", propertyId: "hotel-1", machineAccountPropertyScope: "hotel-1",
  partnerApproved: true, propertyConnectionApproved: true, endpointEnabled: true,
  certificationComplete: true, testProperty: true,
};

describe("Booking.com ARI test transport", () => {
  it("sends only through an injected fetcher with the scoped short-lived bearer token", async () => {
    const fetcher = vi.fn(async () => new Response('<OTA_HotelAvailNotifRS><Success/></OTA_HotelAvailNotifRS>', { status: 200 }));
    const result = await postBookingComAriTestRequest(request, approval, { bearerToken: "a".repeat(40), fetcher });
    expect(result.outcome).toBe("accepted");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(request.endpoint);
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${"a".repeat(40)}`);
  });

  it("blocks an unapproved, unscoped, or non-test property before calling transport", async () => {
    const fetcher = vi.fn(async () => new Response("<Success/>", { status: 200 }));
    await expect(postBookingComAriTestRequest(request, { ...approval, propertyConnectionApproved: false } as unknown as BookingComDispatchApproval, { bearerToken: "a".repeat(40), fetcher }))
      .rejects.toThrow("booking_com_connection_not_authorized");
    await expect(postBookingComAriTestRequest(request, { ...approval, machineAccountPropertyScope: "other-property" }, { bearerToken: "a".repeat(40), fetcher }))
      .rejects.toThrow("booking_com_connection_not_authorized");
    await expect(postBookingComAriTestRequest(request, { ...approval, mode: "production" } as unknown as BookingComDispatchApproval, { bearerToken: "a".repeat(40), fetcher }))
      .rejects.toThrow("booking_com_connection_not_authorized");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("classifies provider acceptance, warnings, validation errors, transient failures, and unknown replies", () => {
    expect(parseBookingComAcknowledgement("<RS><Success/></RS>", 200).outcome).toBe("accepted");
    expect(parseBookingComAcknowledgement("<RS><Success/><Warnings><Warning Code=\"3\" ShortText=\"limited\"/></Warnings></RS>", 200))
      .toMatchObject({ outcome: "accepted_with_warnings", warnings: [{ code: "3", message: "limited" }] });
    expect(parseBookingComAcknowledgement("<RS><Errors><Error Code=\"12\" ShortText=\"bad map\"/></Errors></RS>", 200))
      .toMatchObject({ outcome: "rejected", errors: [{ code: "12", message: "bad map" }] });
    expect(parseBookingComAcknowledgement("", 429).outcome).toBe("retryable");
    expect(parseBookingComAcknowledgement("<!DOCTYPE x><RS><Success/></RS>", 200).outcome).toBe("unknown");
    expect(parseBookingComAcknowledgement("<RS/>", 200).outcome).toBe("unknown");
  });

  it("rejects unknown URLs and malformed credentials without sending", async () => {
    const fetcher = vi.fn(async () => new Response("<Success/>", { status: 200 }));
    await expect(postBookingComAriTestRequest({ ...request, endpoint: "https://attacker.example/" }, approval, { bearerToken: "a".repeat(40), fetcher }))
      .rejects.toThrow("invalid_test_transport");
    await expect(postBookingComAriTestRequest(request, approval, { bearerToken: "bad", fetcher }))
      .rejects.toThrow("invalid_bearer_token");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
