import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(
  new URL("../components/dashboard/synxis-crs-readiness.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../components/dashboard/admin-settings.tsx", import.meta.url),
  "utf8",
);

describe("SynXis admin certification dashboard", () => {
  it("appears in the protected admin settings experience", () => {
    expect(settings).toContain('import { SynxisCrsReadiness }');
    expect(settings).toContain("<SynxisCrsReadiness />");
    expect(dashboard).toContain("Sabre SynXis certification");
    expect(dashboard).toContain("This is separate from the PMS provider list.");
  });

  it("loads and updates only through the protected evidence endpoint", () => {
    expect(dashboard).toContain('fetch("/api/admin/integrations/crs/synxis"');
    expect(dashboard).toContain('method: "PATCH"');
    expect(dashboard).toContain('cache: "no-store"');
  });

  it("renders every ordered certification gate", () => {
    expect(dashboard).toContain('key: "vendorApproved"');
    expect(dashboard).toContain('key: "certificationEnvironmentApproved"');
    expect(dashboard).toContain('key: "propertyMapped"');
    expect(dashboard).toContain('key: "sandboxValidated"');
    expect(dashboard).toContain('key: "productionSmokeValidated"');
  });

  it("keeps activation locked behind all prerequisites and an exact phrase", () => {
    expect(dashboard).toContain("data.liveActivationAllowed");
    expect(dashboard).toContain("ENABLE SABRE SYNXIS LIVE TRAFFIC");
    expect(dashboard).toContain("Live activation is locked");
    expect(dashboard).toContain("Do not enter usernames, passwords, API keys, access tokens, or webhook secrets.");
  });

  it("shows the immutable certification activity timeline", () => {
    expect(dashboard).toContain("Certification activity");
    expect(dashboard).toContain("data.historyAvailable");
    expect(dashboard).toContain("Apply migration 041");
    expect(dashboard).toContain("event.changedFields");
    expect(dashboard).toContain("dateTime={event.createdAt}");
  });
});
