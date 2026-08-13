import { describe, expect, it, vi } from "vitest";
import {
  createRmsCloudSyncAdapter,
  loadRmsCloudSyncConfig,
  RmsCloudBookingMapper,
} from "../services/hotel-suppliers/rms-cloud";

const mapper = new RmsCloudBookingMapper({
  currency: "USD", agentId: 2, categoryIds: [9], bookingSourceId: 3, reservationTypeId: 8,
});
const availability = { propertyCode: "128", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2 };

describe("RmsCloudBookingMapper", () => {
  it("maps documented availableFacilities results into a bookable offer", () => {
    expect(mapper.availabilityPayload(availability)).toEqual({
      adults: 2, agentId: 2, categoryIds: [9], children: 0, infants: 0,
      dateFrom: "2026-09-10", dateTo: "2026-09-12",
    });
    const offers = mapper.availabilityResponse([{
      facilities: [{ rateId: 1159, categoryId: 9, areas: [{ areaId: 36, availability: [
        { available: true, rate: 175, dateFrom: "2026-09-10" },
        { available: true, rate: 180, dateFrom: "2026-09-11" },
      ] }] }],
    }], availability);
    expect(offers[0]).toMatchObject({ roomTypeCode: "9", ratePlanCode: "1159", totalAmount: 355, available: true });
  });

  it("creates a guest and documented reservation body without payment data", () => {
    const [offer] = mapper.availabilityResponse([{ facilities: [{ rateId: 1159, categoryId: 9, areas: [{ areaId: 36, availability: [{ available: true, rate: 175 }] }] }] }], availability);
    const input = { ...availability, offerId: offer!.offerId, externalReference: "IRP-100", guest: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" } };
    expect(mapper.guestPayload(input)).toMatchObject({ propertyId: 128, guestGiven: "Ada", guestSurname: "Lovelace", externalRefId: "IRP-100" });
    expect(mapper.createReservationPayload(input, 77)).toMatchObject({
      propertyId: 128, guestId: 77, areaId: 36, categoryId: 9, rateTypeId: 1159,
      bookingSourceId: 3, resTypeId: 8, otaRef1: "IRP-100",
    });
  });

  it("normalizes reservation creation and requires confirmed cancellation", () => {
    const input = { ...availability, offerId: "unused", externalReference: "IRP-100", guest: { firstName: "Ada", lastName: "Lovelace" } };
    expect(mapper.createReservationResponse([{ id: 9001, onlineConfirmationId: "RMS-1", statusName: "Unconfirmed" }], input))
      .toMatchObject({ reservationId: "9001", confirmationNumber: "RMS-1", status: "Unconfirmed" });
    const cancellation = { propertyCode: "128", reservationId: "9001", externalReference: "IRP-100" };
    expect(mapper.cancelReservationResponse([{ status: { status: "cancelled" } }], cancellation).status).toBe("CANCELED");
    expect(() => mapper.cancelReservationResponse([{ status: { status: "confirmed" } }], cancellation)).toThrow("did not confirm");
  });
});

describe("RMS Cloud synchronization", () => {
  it("loads fail-closed configuration", () => {
    const config = loadRmsCloudSyncConfig({
      PMS_RMS_CLOUD_AUTH_TOKEN: "token", PMS_RMS_CLOUD_CURRENCY: "USD",
      PMS_RMS_CLOUD_AGENT_ID: "2", PMS_RMS_CLOUD_CATEGORY_IDS: "9, 10",
      PMS_RMS_CLOUD_BOOKING_SOURCE_ID: "3", PMS_RMS_CLOUD_RESERVATION_TYPE_ID: "8",
    });
    expect(config.mapper.categoryIds).toEqual([9, 10]);
    expect(createRmsCloudSyncAdapter(config).providerId).toBe("rms-cloud");
    expect(() => loadRmsCloudSyncConfig({})).toThrow("PMS_RMS_CLOUD_AUTH_TOKEN");
  });

  it("creates the guest before the reservation", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 77 }]), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 9001, statusName: "Unconfirmed" }]), { status: 201 }));
    const adapter = createRmsCloudSyncAdapter({
      transport: { baseUrl: "https://restapi8.rmscloud.com/", authToken: "token" },
      mapper: { currency: "USD", agentId: 2, categoryIds: [9], bookingSourceId: 3, reservationTypeId: 8 },
    }, fetcher);
    const offerId = mapper.availabilityResponse([{ facilities: [{ rateId: 1159, categoryId: 9, areas: [{ areaId: 36, availability: [{ available: true, rate: 175 }] }] }] }], availability)[0]!.offerId;
    await adapter.createReservation({ ...availability, offerId, externalReference: "IRP-100", guest: { firstName: "Ada", lastName: "Lovelace" } });
    expect(new URL(fetcher.mock.calls[0]![0] as string).pathname).toBe("/guests");
    expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toMatchObject({ guestId: 77, categoryId: 9, rateTypeId: 1159 });
  });
});
