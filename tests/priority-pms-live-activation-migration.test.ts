import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202608100035_priority_pms_live_activation.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608100035_priority_pms_live_activation.rollback.sql", import.meta.url),
  "utf8",
);

describe("priority PMS live activation migration", () => {
  it("adds ordered webhook, production smoke, and live traffic gates", () => {
    expect(migration).toContain("webhook_validated boolean not null default false");
    expect(migration).toContain("production_smoke_validated boolean not null default false");
    expect(migration).toContain("live_enabled boolean not null default false");
    expect(migration).toContain("not webhook_validated or sandbox_validated");
    expect(migration).toContain("not production_smoke_validated or webhook_validated");
    expect(migration).toContain("not live_enabled or production_smoke_validated");
  });

  it("refuses to erase recorded activation evidence", () => {
    expect(rollback).toContain("Refusing rollback: priority PMS live activation evidence exists");
    expect(rollback).toContain("where webhook_validated or production_smoke_validated or live_enabled");
  });
});
