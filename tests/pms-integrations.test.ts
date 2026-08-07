import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pmsProviders } from "../services/hotel-suppliers/providers";
import { buildPmsReadiness } from "../services/hotel-suppliers/readiness";

const route = readFileSync(
  new URL("../app/api/admin/integrations/pms/route.ts", import.meta.url),
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
    ]);
  });

  it("reports readiness without returning any credential values", () => {
    const secret = "do-not-expose-this-secret";
    const result = buildPmsReadiness({
      PMS_HOTELKEY_BASE_URL: "https://partner.example.invalid",
      PMS_HOTELKEY_CLIENT_ID: "hotelkey-client",
      PMS_HOTELKEY_CLIENT_SECRET: secret,
    });
    const hotelKey = result.find((provider) => provider.id === "hotelkey");

    expect(hotelKey?.status).toBe("ready_for_validation");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("hotelkey-client");
  });

  it.each([
    ["mews", "PMS_MEWS"],
    ["cloudbeds", "PMS_CLOUDBEDS"],
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

  it("rejects insecure endpoints and undersized secrets by key name only", () => {
    const result = buildPmsReadiness({
      PMS_MEWS_BASE_URL: "http://partner.example.invalid",
      PMS_MEWS_CLIENT_ID: "client-id",
      PMS_MEWS_CLIENT_SECRET: "short",
    });
    const mews = result.find((provider) => provider.id === "mews");

    expect(mews?.status).toBe("invalid_configuration");
    expect(mews?.invalidConfiguration).toEqual([
      "PMS_MEWS_BASE_URL",
      "PMS_MEWS_CLIENT_SECRET",
    ]);
    expect(JSON.stringify(mews)).not.toContain("partner.example.invalid");
    expect(JSON.stringify(mews)).not.toContain("short");
  });

  it("protects PMS readiness behind the admin role and disables caching", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).not.toContain("CLIENT_SECRET");
  });
});
