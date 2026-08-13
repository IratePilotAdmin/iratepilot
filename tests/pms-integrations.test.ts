import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pmsProviders } from "../services/hotel-suppliers/providers";
import { buildPmsReadiness } from "../services/hotel-suppliers/readiness";

const route = readFileSync(
  new URL("../app/api/admin/integrations/pms/route.ts", import.meta.url),
  "utf8",
);
const adminSettings = readFileSync(
  new URL("../components/dashboard/admin-settings.tsx", import.meta.url),
  "utf8",
);

describe("PMS integration foundation", () => {
  it("registers every requested PMS family exactly once", () => {
    expect(pmsProviders.map((provider) => provider.id)).toEqual([
      "oracle-opera",
      "hilton-pep",
      "hilton-onq",
      "marriott-fosse",
      "marriott-fs-pms",
      "hotelkey",
      "oracle-opera-5",
      "infor-hms",
      "agilysys-pms",
      "planet-protel",
      "mews",
      "stayntouch",
      "cloudbeds",
      "sihot",
      "rms-cloud",
      "maestro-pms",
      "apaleo",
      "shiji-pms",
      "guestline",
      "ezee-absolute",
      "clock-pms-plus",
      "hotelogix",
    ]);
    expect(new Set(pmsProviders.map((provider) => provider.id)).size).toBe(22);
  });

  it("does not report a provider ready until all server credentials exist", () => {
    const partial = buildPmsReadiness({
      PMS_ORACLE_OPERA_BASE_URL: "https://example.invalid",
      PMS_ORACLE_OPERA_CLIENT_ID: "client-id",
    });
    const opera = partial.find((provider) => provider.id === "oracle-opera");

    expect(opera?.status).toBe("credentials_required");
    expect(opera?.missingConfiguration).toEqual([
      "PMS_ORACLE_OPERA_CLIENT_SECRET",
      "PMS_ORACLE_OPERA_APP_KEY",
      "PMS_ORACLE_OPERA_HOTEL_ID",
    ]);
  });

  it("reports readiness without returning any credential values", () => {
    const secret = "do-not-expose-this-secret";
    const result = buildPmsReadiness({
      PMS_HOTELKEY_BASE_URL: "https://partner.example.invalid",
      PMS_HOTELKEY_API_CREDENTIAL: secret,
      PMS_HOTELKEY_VALIDATION_PATH: "/api/v1/properties/test-property",
    });
    const hotelKey = result.find((provider) => provider.id === "hotelkey");

    expect(hotelKey?.status).toBe("ready_for_validation");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("test-property");
  });

  it.each([
    ["apaleo", "PMS_APALEO"],
  ])("validates complete %s configuration without exposing values", (providerId, prefix) => {
    const secret = "provider-secret-value";
    const result = buildPmsReadiness({
      [`${prefix}_BASE_URL`]: "https://partner.example.invalid",
      [`${prefix}_CLIENT_ID`]: "client-id",
      [`${prefix}_CLIENT_SECRET`]: secret,
    });
    const provider = result.find((item) => item.id === providerId);

    expect(provider?.status).toBe("ready_for_validation");
    expect(provider?.invalidConfiguration).toEqual([]);
    expect(JSON.stringify(provider)).not.toContain(secret);
  });

  it("validates the exact credential contract used by the Mews transport", () => {
    const result = buildPmsReadiness({
      PMS_MEWS_BASE_URL: "https://api.mews-demo.com",
      PMS_MEWS_CLIENT_TOKEN: "client-token-value",
      PMS_MEWS_ACCESS_TOKEN: "access-token-value",
      PMS_MEWS_CLIENT: "iRatePilot 1.0.0",
    });
    const mews = result.find((provider) => provider.id === "mews");

    expect(mews?.status).toBe("ready_for_validation");
    expect(mews?.missingConfiguration).toEqual([]);
    expect(mews?.invalidConfiguration).toEqual([]);
    expect(JSON.stringify(mews)).not.toContain("client-token-value");
    expect(JSON.stringify(mews)).not.toContain("access-token-value");
  });

  it("does not accept generic OAuth credentials for the Mews Connector API", () => {
    const result = buildPmsReadiness({
      PMS_MEWS_BASE_URL: "https://api.mews-demo.com",
      PMS_MEWS_CLIENT_ID: "wrong-client-id",
      PMS_MEWS_CLIENT_SECRET: "wrong-client-secret",
    });
    const mews = result.find((provider) => provider.id === "mews");

    expect(mews?.status).toBe("credentials_required");
    expect(mews?.missingConfiguration).toEqual([
      "PMS_MEWS_CLIENT_TOKEN",
      "PMS_MEWS_ACCESS_TOKEN",
      "PMS_MEWS_CLIENT",
    ]);
  });

  it("validates the Cloudbeds API key contract used by its transport", () => {
    const result = buildPmsReadiness({
      PMS_CLOUDBEDS_BASE_URL: "https://api.cloudbeds.com",
      PMS_CLOUDBEDS_API_KEY: "cbat_test-key-value",
      PMS_CLOUDBEDS_SOURCE_ID: "source-123",
    });
    const cloudbeds = result.find((provider) => provider.id === "cloudbeds");

    expect(cloudbeds?.status).toBe("ready_for_validation");
    expect(cloudbeds?.missingConfiguration).toEqual([]);
    expect(cloudbeds?.invalidConfiguration).toEqual([]);
    expect(JSON.stringify(cloudbeds)).not.toContain("cbat_test-key-value");
  });

  it("validates the Stayntouch bearer-token contract used by its transport", () => {
    const result = buildPmsReadiness({
      PMS_STAYNTOUCH_BASE_URL: "https://api.stayntouch.com/connect/",
      PMS_STAYNTOUCH_ACCESS_TOKEN: "stayntouch-sandbox-token",
    });
    const stayntouch = result.find((provider) => provider.id === "stayntouch");

    expect(stayntouch?.status).toBe("ready_for_validation");
    expect(stayntouch?.missingConfiguration).toEqual([]);
    expect(stayntouch?.invalidConfiguration).toEqual([]);
    expect(JSON.stringify(stayntouch)).not.toContain("stayntouch-sandbox-token");
  });

  it("does not accept generic OAuth client credentials for Stayntouch", () => {
    const result = buildPmsReadiness({
      PMS_STAYNTOUCH_BASE_URL: "https://api.stayntouch.com/connect/",
      PMS_STAYNTOUCH_CLIENT_ID: "wrong-client-id",
      PMS_STAYNTOUCH_CLIENT_SECRET: "wrong-client-secret",
    });
    const stayntouch = result.find((provider) => provider.id === "stayntouch");

    expect(stayntouch?.status).toBe("credentials_required");
    expect(stayntouch?.missingConfiguration).toEqual([
      "PMS_STAYNTOUCH_ACCESS_TOKEN",
    ]);
  });

  it("validates SIHOT's documented hotel authentication contract", () => {
    const result = buildPmsReadiness({
      PMS_SIHOT_BASE_URL: "https://partner-api.sihot.com/PDOCS/API/CBS/",
      PMS_SIHOT_USER: "integration-user",
      PMS_SIHOT_PASSWORD: "integration-password",
      PMS_SIHOT_HOTEL: "1",
      PMS_SIHOT_PRODUCT_ID: "iratepilot-product",
    });
    const sihot = result.find((provider) => provider.id === "sihot");
    expect(sihot?.status).toBe("ready_for_validation");
    expect(sihot?.missingConfiguration).toEqual([]);
    expect(JSON.stringify(sihot)).not.toContain("integration-password");
  });

  it("does not accept generic OAuth credentials for SIHOT", () => {
    const result = buildPmsReadiness({
      PMS_SIHOT_BASE_URL: "https://partner-api.sihot.com/PDOCS/API/CBS/",
      PMS_SIHOT_CLIENT_ID: "wrong-client",
      PMS_SIHOT_CLIENT_SECRET: "wrong-secret-value",
    });
    const sihot = result.find((provider) => provider.id === "sihot");
    expect(sihot?.status).toBe("credentials_required");
    expect(sihot?.missingConfiguration).toEqual([
      "PMS_SIHOT_USER",
      "PMS_SIHOT_PASSWORD",
      "PMS_SIHOT_HOTEL",
      "PMS_SIHOT_PRODUCT_ID",
    ]);
  });

  it("rejects insecure endpoints and undersized secrets by key name only", () => {
    const result = buildPmsReadiness({
      PMS_MEWS_BASE_URL: "http://partner.example.invalid",
      PMS_MEWS_CLIENT_TOKEN: "short",
      PMS_MEWS_ACCESS_TOKEN: "also-short",
      PMS_MEWS_CLIENT: "iRatePilot",
    });
    const mews = result.find((provider) => provider.id === "mews");

    expect(mews?.status).toBe("invalid_configuration");
    expect(mews?.invalidConfiguration).toEqual([
      "PMS_MEWS_BASE_URL",
      "PMS_MEWS_CLIENT_TOKEN",
      "PMS_MEWS_ACCESS_TOKEN",
    ]);
    expect(JSON.stringify(mews)).not.toContain("partner.example.invalid");
    expect(JSON.stringify(mews)).not.toContain("short");
  });

  it("protects PMS readiness behind the admin role and disables caching", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).not.toContain("CLIENT_SECRET");
  });

  it("exposes the strict priority production audit to administrators without secret values", () => {
    expect(route).toContain("auditPriorityPmsProductionReadiness(process.env, evidence)");
    expect(route).toContain("priorityProductionReadiness");
    expect(adminSettings).toContain("Production launch gate");
    expect(adminSettings).toContain("missingEnvironmentKeys");
    expect(adminSettings).toContain("invalidEnvironmentKeys");
    expect(adminSettings).toContain("secret values never leave the server");
  });

  it("persists priority launch evidence through an admin-only, sequential update", () => {
    expect(route).toContain("export async function PATCH");
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('from("priority_pms_launch_evidence")');
    expect(route).toContain("Vendor approval must be recorded before property mapping.");
    expect(route).toContain("Vendor approval and property mapping are required before sandbox validation.");
    expect(route).toContain("Sandbox validation is required before webhook validation.");
    expect(route).toContain("Webhook validation is required before the production smoke test.");
    expect(route).toContain("The production smoke test must pass before live traffic is enabled.");
    expect(route).toContain("updated_by: auth.user.id");
    expect(adminSettings).toContain("Confirm vendor approval");
    expect(adminSettings).toContain("Confirm property mapping");
    expect(adminSettings).toContain("Confirm sandbox validation");
    expect(adminSettings).toContain("Confirm webhook validation");
    expect(adminSettings).toContain("Confirm production smoke test");
    expect(adminSettings).toContain("Enable live traffic");
    expect(adminSettings).toContain("migrations 034 and 035");
  });

  it("keeps the readiness dashboard available while migration 035 is pending", () => {
    expect(route).toContain('evidenceResult.error?.code === "42703"');
    expect(route).toContain('select("provider_id,vendor_approved,property_mapped,sandbox_validated,updated_at")');
    expect(route).toContain("webhook_validated: false");
    expect(route).toContain('currentResult.error.code === "42703"');
  });

  it("records non-secret vendor evidence details without weakening launch gates", () => {
    expect(route).toContain("vendor_approval_reference");
    expect(route).toContain("approved_environment");
    expect(route).toContain("property_code");
    expect(route).toContain("support_contact");
    expect(route).toContain("verification_notes");
    expect(route).toContain("Evidence details must contain supported text fields.");
    expect(adminSettings).toContain("Vendor evidence details");
    expect(adminSettings).toContain("Never enter passwords, API keys, tokens, or webhook secrets here.");
    expect(adminSettings).toContain("Save evidence details");
  });
});


