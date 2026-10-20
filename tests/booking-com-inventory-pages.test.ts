import { describe, expect, it } from "vitest";
import { loadBookingComInventoryPages } from "@/services/hotel-channels/booking-com/inventory-pages";

describe("Booking.com inventory pagination", () => {
  it("advances by the returned row count when the API cap is below 1,000", async () => {
    const rows = Array.from({ length: 1_250 }, (_, index) => index);
    const ranges: [number, number][] = [];
    const loaded = await loadBookingComInventoryPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, Math.min(to + 1, from + 500)), error: null };
    });
    expect(loaded).toEqual(rows);
    expect(ranges).toEqual([[0, 999], [500, 1_499], [1_000, 1_999], [1_250, 2_249]]);
  });

  it("fails closed instead of silently truncating a scope over 50,000 rows", async () => {
    await expect(loadBookingComInventoryPages(async (from, to) => ({
      data: Array.from({ length: Math.min(to - from + 1, 50_001 - from) }, (_, index) => from + index),
      error: null,
    }))).rejects.toThrow("booking_com_sync_inventory_too_large");
  });
});
