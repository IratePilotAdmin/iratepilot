import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST } from "../app/api/partners/apply/route";

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

  it("does not falsely accept initial or repeated applications while intake is unavailable", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST();
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        error: "Full hotel manager applications are not available yet.",
      });
    }
  });
});
