import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202610290175_ratehawk_certification_operations_receipts.sql", import.meta.url),
  "utf8",
);

describe("RateHawk certification operations receipts migration", () => {
  it("stores sanitized certification evidence with expected negative outcomes", () => {
    expect(migration).toContain("create table public.ratehawk_certification_receipts");
    expect(migration).toContain("scenario = 'unknown_soldout' and final_status = 'failed' and final_error = 'soldout'");
    expect(migration).toContain("scenario = 'unknown_book_limit' and final_status = 'failed' and final_error = 'book_limit'");
    expect(migration).toContain("alter table public.ratehawk_certification_receipts enable row level security");
    expect(migration).toContain("grant select, insert on table public.ratehawk_certification_receipts");
    expect(migration).not.toMatch(/api_key|client_secret|raw_response|book_hash/i);
  });

  it("reports only the latest PMS test state per connection", () => {
    expect(migration).toContain("create view public.latest_pms_connection_test_events");
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("select distinct on (connection_id)");
    expect(migration).toContain("order by connection_id, created_at desc, id desc");
    expect(migration).toContain("grant select on table public.latest_pms_connection_test_events");
  });
});
