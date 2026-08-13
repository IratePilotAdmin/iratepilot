import { describe, expect, it, vi } from "vitest";
import { createSihotSyncAdapter, loadSihotSyncConfig } from "../services/hotel-suppliers/sihot";
import type { SihotFetch } from "../services/hotel-suppliers/sihot";

const config = loadSihotSyncConfig({
  PMS_SIHOT_BASE_URL: "https://api.sihot.example/services/v2.0/",
  PMS_SIHOT_SECURITY_ID: "security-id",
  PMS_SIHOT_CURRENCY: "USD",
  PMS_SIHOT_CATEGORIES: "DLXK",
  PMS_SIHOT_SERVICE_CODES: "ROOM",
  PMS_SIHOT_ORDERER_OBJECT_ID: "42",
  PMS_SIHOT_RESERVATION_TYPE: "1",
  PMS_SIHOT_CANCELLATION_REASON: "GUEST",
});

describe("SIHOT booking synchronization", () => {
  it("combines live category availability and rate results", async () => {
    const fetcher = vi.fn<SihotFetch>(async (url) => {
      if (String(url).endsWith("S_AVAILABILITY_SEARCH_V002")) {
        return new Response(JSON.stringify({ Result: { Success: true }, AVAILABILITY: {
          "AVAILABILITY-DAY": [
            { date: "2026-09-10", "AVAILABILITY-ENTRY": [{ category: "DLXK", available: 2 }] },
            { date: "2026-09-11", "AVAILABILITY-ENTRY": [{ category: "DLXK", available: 1 }] },
          ],
        } }));
      }
      return new Response(JSON.stringify({ Result: { Success: true }, "RATE-RESULT": [{
        category: "DLXK", servicecode: "ROOM", ratecategory: "BAR", currencyamount: 440,
      }] }));
    });
    const offers = await createSihotSyncAdapter(config, fetcher).availability({
      propertyCode: "4711", arrivalDate: "2026-09-10", departureDate: "2026-09-12", adults: 2,
    });
    expect(offers).toMatchObject([{ roomTypeCode: "DLXK", ratePlanCode: "BAR", totalAmount: 440, available: true }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("creates and cancels reservations with mapped SIHOT identifiers", async () => {
    const fetcher = vi.fn<SihotFetch>(async (url) => String(url).includes("CREATE")
      ? new Response(JSON.stringify({ Result: { Success: true }, "RESERVATION-OBJID": "8885", resno: 20007766 }))
      : new Response(JSON.stringify({ Result: { Success: true } })));
    const adapter = createSihotSyncAdapter(config, fetcher);
    const offerId = btoa(JSON.stringify({ category: "DLXK", serviceCode: "ROOM", rateCategory: "BAR" }))
      .replaceAll("=", "");
    const reservation = await adapter.createReservation({
      propertyCode: "4711", arrivalDate: "2026-09-10", departureDate: "2026-09-12",
      adults: 2, externalReference: "IRP-500", offerId,
      guest: { firstName: "Ava", lastName: "Guest", email: "ava@example.com" },
    });
    expect(reservation).toMatchObject({ reservationId: "8885", confirmationNumber: "20007766" });
    const createBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(createBody.RESERVATION).toMatchObject({
      hotel: "4711", category: "DLXK", ratecategory: "BAR", externalreference: "IRP-500",
      ORDERER: { "ORDERER-OBJID": "42" },
    });

    await expect(adapter.cancelReservation({
      propertyCode: "4711", reservationId: "8885", externalReference: "IRP-500", reason: "Plans changed",
    })).resolves.toMatchObject({ reservationId: "8885", status: "CANCELED" });
  });

  it("requires deployment-specific SIHOT mappings", () => {
    expect(() => loadSihotSyncConfig({})).toThrow("PMS_SIHOT_BASE_URL");
  });
});
