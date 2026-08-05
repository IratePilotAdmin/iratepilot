import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const preflight = readFileSync(
  new URL("../supabase/production_preflight.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("production database preflight", () => {
  it("checks the final pilot migration objects", () => {
    expect(preflight).toContain("public.booking_messages");
    expect(preflight).toContain("public.send_booking_message(uuid,text)");
    expect(preflight).toContain("public.cancel_unpaid_confirmed_booking(uuid,text)");
  });

  it("remains read-only", () => {
    for (const statement of [
      "insert ", "update ", "delete ", "alter ", "drop ", "create ",
      "truncate ", "grant ", "revoke ",
    ]) {
      expect(preflight).not.toContain(statement);
    }
  });
});
