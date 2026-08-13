import { describe, expect, it, vi } from "vitest";
import {
  createOracleOpera5SyncAdapter,
  loadOracleOpera5SyncConfig,
  OracleOpera5BookingMapper,
} from "../services/hotel-suppliers/oracle-opera-5";
import type { StandardPmsTransportRequest } from "../services/hotel-suppliers/standard";

const availability = {
  propertyCode: "OP5",
  arrivalDate: "2026-10-10",
  departureDate: "2026-10-12",
  adults: 2,
};
const env = {
  PMS_OPERA5_BASE_URL: "https://ows.opera.example/",
  PMS_OPERA5_AVAILABILITY_PATH: "{propertyCode}/Availability.asmx",
  PMS_OPERA5_AVAILABILITY_SOAP_ACTION: "Availability",
  PMS_OPERA5_CREATE_RESERVATION_PATH: "{propertyCode}/Reservation.asmx",
  PMS_OPERA5_CREATE_RESERVATION_SOAP_ACTION: "CreateBooking",
  PMS_OPERA5_CANCEL_RESERVATION_PATH: "{propertyCode}/Reservation.asmx",
  PMS_OPERA5_CANCEL_RESERVATION_SOAP_ACTION: "CancelBooking",
  PMS_OPERA5_CURRENCY: "USD",
};
const getSoapHeaders = vi.fn(async () => ({ "x-opera-origin": "IRATEPILOT" }));
const buildEnvelope = vi.fn((request: StandardPmsTransportRequest) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Operation>${request.operation}</Operation></soap:Body></soap:Envelope>`);

describe("Oracle OPERA 5 booking synchronization", () => {
  it("maps offers and requires approved SOAP codecs", () => {
    const mapper = new OracleOpera5BookingMapper({ currency: "USD", bookingSourceCode: "IRP" });
    const [offer] = mapper.availabilityResponse({
      rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
    }, availability);
    expect(offer).toMatchObject({ roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 300 });
    const parseResponse = () => ({ rooms: [] });
    expect(createOracleOpera5SyncAdapter(loadOracleOpera5SyncConfig(
      env, getSoapHeaders, buildEnvelope, parseResponse,
    )).providerId).toBe("oracle-opera-5");
    expect(() => loadOracleOpera5SyncConfig({}, getSoapHeaders, buildEnvelope, parseResponse))
      .toThrow("PMS_OPERA5_BASE_URL");
  });

  it("executes the complete SOAP booking lifecycle", async () => {
    const responses = [
      { rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }] },
      { reservationId: "OP5-R-10", confirmationNumber: "CONF-10", status: "CONFIRMED" },
      { status: "CANCELED", cancellationNumber: "CXL-10" },
    ];
    const parseResponse = vi.fn(() => responses.shift());
    const fetcher = vi.fn(async () => new Response("<Response />"));
    const adapter = createOracleOpera5SyncAdapter(loadOracleOpera5SyncConfig(
      env, getSoapHeaders, buildEnvelope, parseResponse,
    ), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({
      ...availability, offerId: offer!.offerId, externalReference: "IRP-1001",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    });
    await expect(adapter.cancelReservation({
      propertyCode: "OP5", reservationId: reservation.reservationId,
      externalReference: "IRP-1001",
    })).resolves.toMatchObject({ status: "CANCELED", cancellationNumber: "CXL-10" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(buildEnvelope).toHaveBeenCalledTimes(3);
    expect(parseResponse).toHaveBeenCalledTimes(3);
  });
});
