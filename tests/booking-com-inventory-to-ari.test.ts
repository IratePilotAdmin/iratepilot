import { describe, expect, it } from "vitest";
import { buildBookingComInventoryAriPlan } from "../services/hotel-channels/booking-com/inventory-to-ari";

const now = new Date("2026-09-25T12:00:00.000Z");
const roomA = "11111111-1111-4111-8111-111111111111";
const roomB = "22222222-2222-4222-8222-222222222222";

describe("Booking.com PMS inventory to ARI planning", () => {
  it("aggregates unique local room capacity and emits mapped nightly rates", () => {
    const requests = buildBookingComInventoryAriPlan({
      channelPropertyId: "booking-property-123",
      currency: "USD",
      priceBasis: "before_tax",
      propertyRoomIds: [roomA, roomB],
      mappings: [
        { providerRoomTypeId: "KING", providerRatePlanId: "BAR", localRoomId: roomA },
        { providerRoomTypeId: "KING", providerRatePlanId: "NRF", localRoomId: roomA },
        { providerRoomTypeId: "KING", providerRatePlanId: "BAR2", localRoomId: roomB },
      ],
      inventory: [
        { roomId: roomA, date: "2026-09-28", availableUnits: 2, nightlyRate: "129.00" },
        { roomId: roomB, date: "2026-09-28", availableUnits: 1, nightlyRate: "139.00" },
      ],
      now,
    });
    const availability = requests.find((request) => request.kind === "availability");
    expect(availability?.body.match(/<AvailStatusMessage\s/g)).toHaveLength(1);
    expect(availability?.body).toContain('BookingLimit="3"');
    const rates = requests.filter((request) => request.kind === "rate");
    expect(rates).toHaveLength(1);
    expect(rates[0].body).toContain('RatePlanCode="BAR"');
    expect(rates[0].body).toContain('AmountBeforeTax="12900"');
    expect(rates[0].body).not.toContain("client-secret");
  });

  it("does not accept cross-property mappings or duplicate source inventory", () => {
    const base = {
      channelPropertyId: "booking-property-123", currency: "USD" as const, priceBasis: "before_tax" as const,
      propertyRoomIds: [roomA], mappings: [{ providerRoomTypeId: "KING", providerRatePlanId: "BAR", localRoomId: roomA }],
      inventory: [{ roomId: roomA, date: "2026-09-28", availableUnits: 1, nightlyRate: "129.00" }], now,
    };
    expect(() => buildBookingComInventoryAriPlan({ ...base, mappings: [{ ...base.mappings[0], localRoomId: roomB }] }))
      .toThrow("mapping_outside_property");
    expect(() => buildBookingComInventoryAriPlan({ ...base, inventory: [base.inventory[0], base.inventory[0]] }))
      .toThrow("duplicate_inventory_snapshot");
    expect(() => buildBookingComInventoryAriPlan({ ...base, inventory: [{ ...base.inventory[0], availableUnits: 501 }] }))
      .toThrow("invalid_inventory_units");
  });

  it("rejects provider capacity overflow, fractional-currency drift, and unmapped inventory", () => {
    const base = {
      channelPropertyId: "booking-property-123", currency: "USD" as const, priceBasis: "before_tax" as const,
      propertyRoomIds: [roomA, roomB],
      mappings: [
        { providerRoomTypeId: "KING", providerRatePlanId: "BAR", localRoomId: roomA },
        { providerRoomTypeId: "KING", providerRatePlanId: "BAR2", localRoomId: roomB },
      ],
      inventory: [
        { roomId: roomA, date: "2026-09-28", availableUnits: 200, nightlyRate: "129.00" },
        { roomId: roomB, date: "2026-09-28", availableUnits: 100, nightlyRate: "129.00" },
      ], now,
    };
    expect(() => buildBookingComInventoryAriPlan(base)).toThrow("availability_exceeds_provider_limit");
    expect(() => buildBookingComInventoryAriPlan({ ...base, currency: "JPY", inventory: [{ ...base.inventory[0], availableUnits: 1, nightlyRate: "129.50" }] }))
      .toThrow("inventory_rate_precision_exceeds_currency");
    expect(() => buildBookingComInventoryAriPlan({ ...base, mappings: [] })).toThrow("invalid_inventory_plan");
  });
});
