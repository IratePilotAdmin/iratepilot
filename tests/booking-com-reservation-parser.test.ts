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
      <Total AmountAfterTax="32550" DecimalPlaces="2" CurrencyCode="USD"/>
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
        providerRoomIndex: 1,
        providerRoomTypeId: "room-101", providerRatePlanId: "bar", checkIn: "2026-10-02",
        checkOut: "2026-10-04", guests: 3, totalMinor: 32550, totalBasis: "after_tax", currency: "USD",
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
    expect(() => parseBookingComReservationBatch(fixture.replace('AmountAfterTax="32550"', 'AmountAfterTax="325.50"')))
      .toThrow("reservation_amount_invalid");
    expect(() => parseBookingComReservationBatch(fixture.replace('RoomTypeCode="room-101"', '')))
      .toThrow("reservation_field_missing_or_invalid");
    expect(() => parseBookingComReservationBatch(fixture.replace('IndexNumber="1"', 'IndexNumber="0"')))
      .toThrow("reservation_room_index_invalid");
    expect(() => parseBookingComReservationBatch(fixture.replace("</OTA_HotelResNotifRQ>", "")))
      .toThrow("incomplete_xml_document");
  });

  it("preserves Booking.com room indexes and indicates whether the received total includes taxes", () => {
    const beforeTax = fixture.replace('AmountAfterTax="32550"', 'AmountBeforeTax="30000"')
      .replace('IndexNumber="1"', 'IndexNumber="7"');
    expect(parseBookingComReservationBatch(beforeTax)[0]?.rooms[0]).toMatchObject({
      providerRoomIndex: 7,
      totalMinor: 30000,
      totalBasis: "before_tax",
    });
  });

  it("keeps Payments Clarity v2 guest and hotel totals and tax responsibility separate", () => {
    const priceDetails = `<PriceDetails>
      <GuestView><Taxes><Tax Amount="550" DecimalPlaces="2" CurrencyCode="USD" Type="Exclusive" Code="15" ChargeFrequency="1"><TaxDescription><Text>City tax</Text></TaxDescription></Tax></Taxes><Total Amount="33100" DecimalPlaces="2" CurrencyCode="USD"/></GuestView>
      <HotelView><Taxes><Tax Amount="550" DecimalPlaces="2" CurrencyCode="USD" Type="Inclusive" Code="15" ChargeFrequency="1"><TaxDescription><Text>City tax</Text></TaxDescription></Tax><Tax Amount="250" DecimalPlaces="2" CurrencyCode="USD" Type="Exclusive" Code="18"><TaxDescription><Text>Withheld lodging tax</Text></TaxDescription></Tax></Taxes><NetPrice Amount="30000" DecimalPlaces="2" CurrencyCode="USD"/><Total Amount="32550" DecimalPlaces="2" CurrencyCode="USD"/></HotelView>
    </PriceDetails>`;
    const parsed = parseBookingComReservationBatch(fixture.replace('<BasicPropertyInfo HotelCode="12345"/>', `${priceDetails}<BasicPropertyInfo HotelCode="12345"/>`));
    expect(parsed[0]?.rooms[0]?.priceDetails).toEqual({
      guestView: { taxes: [{ amountMinor: 550, currency: "USD", type: "exclusive", classification: "unknown", code: "15", chargeFrequency: "1", description: "City tax" }], totalMinor: 33100 },
      hotelView: { taxes: [
        { amountMinor: 550, currency: "USD", type: "inclusive", classification: "unknown", code: "15", chargeFrequency: "1", description: "City tax" },
        { amountMinor: 250, currency: "USD", type: "exclusive", classification: "tax", code: "18", description: "Withheld lodging tax" },
      ], netPriceMinor: 30000, totalMinor: 32550 },
    });
    expect(JSON.stringify(parsed)).not.toContain("PaymentCard");
  });

  it("classifies documented Booking.com fee and tax codes without guessing unknown codes", () => {
    const fixtureWithFees = fixture.replace(
      '<BasicPropertyInfo HotelCode="12345"/>',
      `<PriceDetails><GuestView><Taxes><Tax Amount="125" DecimalPlaces="2" CurrencyCode="USD" Type="Inclusive" Code="14"/><Tax Amount="50" DecimalPlaces="2" CurrencyCode="USD" Type="Exclusive" Code="41"/></Taxes><Total Amount="10175" DecimalPlaces="2" CurrencyCode="USD"/></GuestView><HotelView><Taxes><Tax Amount="125" DecimalPlaces="2" CurrencyCode="USD" Type="Inclusive" Code="14"/><Tax Amount="50" DecimalPlaces="2" CurrencyCode="USD" Type="Exclusive" Code="41"/></Taxes><Total Amount="10175" DecimalPlaces="2" CurrencyCode="USD"/></HotelView></PriceDetails><BasicPropertyInfo HotelCode="12345"/>`,
    );
    const [reservation] = parseBookingComReservationBatch(fixtureWithFees);
    expect(reservation?.rooms[0]?.priceDetails?.guestView.taxes.map((charge) => charge.classification)).toEqual(["fee", "unknown"]);
  });

  it("captures only recognized payment and rate models needed for folio review", () => {
    const pbb = fixture
      .replace('<RatePlans><RatePlan RatePlanCode="bar"/></RatePlans>', '<RatePlans><RatePlan RatePlanCode="bar"/></RatePlans><RoomRates><RoomRate><TPA_Extensions><PropertyBusinessModel BusinessModel="net_rate"/></TPA_Extensions></RoomRate></RoomRates>')
      .replace('<ResGlobalInfo>', '<ResGlobalInfo><DepositPayments><GuaranteePayment GuaranteeType="PrePay"><Description><Text>Payment on Booking.com</Text></Description></GuaranteePayment></DepositPayments>');
    const parsed = parseBookingComReservationBatch(pbb)[0];
    expect(parsed?.paymentMode).toBe("payments_by_booking");
    expect(parsed?.rooms[0]?.businessModel).toBe("net_rate");

    const payAtProperty = fixture.replace('<ResGlobalInfo>', '<ResGlobalInfo><DepositPayments><GuaranteePayment><Description><Text>Guests pay at the property</Text></Description></GuaranteePayment></DepositPayments>');
    expect(parseBookingComReservationBatch(payAtProperty)[0]?.paymentMode).toBe("pay_at_property");
  });

  it("rejects malformed Payments Clarity taxes rather than silently dropping financial detail", () => {
    const malformed = fixture.replace('<BasicPropertyInfo HotelCode="12345"/>', `<PriceDetails><GuestView><Taxes><Tax Amount="550" Type="Unknown"/></Taxes></GuestView><HotelView><Total Amount="32550"/></HotelView></PriceDetails><BasicPropertyInfo HotelCode="12345"/>`);
    expect(() => parseBookingComReservationBatch(malformed)).toThrow("reservation_tax_type_invalid");
    const mixedCurrency = fixture.replace('<BasicPropertyInfo HotelCode="12345"/>', `<PriceDetails><GuestView><Taxes><Tax Amount="550" DecimalPlaces="2" CurrencyCode="EUR" Type="Exclusive"/></Taxes></GuestView><HotelView><Total Amount="32550" DecimalPlaces="2" CurrencyCode="USD"/></HotelView></PriceDetails><BasicPropertyInfo HotelCode="12345"/>`);
    expect(() => parseBookingComReservationBatch(mixedCurrency)).toThrow("reservation_price_currency_mismatch");
  });
});
