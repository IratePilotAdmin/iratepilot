import { describe, expect, it, vi } from "vitest";
import { hasCurrentBookableHotelProperty } from "../lib/hotels/bookable-hotel-property";

describe("current bookable hotel property evidence", () => {
  it("accepts only an exact successful database result", async () => {
    const ready = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    const unavailable = { rpc: vi.fn(async () => ({ data: false, error: null })) };
    const failed = { rpc: vi.fn(async () => ({ data: null, error: { message: "unavailable" } })) };

    await expect(hasCurrentBookableHotelProperty(ready, "property-a")).resolves.toBe(true);
    await expect(hasCurrentBookableHotelProperty(unavailable, "property-a")).resolves.toBe(false);
    await expect(hasCurrentBookableHotelProperty(failed, "property-a")).resolves.toBe(false);
    expect(ready.rpc).toHaveBeenCalledWith("has_current_bookable_hotel_property", {
      p_property_id: "property-a",
    });
  });

  it("fails closed when the database check throws", async () => {
    const client = { rpc: vi.fn(async () => { throw new Error("offline"); }) };
    await expect(hasCurrentBookableHotelProperty(client, "property-a")).resolves.toBe(false);
  });
});
