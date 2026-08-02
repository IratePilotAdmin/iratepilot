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
        futureInventory: false
      },
      missing: ["primary photo", "amenities", "active room type", "future sellable inventory"]
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
    expect(readiness.requirements.futureInventory).toBe(false);
    expect(readiness.ready).toBe(false);
  });

  it("marks a complete listing ready for publication", () => {
    const readiness = getPropertyReadiness({
      image_url: "https://example.com/hotel.jpg",
      amenities: ["Pool", "Wi-Fi"],
      rooms: [{ active: true, inventory: [{ stay_date: today, available_units: 1 }] }]
    }, today);

    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
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
