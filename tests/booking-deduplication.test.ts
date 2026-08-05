import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020001_booking_request_deduplication.sql", import.meta.url),
  "utf8",
);

describe("booking request deduplication migration", () => {
  it("blocks duplicate open stays without preventing retries after cancellation", () => {
    expect(migration).toContain("group by customer_id, room_id, check_in, check_out");
    expect(migration).toContain("having count(*) > 1");
    expect(migration).toContain("where status in ('pending', 'confirmed')");
  });
});
