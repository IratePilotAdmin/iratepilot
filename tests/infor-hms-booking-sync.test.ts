import { describe, expect, it, vi } from "vitest";
import {
  createInforHmsSyncAdapter,
  InforHmsBookingMapper,
  loadInforHmsSyncConfig,
} from "../services/hotel-suppliers/infor-hms";

const availability = {
  propertyCode: "IH-1",
  arrivalDate: "2026-10-10",
  departureDate: "2026-10-12",
  adults: 2,
};

describe("Infor HMS booking synchronization", () => {
  const env = {
    PMS_INFOR_HMS_BASE_URL: "https://api.infor.example/hms/",
    PMS_INFOR_HMS_ACCESS_TOKEN: "access-token",
    PMS_INFOR_HMS_TENANT_ID: "tenant-1",
    PMS_INFOR_HMS_AVAILABILITY_PATH: "properties/{propertyCode}/availability",
    PMS_INFOR_HMS_CREATE_RESERVATION_PATH: "reservations",
    PMS_INFOR_HMS_CANCEL_RESERVATION_PATH: "reservations/{reservationId}/cancel",
    PMS_INFOR_HMS_CURRENCY: "USD",
  };

  it("maps offers and validates configuration", () => {
    const mapper = new InforHmsBookingMapper({ currency: "USD", bookingSourceCode: "IRP" });
    const [offer] = mapper.availabilityResponse({
      rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
    }, availability);
    expect(offer).toMatchObject({
      roomTypeCode: "KING", ratePlanCode: "BAR", totalAmount: 300, available: true,
    });
    expect(createInforHmsSyncAdapter(loadInforHmsSyncConfig(env)).providerId).toBe("infor-hms");
    expect(() => loadInforHmsSyncConfig({})).toThrow("PMS_INFOR_HMS_BASE_URL");
  });

  it("executes the complete booking lifecycle", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rooms: [{ roomTypeCode: "KING", ratePlanCode: "BAR", total: 300, available: true }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        reservationId: "IH-R-10", status: "CONFIRMED",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = createInforHmsSyncAdapter(loadInforHmsSyncConfig(env), fetcher);
    const [offer] = await adapter.availability(availability);
    const reservation = await adapter.createReservation({
      ...availability,
      offerId: offer!.offerId,
      externalReference: "IRP-1001",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    });
    await expect(adapter.cancelReservation({
      propertyCode: "IH-1",
      reservationId: reservation.reservationId,
      externalReference: "IRP-1001",
    })).resolves.toMatchObject({ status: "CANCELED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
