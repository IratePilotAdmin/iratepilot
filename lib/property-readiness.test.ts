import { describe, expect, it } from "vitest";
import { getPropertyReadiness } from "./property-readiness";

const today = "2026-08-01";
const roomTerms = {
  base_rate: 200,
  max_guests: 2,
  direct_rate_plan_code: "BAR",
  direct_rate_plan_name: "Best Available Rate",
  direct_currency_code: "USD",
  direct_cancellation_policy: "Cancel at least 24 hours before arrival.",
  direct_cancellation_policy_version: "2026-08-01",
};
const inventoryTerms = { rate: 200, direct_tax_amount: 20, direct_mandatory_fee_amount: 0 };

describe("property publication readiness", () => {
  it("requires content, an active room, and future sellable inventory", () => {
    expect(getPropertyReadiness({}, today)).toEqual({
      ready: false,
      requirements: {
        primaryPhoto: false,
        amenities: false,
        activeRoom: false,
        roomTerms: false,
        futureInventory: false
      },
      missing: ["primary photo", "amenities", "active room type", "room rate-plan and cancellation terms", "future sellable inventory with taxes and mandatory fees"]
    });
  });

  it("ignores inventory for inactive rooms, past dates, and sold-out dates", () => {
    const readiness = getPropertyReadiness({
      image_url: "https://example.com/hotel.jpg",
      amenities: ["Pool"],
      rooms: [
        { active: false, ...roomTerms, inventory: [{ stay_date: "2026-08-10", available_units: 2, ...inventoryTerms }] },
        { active: true, ...roomTerms, inventory: [{ stay_date: "2026-07-31", available_units: 2, ...inventoryTerms }, { stay_date: "2026-08-10", available_units: 0, ...inventoryTerms }] }
      ]
    }, today);

    expect(readiness.requirements.activeRoom).toBe(true);
    expect(readiness.requirements.futureInventory).toBe(false);
    expect(readiness.ready).toBe(false);
  });

  it("marks a complete listing ready for publication", () => {
    const readiness = getPropertyReadiness({
      image_url: "https://example.com/hotel.jpg",
      amenities: ["Pool", "Wi-Fi"],
      rooms: [{ active: true, ...roomTerms, inventory: [{ stay_date: today, available_units: 1, ...inventoryTerms }] }]
    }, today);

    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
  });

  it("does not approve an insecure property image URL", () => {
    const readiness = getPropertyReadiness({
      image_url: "http://example.com/hotel.jpg",
      amenities: ["Pool"],
      rooms: [{ active: true, ...roomTerms, inventory: [{ stay_date: today, available_units: 1, ...inventoryTerms }] }]
    }, today);

    expect(readiness.requirements.primaryPhoto).toBe(false);
    expect(readiness.ready).toBe(false);
  });

  it("requires complete booking terms and sellable inventory for every active room", () => {
    const readiness = getPropertyReadiness({
      image_url: "https://example.com/hotel.jpg",
      amenities: ["Pool"],
      rooms: [
        { active: true, ...roomTerms, inventory: [{ stay_date: today, available_units: 1, ...inventoryTerms }] },
        { active: true, ...roomTerms, direct_cancellation_policy: null, inventory: [{ stay_date: today, available_units: 1, ...inventoryTerms, direct_tax_amount: null }] },
      ],
    }, today);

    expect(readiness.requirements.roomTerms).toBe(false);
    expect(readiness.requirements.futureInventory).toBe(false);
    expect(readiness.ready).toBe(false);
  });
});
