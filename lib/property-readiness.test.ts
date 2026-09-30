import { describe, expect, it } from "vitest";
import { getPropertyReadiness } from "./property-readiness";

const today = "2026-08-01";

describe("property publication readiness", () => {
  it("requires content, an active room, and future sellable inventory", () => {
    expect(getPropertyReadiness({}, today)).toEqual({
      ready: false,
      requirements: {
        primaryPhoto: false,
        amenities: false,
        activeRoom: false,
        roomCommercialTerms: false,
        futureInventory: false
      },
      missing: [
        "primary photo", "amenities", "active room type",
        "rate plans, currency, and cancellation terms for every active room",
        "future sellable inventory with rates, taxes, and mandatory fees for every active room"
      ]
    });
  });

  it("ignores inventory for inactive rooms, past dates, and sold-out dates", () => {
    const readiness = getPropertyReadiness({
      image_url: "https://example.com/hotel.jpg",
      amenities: ["Pool"],
      rooms: [
        { active: false, inventory: [{ stay_date: "2026-08-10", available_units: 2 }] },
        { active: true, inventory: [{ stay_date: "2026-07-31", available_units: 2 }, { stay_date: "2026-08-10", available_units: 0 }] }
      ]
    }, today);

    expect(readiness.requirements.activeRoom).toBe(true);
    expect(readiness.requirements.roomCommercialTerms).toBe(false);
    expect(readiness.requirements.futureInventory).toBe(false);
    expect(readiness.ready).toBe(false);
  });

  it("marks a complete listing ready for publication", () => {
    const readiness = getPropertyReadiness({
      image_url: "https://example.com/hotel.jpg",
      amenities: ["Pool", "Wi-Fi"],
      rooms: [{
        active: true,
        base_rate: "180.00",
        max_guests: 4,
        direct_rate_plan_code: "BAR",
        direct_rate_plan_name: "Best available rate",
        direct_currency_code: "USD",
        direct_cancellation_policy: "Free cancellation until 24 hours before arrival.",
        direct_cancellation_policy_version: "2026-09-v1",
        inventory: [{
          stay_date: today, available_units: 1, rate: "180.00",
          direct_tax_amount: "18.00", direct_mandatory_fee_amount: "5.00"
        }]
      }]
    }, today);

    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
  });

  it("requires every active room to have priced future inventory with explicit tax and fee amounts", () => {
    const room = {
      active: true,
      base_rate: 180,
      max_guests: 2,
      direct_rate_plan_code: "BAR",
      direct_rate_plan_name: "Best available rate",
      direct_currency_code: "USD",
      direct_cancellation_policy: "Free cancellation until 24 hours before arrival.",
      direct_cancellation_policy_version: "2026-09-v1",
      inventory: [{ stay_date: today, available_units: 2, rate: 180, direct_tax_amount: 18, direct_mandatory_fee_amount: 5 }]
    };
    const readiness = getPropertyReadiness({
      image_url: "https://example.com/hotel.jpg",
      amenities: ["Pool"],
      rooms: [room, { ...room, inventory: [] }]
    }, today);

    expect(readiness.requirements.roomCommercialTerms).toBe(true);
    expect(readiness.requirements.futureInventory).toBe(false);
    expect(readiness.missing).toContain("future sellable inventory with rates, taxes, and mandatory fees for every active room");
  });

  it("does not treat missing tax or fee values as zero", () => {
    const readiness = getPropertyReadiness({
      image_url: "https://example.com/hotel.jpg",
      amenities: ["Pool"],
      rooms: [{
        active: true,
        base_rate: 180,
        max_guests: 2,
        direct_rate_plan_code: "BAR",
        direct_rate_plan_name: "Best available rate",
        direct_currency_code: "USD",
        direct_cancellation_policy: "Free cancellation until 24 hours before arrival.",
        direct_cancellation_policy_version: "2026-09-v1",
        inventory: [{ stay_date: today, available_units: 2, rate: 180, direct_tax_amount: null, direct_mandatory_fee_amount: null }]
      }]
    }, today);

    expect(readiness.requirements.futureInventory).toBe(false);
  });

  it("does not approve an insecure property image URL", () => {
    const readiness = getPropertyReadiness({
      image_url: "http://example.com/hotel.jpg",
      amenities: ["Pool"],
      rooms: [{ active: true, inventory: [{ stay_date: today, available_units: 1 }] }]
    }, today);

    expect(readiness.requirements.primaryPhoto).toBe(false);
    expect(readiness.ready).toBe(false);
  });
});
