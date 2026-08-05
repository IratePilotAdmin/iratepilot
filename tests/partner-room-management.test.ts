import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { roomUpdateSchema } from "../lib/validation";

const route = readFileSync(new URL("../app/api/partner/rates/route.ts", import.meta.url), "utf8");
const manager = readFileSync(new URL("../components/dashboard/rates-inventory-manager.tsx", import.meta.url), "utf8");

describe("partner room management", () => {
  it("validates room edits and coerces form status values", () => {
    expect(roomUpdateSchema.parse({
      roomId: "d498ed39-d34f-498f-84d3-9fe523f8ce65",
      name: "Deluxe King",
      maxGuests: "3",
      baseRate: "289.50",
      active: "false",
    })).toEqual({
      roomId: "d498ed39-d34f-498f-84d3-9fe523f8ce65",
      name: "Deluxe King",
      maxGuests: 3,
      baseRate: 289.5,
      active: false,
    });
  });

  it("checks approved ownership before updating a room", () => {
    const updateBlock = route.slice(
      route.indexOf('body.action === "update_room"'),
      route.indexOf('body.action === "set_inventory"'),
    );
    expect(updateBlock).toContain('select("id,properties!inner(partner_id)")');
    expect(updateBlock).toContain('.eq("properties.partner_id", partner.id)');
    expect(updateBlock.indexOf("maybeSingle()"))
      .toBeLessThan(updateBlock.indexOf('.from("rooms").update'));
  });

  it("exposes room editing and retirement controls in the dashboard", () => {
    expect(manager).toContain('send(event, "update_room")');
    expect(manager).toContain("Retired from new bookings");
    expect(manager).toContain("Save room type");
  });
});
