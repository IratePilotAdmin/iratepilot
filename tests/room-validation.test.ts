import { describe, expect, it } from "vitest";
import { roomSchema, roomUpdateSchema } from "../lib/validation";

describe("partner room validation", () => {
  it("normalizes room creation and update values", () => {
    const created = roomSchema.parse({
      propertyId: "11111111-1111-4111-8111-111111111111",
      name: "  Deluxe King  ",
      maxGuests: "2",
      baseRate: "199.50"
    });
    const updated = roomUpdateSchema.parse({
      roomId: "22222222-2222-4222-8222-222222222222",
      name: "  Premium King  ",
      maxGuests: "3",
      baseRate: "249",
      active: false
    });

    expect(created).toMatchObject({ name: "Deluxe King", maxGuests: 2, baseRate: 199.5 });
    expect(updated).toMatchObject({ name: "Premium King", maxGuests: 3, baseRate: 249, active: false });
  });

  it("rejects unsafe capacity and rate values", () => {
    expect(roomUpdateSchema.safeParse({
      roomId: "22222222-2222-4222-8222-222222222222",
      name: "King",
      maxGuests: 0,
      baseRate: 20,
      active: true
    }).success).toBe(false);
  });
});
