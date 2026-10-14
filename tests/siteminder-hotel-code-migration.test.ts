import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../supabase/migrations/202610140166_unique_siteminder_hotel_codes.sql",
  import.meta.url,
), "utf8");

describe("SiteMinder HotelCode uniqueness", () => {
  it("prevents ambiguous inbound property routing", () => {
    expect(migration).toContain("group by external_property_code");
    expect(migration).toContain("having count(*) > 1");
    expect(migration).toContain("create unique index");
    expect(migration).toContain("where provider_id = 'siteminder'");
  });
});
