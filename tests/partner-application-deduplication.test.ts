import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../app/api/partners/apply/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020010_partner_application_deduplication.sql", import.meta.url),
  "utf8",
);

describe("partner application deduplication", () => {
  it("blocks duplicate pending applications by normalized email after a legacy-data check", () => {
    expect(migration).toContain("group by lower(trim(email))");
    expect(migration).toContain("having count(*) > 1");
    expect(migration).toContain("create unique index if not exists one_pending_partner_application_per_email");
    expect(migration).toContain("where status = 'pending'");
  });

  it("returns the same accepted response for a repeated application", () => {
    expect(route).toContain('error?.code === "23505"');
    expect(route.match(/NextResponse\.json\(\{ status: "received" \}, \{ status: 201 \}\)/g))
      .toHaveLength(2);
  });
});
