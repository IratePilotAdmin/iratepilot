import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608020003_subscription_webhook_ordering.sql", import.meta.url),
  "utf8",
);

describe("subscription webhook ordering migration", () => {
  it("tracks the latest traveler and partner subscription events", () => {
    expect(migration).toContain("membership_synced_at timestamptz");
    expect(migration).toContain("subscription_synced_at timestamptz");
  });
});
