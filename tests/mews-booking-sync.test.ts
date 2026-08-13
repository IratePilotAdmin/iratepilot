import { describe, expect, it, vi } from "vitest";
import { MewsBookingMapper, createMewsSyncAdapter, loadMewsSyncConfig } from "../services/hotel-suppliers/mews";
import type { MewsFetch } from "../services/hotel-suppliers/mews";

const mapper = new MewsBookingMapper({
  serviceId: "service-1",
  resourceCategoryId: "category-king",
  rateId: "rate-bar",
  adultAgeCategoryId: "age-adult",
  childAgeCategoryId: "age-child",
});

const stay = {
  propertyCode: "hotel-1",
  arrivalDate: "2026-09-01",
  departureDate: "2026-09-03",
  adults: 2,
  children: 1,
  rooms: 1,
};

describe("MewsBookingMapper", () => {
  it("prices a mapped service, category, rate, and guest composition", () => {
    expect(mapper.availabilityPayload(stay)).toEqual({
      ServiceId: "service-1",
      Reservations: [{
        Identifier: "iratepilot-offer",
        StartUtc: "2026-09-01T14:00:00Z",
        EndUtc: "2026-09-03T10:00:00Z",
        PersonCounts: [
          { AgeCategoryId: "age-adult", Count: 2 },
          { AgeCategoryId: "age-child", Count: 1 },
        ],
        RequestedCategoryId: "category-king",
        RateId: "rate-bar",
      }],
    });
    const [offer] = mapper.availabilityResponse({ ReservationPrices: [{
      Identifier: "iratepilot-offer",
      TotalAmount: { Currency: "USD", GrossValue: 420.5 },
    }] }, stay);
    expect(offer).toMatchObject({
      propertyCode: "hotel-1", roomTypeCode: "category-king", ratePlanCode: "rate-bar",
      currency: "USD", totalAmount: 420.5, available: true,
    });
  });

  it("creates the customer before mapping the reservation", () => {
    const [offer] = mapper.availabilityResponse({ ReservationPrices: [{
      TotalAmount: { Currency: "USD", GrossValue: 420.5 },
    }] }, stay);
    const input = {
      ...stay,
      offerId: offer!.offerId,
      externalReference: "IRP-300",
      guest: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" },
    };
    expect(mapper.addCustomerPayload(input)).toEqual(expect.objectContaining({
      FirstName: "Ada", LastName: "Lovelace", Email: "ada@example.test", OverwriteExisting: true,
    }));
    expect(mapper.addCustomerResponse({ Id: "customer-1" })).toBe("customer-1");
    expect(mapper.createReservationPayload(input, "customer-1")).toEqual(expect.objectContaining({
      ServiceId: "service-1",
      CheckRateApplicability: true,
      CheckOverbooking: true,
      Reservations: [expect.objectContaining({
        CustomerId: "customer-1", BookerId: "customer-1", ChannelNumber: "IRP-300",
        RequestedCategoryId: "category-king", RateId: "rate-bar",
      })],
    }));
  });

  it("normalizes added reservations and sends documented cancellation fields", () => {
    const input = {
      ...stay,
      offerId: "unused",
      externalReference: "IRP-300",
      guest: { firstName: "Ada", lastName: "Lovelace" },
    };
    expect(mapper.createReservationResponse({ Reservations: [{ Reservation: {
      Id: "reservation-1", Number: "MEWS-300", State: "Confirmed",
    } }] }, input)).toMatchObject({
      reservationId: "reservation-1", confirmationNumber: "MEWS-300", status: "Confirmed",
    });
    expect(mapper.cancelReservationPayload({
      propertyCode: "hotel-1", reservationId: "reservation-1", externalReference: "IRP-300",
      reason: "guest request",
    })).toEqual({
      ReservationIds: ["reservation-1"], PostCancellationFee: false,
      SendEmail: false, Notes: "guest request",
    });
  });

  it("requires every hotel mapping before live sync", () => {
    expect(() => loadMewsSyncConfig({})).toThrow("PMS_MEWS_CLIENT_TOKEN");
    expect(() => loadMewsSyncConfig({
      PMS_MEWS_CLIENT_TOKEN: "client", PMS_MEWS_ACCESS_TOKEN: "access", PMS_MEWS_CLIENT: "iRatePilot 1.0",
    })).toThrow("PMS_MEWS_SERVICE_ID");
  });

  it("runs the customer then reservation workflow through the live adapter", async () => {
    const responses = [
      { ReservationPrices: [{ TotalAmount: { Currency: "USD", GrossValue: 420.5 } }] },
      { Id: "customer-1" },
      { Reservations: [{ Reservation: { Id: "reservation-1", Number: "MEWS-300", State: "Confirmed" } }] },
    ];
    const fetcher = vi.fn<MewsFetch>(async () => new Response(JSON.stringify(responses.shift()), { status: 200 }));
    const config = loadMewsSyncConfig({
      PMS_MEWS_BASE_URL: "https://api.mews-demo.test",
      PMS_MEWS_CLIENT_TOKEN: "client", PMS_MEWS_ACCESS_TOKEN: "access", PMS_MEWS_CLIENT: "iRatePilot 1.0",
      PMS_MEWS_SERVICE_ID: "service-1", PMS_MEWS_RESOURCE_CATEGORY_ID: "category-king",
      PMS_MEWS_RATE_ID: "rate-bar", PMS_MEWS_ADULT_AGE_CATEGORY_ID: "age-adult",
      PMS_MEWS_CHILD_AGE_CATEGORY_ID: "age-child",
    });
    const adapter = createMewsSyncAdapter(config, fetcher);
    const [offer] = await adapter.availability(stay);
    const reservation = await adapter.createReservation({
      ...stay, offerId: offer!.offerId, externalReference: "IRP-300",
      guest: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" },
    });
    expect(reservation.reservationId).toBe("reservation-1");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.mews-demo.test/api/connector/v1/reservations/price",
      "https://api.mews-demo.test/api/connector/v1/customers/add",
      "https://api.mews-demo.test/api/connector/v1/reservations/add",
    ]);
  });
});
