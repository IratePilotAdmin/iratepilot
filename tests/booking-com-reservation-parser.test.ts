import { describe, expect, it } from "vitest";
import { parseBookingComReservationBatch } from "../services/hotel-channels/booking-com/reservation-parser";

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Target="Test">
  <HotelReservations><HotelReservation ResStatus="Book">
    <RoomStays><RoomStay IndexNumber="1">
      <RoomTypes><RoomType RoomTypeCode="room-101"/></RoomTypes>
      <RatePlans><RatePlan RatePlanCode="bar"/></RatePlans>
      <TimeSpan Start="2026-10-02" End="2026-10-04"/>
      <GuestCounts><GuestCount AgeQualifyingCode="10" Count="2"/><GuestCount AgeQualifyingCode="8" Count="1"/></GuestCounts>
      <Total AmountAfterTax="325.50" DecimalPlaces="2" CurrencyCode="USD"/>
      <BasicPropertyInfo HotelCode="12345"/>
    </RoomStay></RoomStays>
    <ResGlobalInfo><HotelReservationIDs><HotelReservationID ResID_Value="9001" ResID_Source="BOOKING.COM" ResID_Type="14"/></HotelReservationIDs>
      <Profiles><ProfileInfo><Profile><Customer><PersonName><GivenName>Lee &amp; Ann</GivenName><Surname>Guest</Surname></PersonName><Email>lee@example.com</Email><Telephone PhoneNumber="+1 555 010 2020"/><PaymentCard CardNumber="4111111111111111"/></Customer></Profile></ProfileInfo></Profiles>
    </ResGlobalInfo>
  </HotelReservation></HotelReservations>
</OTA_HotelResNotifRQ>`;

describe("Booking.com reservation XML normalization", () => {
  it("extracts the provider IDs, mapped room/rate IDs, dates, guest counts, total and minimal guest contact", () => {
    expect(parseBookingComReservationBatch(fixture)).toEqual([{
      reservationIds: [{ value: "9001", source: "BOOKING.COM", type: "14" }],
      providerPropertyId: "12345",
      status: "Book",
      guest: { name: "Lee & Ann Guest", email: "lee@example.com", phone: "+1 555 010 2020" },
      rooms: [{
        providerRoomTypeId: "room-101", providerRatePlanId: "bar", checkIn: "2026-10-02",
        checkOut: "2026-10-04", guests: 3, totalMinor: 32550, currency: "USD",
      }],
    }]);
    expect(JSON.stringify(parseBookingComReservationBatch(fixture))).not.toContain("4111111111111111");
  });

  it("handles namespaced XML, multiple provider IDs, and modified reservation envelopes", () => {
    const namespaced = fixture.replace(/(<\/?)([A-Za-z_][A-Za-z0-9_.:-]*)(?=[\s/>])/g, "$1ota:$2")
      .replace('xmlns="http://www.opentravel.org/OTA/2003/05"', 'xmlns="http://www.opentravel.org/OTA/2003/05" xmlns:ota="http://www.opentravel.org/OTA/2003/05"');
    const ids = namespaced.replace('ResID_Type="14"/>', 'ResID_Type="14"/><ota:HotelReservationID ResID_Value="token-9001" ResID_Source="BOOKING.COM" ResID_Type="18"/>');
    expect(parseBookingComReservationBatch(ids)[0]?.reservationIds).toHaveLength(2);

    const modified = fixture.replaceAll("OTA_HotelResNotifRQ", "OTA_HotelResModifyNotifRQ")
      .replace("<HotelReservation ResStatus=", "<HotelResModify ResStatus=")
      .replace("</HotelReservation>", "</HotelResModify>")
      .replace("<HotelReservations>", "<HotelResModifies>")
      .replace("</HotelReservations>", "</HotelResModifies>");
    expect(parseBookingComReservationBatch(modified)).toHaveLength(1);
  });

  it("rejects untrusted DTD/entities, invalid dates, unknown currency precision, and missing mapping fields", () => {
    expect(() => parseBookingComReservationBatch('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><OTA_HotelResNotifRQ/>'))
      .toThrow("invalid_or_unsafe_xml");
    expect(() => parseBookingComReservationBatch(fixture.replace("Lee &amp; Ann", "Lee &bogus; Ann")))
      .toThrow("unsupported_xml_entity");
    expect(() => parseBookingComReservationBatch(fixture.replace('Start="2026-10-02"', 'Start="2026-02-30"')))
      .toThrow("reservation_dates_invalid");
    expect(() => parseBookingComReservationBatch(fixture.replace('CurrencyCode="USD"', 'CurrencyCode="ZZZ"')))
      .toThrow("reservation_currency_invalid");
    expect(() => parseBookingComReservationBatch(fixture.replace('RoomTypeCode="room-101"', '')))
      .toThrow("reservation_field_missing_or_invalid");
    expect(() => parseBookingComReservationBatch(fixture.replace("</OTA_HotelResNotifRQ>", "")))
      .toThrow("incomplete_xml_document");
  });
});
