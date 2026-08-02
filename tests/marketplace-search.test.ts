import { describe, expect, it } from "vitest";
import {
  getAvailableRoomRates,
  getAvailableRooms,
  getHotelSearchHref,
  matchesMarketplaceDestination,
  parseMarketplaceSearch,
  parseHotelStay,
} from "../lib/marketplace-search";

const criteria = {
  destination: "Miami Beach",
  checkIn: "2026-08-10",
  checkOut: "2026-08-12",
  guests: 2,
};

describe("marketplace search", () => {
  it("validates complete future search criteria", () => {
    const query = { ...criteria, guests: "2" };
    expect(parseMarketplaceSearch(query, new Date("2026-08-02T12:00:00Z"))).toMatchObject({
      criteria,
      error: null,
    });
    expect(parseMarketplaceSearch({ ...query, checkOut: "2026-08-10" }, new Date("2026-08-02T12:00:00Z")).error)
      .toBe("Choose a stay between 1 and 30 nights.");
    expect(parseMarketplaceSearch({ destination: "Charleston" }, new Date("2026-08-02T12:00:00Z")).criteria)
      .toEqual({ destination: "Charleston" });
    expect(parseHotelStay({ checkIn: "2026-08-10", checkOut: "2026-08-12", guests: "2" }, new Date("2026-08-02T12:00:00Z")).criteria)
      .toEqual({ checkIn: "2026-08-10", checkOut: "2026-08-12", guests: 2 });
  });

  it("requires every night and sufficient room capacity", () => {
    const availableRoom = {
      active: true,
      base_rate: 300,
      max_guests: 2,
      inventory: [
        { stay_date: "2026-08-10", available_units: 1, rate: 300 },
        { stay_date: "2026-08-11", available_units: 1, rate: 400 },
      ],
    };
    expect(getAvailableRoomRates([availableRoom], criteria)).toEqual([350]);
    expect(getAvailableRooms([{ ...availableRoom, id: "room-1" }], criteria)).toMatchObject([{
      id: "room-1",
      averageNightlyRate: 350,
      staySubtotal: 700,
    }]);
    expect(getAvailableRoomRates([{ ...availableRoom, max_guests: 1 }], criteria)).toEqual([]);
    expect(getAvailableRoomRates([{ ...availableRoom, inventory: availableRoom.inventory.slice(0, 1) }], criteria)).toEqual([]);
  });

  it("matches destinations and forwards stay details to the hotel page", () => {
    expect(matchesMarketplaceDestination({ name: "Azure Grand", city: "Miami Beach", country: "United States" }, "miami"))
      .toBe(true);
    expect(getHotelSearchHref("azure-grand", criteria))
      .toBe("/hotels/azure-grand?checkIn=2026-08-10&checkOut=2026-08-12&guests=2");
  });
});
