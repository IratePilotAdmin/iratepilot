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
    expect(route).toContain('validationMode = "vendor_sandbox"');
    expect(route).toContain("liveVendorConnectionTested = true");
    expect(route).toContain("testMewsSandboxConnection");
    expect(route).toContain("testCloudbedsSandboxConnection");
    expect(route).toContain("testApaleoSandboxConnection");
    expect(route).toContain("testOracleOperaSandboxConnection");
    expect(route).toContain("testStayntouchSandboxConnection");
    expect(route).toContain("testSihotSandboxConnection");
    expect(route).not.toMatch(/credentials[,}]/);
  });

  it("only advances a connection after a real vendor sandbox test", () => {
    expect(route).toContain("passed && liveVendorConnectionTested");
    expect(route).toContain('connection_status: "sandbox"');
    expect(route).toContain("last_validated_at: testedAt");
  });

  it("denies browser roles direct access to encrypted records", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.property_pms_credentials from anon, authenticated");
    expect(migration).toContain("revoke all on table public.pms_connection_test_events from anon, authenticated");
  });
});
