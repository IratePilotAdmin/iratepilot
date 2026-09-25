import { describe, expect, it } from "vitest";
import { buildBookingComAriRequests } from "../services/hotel-channels/booking-com/ari";

const now = new Date("2026-09-25T12:00:00.000Z");

describe("Booking.com OTA ARI payload preparation", () => {
  it("builds delta-only availability and rate requests, split by property, operation, and month", () => {
    const requests = buildBookingComAriRequests([
      { kind: "availability", channelPropertyId: "hotel-1", roomTypeId: "room-1", date: "2026-09-25", roomsToSell: 2 },
      { kind: "availability", channelPropertyId: "hotel-1", roomTypeId: "room-1", date: "2026-10-01", roomsToSell: 0 },
      { kind: "availability", channelPropertyId: "hotel-2", roomTypeId: "room-2", date: "2026-09-25", roomsToSell: 3 },
      { kind: "rate", channelPropertyId: "hotel-1", roomTypeId: "room-1", ratePlanId: "bar", date: "2026-09-25", amountMinor: 14900, currency: "USD", priceBasis: "before_tax" },
      { kind: "rate", channelPropertyId: "hotel-1", roomTypeId: "room-1", ratePlanId: "bar", date: "2026-10-01", amountMinor: 15500, currency: "USD", priceBasis: "after_tax" },
    ], now);

    expect(requests).toHaveLength(5);
    const availability = requests.find((request) => request.kind === "availability" && request.month === "2026-09" && request.channelPropertyId === "hotel-1");
    expect(availability?.endpoint).toBe("https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif");
    expect(availability?.headers).toEqual({ "Accept-Version": "1.1", "Content-Type": "application/xml" });
    expect(availability?.body).toContain('BookingLimit="2"');
    expect(availability?.body).toContain("Start=\"2026-09-25\" End=\"2026-09-25\"");
    const beforeTax = requests.find((request) => request.kind === "rate" && request.month === "2026-09");
    expect(beforeTax?.body).toContain('AmountBeforeTax="14900" DecimalPlaces="2" CurrencyCode="USD"');
    const afterTax = requests.find((request) => request.kind === "rate" && request.month === "2026-10");
    expect(afterTax?.body).toContain('AmountAfterTax="15500" DecimalPlaces="2" CurrencyCode="USD"');
    expect(requests.every((request) => request.body.includes('TimeStamp="2026-09-25T12:00:00.000Z"'))).toBe(true);
  });

  it("escapes provider mapping codes and formats currencies with zero or three minor digits", () => {
    const requests = buildBookingComAriRequests([
      { kind: "rate", channelPropertyId: "hotel-1", roomTypeId: "room&1", ratePlanId: "rate<2", date: "2026-09-25", amountMinor: 1450, currency: "KWD", priceBasis: "after_tax" },
    ], now);
    expect(requests[0].body).toContain('InvTypeCode="room&amp;1"');
    expect(requests[0].body).toContain('RatePlanCode="rate&lt;2"');
    expect(requests[0].body).toContain('AmountAfterTax="1450" DecimalPlaces="3" CurrencyCode="KWD"');
    const zeroDecimal = buildBookingComAriRequests([
      { kind: "rate", channelPropertyId: "hotel-1", roomTypeId: "room-1", ratePlanId: "rate-1", date: "2026-09-25", amountMinor: 120, currency: "JPY", priceBasis: "before_tax" },
    ], now);
    expect(zeroDecimal[0].body).toContain('AmountBeforeTax="120" DecimalPlaces="0" CurrencyCode="JPY"');
  });

  it("rejects duplicate or invalid deltas instead of silently overwriting inventory", () => {
    const item = { kind: "availability" as const, channelPropertyId: "hotel-1", roomTypeId: "room-1", date: "2026-09-25", roomsToSell: 2 };
    expect(() => buildBookingComAriRequests([item, item], now)).toThrow("duplicate_delta");
    expect(() => buildBookingComAriRequests([{ ...item, roomsToSell: 255 }], now)).toThrow("unsupported_rooms_to_sell");
    expect(() => buildBookingComAriRequests([{ ...item, date: "2026-02-30" }], now)).toThrow("invalid_mapping_or_date");
    expect(() => buildBookingComAriRequests([{ ...item, date: "2032-09-25" }], now)).toThrow("invalid_mapping_or_date");
    expect(() => buildBookingComAriRequests([{ ...item, channelPropertyId: "bad\n/property" }], now)).toThrow("invalid_mapping_or_date");
    expect(() => buildBookingComAriRequests([], now)).toThrow("invalid_batch_size");
    expect(() => buildBookingComAriRequests(Array.from({ length: 501 }, (_, index) => ({ ...item, date: "2026-09-25", roomTypeId: `room-${index}` })), now)).toThrow("invalid_batch_size");
  });

  it("requires an explicit, bounded rate and a supported tax basis", () => {
    const item = { kind: "rate" as const, channelPropertyId: "hotel-1", roomTypeId: "room-1", ratePlanId: "bar", date: "2026-09-25", amountMinor: 14900, currency: "USD", priceBasis: "before_tax" as const };
    expect(() => buildBookingComAriRequests([{ ...item, amountMinor: 0 }], now)).toThrow("invalid_rate_delta");
    expect(() => buildBookingComAriRequests([{ ...item, amountMinor: 5_000_001 }], now)).toThrow("invalid_rate_delta");
    expect(() => buildBookingComAriRequests([{ ...item, currency: "XXX" }], now)).toThrow("unsupported_currency");
    expect(() => buildBookingComAriRequests([{ ...item, priceBasis: "unknown" as "before_tax" }], now)).toThrow("invalid_rate_delta");
  });

  it("keeps requests explicitly unsent in this module", () => {
    const [request] = buildBookingComAriRequests([
      { kind: "availability", channelPropertyId: "hotel-1", roomTypeId: "room-1", date: "2026-09-25", roomsToSell: 2 },
    ], now);
    expect(request).not.toHaveProperty("sent");
    expect(request.endpoint).toBe("https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif");
  });
});
