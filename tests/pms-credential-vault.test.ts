import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../app/api/admin/integrations/pms/credentials/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608070032_secure_pms_credentials.sql", import.meta.url),
  "utf8",
);

describe("PMS credential vault", () => {
  it("is admin-only and stores credentials through the service role", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain("createAdminClient()");
    expect(route).toContain("encryptPmsCredentials(environment)");
  });

  it("never returns credential values and labels tests honestly", () => {
    expect(route).toContain('validationMode: "configuration_only"');
    expect(route).toContain("liveVendorConnectionTested: false");
    expect(route).not.toMatch(/credentials[,}]/);
  });

  it("denies browser roles direct access to encrypted records", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.property_pms_credentials from anon, authenticated");
    expect(migration).toContain("revoke all on table public.pms_connection_test_events from anon, authenticated");
  });
});
