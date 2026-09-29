import { describe, expect, it } from "vitest";
import { getPresentedRooms, getReviewPresentation } from "../lib/marketplace-presentation";

describe("marketplace presentation", () => {
  it("shows exact partner room names, rates, and capacity", () => {
    const rooms = getPresentedRooms("database", [{
      id: "room-1",
      name: "Ocean View King",
      baseRate: 425,
      maxGuests: 3,
      availabilityVerified: true
    }], 999);
    expect(rooms).toEqual([{
      id: "room-1",
      name: "Ocean View King",
      price: 425,
      notes: ["Up to 3 guests", "Available for every selected night"],
      bookable: true
    }]);
  });

  it("labels demo rooms as non-bookable examples", () => {
    const rooms = getPresentedRooms("demo", [], 300);
    expect(rooms).toHaveLength(2);
    expect(rooms.every((room) => !room.bookable && room.name.startsWith("Example"))).toBe(true);
  });

  it("does not claim guest satisfaction before reviews exist", () => {
    expect(getReviewPresentation(0, 0)).toEqual({
      score: "New",
      label: "New to iRatePilot",
      detail: "No verified guest reviews yet"
    });
    expect(getReviewPresentation(9.4, 1).detail).toBe("1 verified guest review");
  });

  it("labels demonstration review data as illustrative", () => {
    expect(getReviewPresentation(9.2, 1843, "demo")).toEqual({
      score: "9.2",
      label: "Illustrative score",
      detail: "Sample review data for this private demo",
    });
  });
});
