import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInventorySupplierReadiness } from "../services/hotel-suppliers/inventory-readiness";

const route = readFileSync(
  new URL("../app/api/admin/integrations/pms/route.ts", import.meta.url),
  "utf8",
);
const adminSettings = readFileSync(
  new URL("../components/dashboard/admin-settings.tsx", import.meta.url),
  "utf8",
);

describe("inventory supplier readiness", () => {
  it("tracks supplier applications without implying approval", () => {
    const readiness = buildInventorySupplierReadiness({});

    expect(readiness.map(({ id }) => id)).toEqual([
      "hotelbeds",
      "ratehawk",
      "expedia-rapid",
      "stuba",
    ]);
    expect(readiness.every(({ status }) => status === "not_configured")).toBe(true);
  });

  it("requires an issued Stuba API key before sandbox validation", () => {
    const incomplete = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_STUBA_AUTH_API_KEY: "placeholder-api-key",
    }).find(({ id }) => id === "stuba");
    const ready = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_STUBA_AUTH_API_KEY: "issued-stuba-sandbox-key",
    }).find(({ id }) => id === "stuba");

    expect(incomplete?.status).toBe("invalid_configuration");
    expect(incomplete?.invalidEnvironmentKeys).toEqual([
      "HOTEL_INVENTORY_STUBA_AUTH_API_KEY",
    ]);
    expect(ready?.status).toBe("ready_for_sandbox_validation");
  });

  it("requires the complete Hotelbeds authentication and mTLS material", () => {
    const readiness = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_HOTELBEDS_API_KEY: "issued-hotelbeds-api-key",
      HOTEL_INVENTORY_HOTELBEDS_SECRET: "issued-secret",
    });
    const hotelbeds = readiness.find(({ id }) => id === "hotelbeds");

    expect(hotelbeds?.status).toBe("credentials_required");
    expect(hotelbeds?.missingEnvironmentKeys).toEqual([
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_CERTIFICATE",
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY",
    ]);
    expect(hotelbeds?.invalidEnvironmentKeys).toEqual([]);
  });

  it("reports sandbox readiness without exposing credential values", () => {
    const secret = "do-not-return-this-api-secret";
    const readiness = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_RATEHAWK_KEY_ID: "key-id",
      HOTEL_INVENTORY_RATEHAWK_API_KEY: secret,
    });
    const ratehawk = readiness.find(({ id }) => id === "ratehawk");

    expect(ratehawk?.status).toBe("ready_for_sandbox_validation");
    expect(ratehawk?.missingEnvironmentKeys).toEqual([]);
    expect(JSON.stringify(readiness)).not.toContain(secret);
  });

  it("rejects placeholder credentials and malformed mTLS material by key name only", () => {
    const readiness = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_HOTELBEDS_API_KEY: "placeholder",
      HOTEL_INVENTORY_HOTELBEDS_SECRET: "issued-secret",
      HOTEL_INVENTORY_HOTELBEDS_MTLS_CERTIFICATE: "not-a-certificate",
      HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY: "not-a-private-key",
    });
    const hotelbeds = readiness.find(({ id }) => id === "hotelbeds");

    expect(hotelbeds?.status).toBe("invalid_configuration");
    expect(hotelbeds?.invalidEnvironmentKeys).toEqual([
      "HOTEL_INVENTORY_HOTELBEDS_API_KEY",
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_CERTIFICATE",
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY",
    ]);
    expect(JSON.stringify(hotelbeds)).not.toContain("not-a-private-key");
  });

  it("accepts complete PEM material without returning it", () => {
    const privateKey = "-----BEGIN PRIVATE KEY-----\\nprivate-key-material\\n-----END PRIVATE KEY-----";
    const readiness = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_HOTELBEDS_API_KEY: "issued-hotelbeds-api-key",
      HOTEL_INVENTORY_HOTELBEDS_SECRET: "issued-hotelbeds-secret",
      HOTEL_INVENTORY_HOTELBEDS_MTLS_CERTIFICATE: "-----BEGIN CERTIFICATE-----\\ncertificate-material\\n-----END CERTIFICATE-----",
      HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY: privateKey,
    });
    const hotelbeds = readiness.find(({ id }) => id === "hotelbeds");

    expect(hotelbeds?.status).toBe("ready_for_sandbox_validation");
    expect(hotelbeds?.invalidEnvironmentKeys).toEqual([]);
    expect(JSON.stringify(hotelbeds)).not.toContain("private-key-material");
  });

  it("rejects decorated placeholder credentials", () => {
    const readiness = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY: "example-api-key",
      HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET: "placeholder_shared_secret",
    });
    const expedia = readiness.find(({ id }) => id === "expedia-rapid");

    expect(expedia?.status).toBe("invalid_configuration");
    expect(expedia?.invalidEnvironmentKeys).toEqual([
      "HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY",
      "HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET",
    ]);
  });

  it("rejects mismatched private-key PEM boundary types", () => {
    const readiness = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_HOTELBEDS_API_KEY: "issued-hotelbeds-api-key",
      HOTEL_INVENTORY_HOTELBEDS_SECRET: "issued-hotelbeds-secret",
      HOTEL_INVENTORY_HOTELBEDS_MTLS_CERTIFICATE: "-----BEGIN CERTIFICATE-----\\ncertificate-material\\n-----END CERTIFICATE-----",
      HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nprivate-key-material\\n-----END EC PRIVATE KEY-----",
    });
    const hotelbeds = readiness.find(({ id }) => id === "hotelbeds");

    expect(hotelbeds?.status).toBe("invalid_configuration");
    expect(hotelbeds?.invalidEnvironmentKeys).toContain(
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY",
    );
  });

  it("exposes the read-only audit through the admin-only no-store endpoint", () => {
    expect(route).toContain("buildInventorySupplierReadiness(process.env)");
    expect(route).toContain("evaluateInventorySandboxRuntimeGate(supplier.id, process.env)");
    expect(route).toContain("inventorySuppliers");
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(adminSettings).toContain("Hotel inventory supplier readiness");
    expect(adminSettings).toContain("RUN SANDBOX SEARCH");
    expect(adminSettings).toContain("RUN PREBOOK TEST");
    expect(adminSettings).toContain("/api/admin/integrations/inventory/ratehawk/validate");
    expect(adminSettings).toContain("/api/admin/integrations/inventory/ratehawk/prebook");
    expect(adminSettings).toContain("Run one read-only RateHawk sandbox search now?");
    expect(adminSettings).toContain("Run one controlled RateHawk sandbox search and prebook now?");
    expect(adminSettings).toContain("No booking or payment was created.");
    expect(adminSettings).toContain("Last saved search:");
    expect(adminSettings).toContain("Last saved prebook:");
    expect(adminSettings).toContain("Sandbox search passed and evidence saved:");
    expect(adminSettings).toContain("ready for sandbox validation");
    expect(adminSettings).toContain("sandbox transports authorized");
    expect(adminSettings).toContain("Sandbox traffic");
    expect(adminSettings).toContain("Authorized for sandbox only");
    expect(adminSettings).toContain("Checking hotel inventory suppliers…");
  });
});
