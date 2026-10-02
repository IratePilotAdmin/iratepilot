import { describe, expect, it } from "vitest";
import { bookingComAcknowledgementSucceeded } from "@/services/hotel-channels/booking-com/reservation-parser";

describe("Booking.com acknowledgement response validation", () => {
  it("accepts the matching response root with one direct success and no errors", () => {
    expect(bookingComAcknowledgementSucceeded('<OTA_HotelResNotifRS><Success/></OTA_HotelResNotifRS>', "new")).toBe(true);
    expect(bookingComAcknowledgementSucceeded('<b:OTA_HotelResModifyNotifRS><b:Success/></b:OTA_HotelResModifyNotifRS>', "modified_or_cancelled")).toBe(true);
  });

  it("rejects wrong roots, absent or duplicate success, errors, and unsafe XML", () => {
    expect(bookingComAcknowledgementSucceeded('<OTA_HotelResModifyNotifRS><Success/></OTA_HotelResModifyNotifRS>', "new")).toBe(false);
    expect(bookingComAcknowledgementSucceeded('<OTA_HotelResNotifRS/>', "new")).toBe(false);
    expect(bookingComAcknowledgementSucceeded('<OTA_HotelResNotifRS><Success/><Success/></OTA_HotelResNotifRS>', "new")).toBe(false);
    expect(bookingComAcknowledgementSucceeded('<OTA_HotelResNotifRS><Success/><Errors><Error/></Errors></OTA_HotelResNotifRS>', "new")).toBe(false);
    expect(() => bookingComAcknowledgementSucceeded('<!DOCTYPE x><OTA_HotelResNotifRS><Success/></OTA_HotelResNotifRS>', "new")).toThrow();
  });
});
