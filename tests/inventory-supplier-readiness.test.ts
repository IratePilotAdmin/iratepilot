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
  it("tracks the three supplier applications without implying approval", () => {
    const readiness = buildInventorySupplierReadiness({});

    expect(readiness.map(({ id }) => id)).toEqual([
      "hotelbeds",
      "ratehawk",
      "expedia-rapid",
    ]);
    expect(readiness.every(({ status }) => status === "not_configured")).toBe(true);
  });

  it("requires the complete Hotelbeds authentication and mTLS material", () => {
    const readiness = buildInventorySupplierReadiness({
      HOTEL_INVENTORY_HOTELBEDS_API_KEY: "issued-api-key",
      HOTEL_INVENTORY_HOTELBEDS_SECRET: "issued-secret",
    });
    const hotelbeds = readiness.find(({ id }) => id === "hotelbeds");

    expect(hotelbeds?.status).toBe("credentials_required");
    expect(hotelbeds?.missingEnvironmentKeys).toEqual([
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_CERTIFICATE",
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY",
    ]);
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

  it("exposes the read-only audit through the admin-only no-store endpoint", () => {
    expect(route).toContain("buildInventorySupplierReadiness(process.env)");
    expect(route).toContain("inventorySuppliers");
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(adminSettings).toContain("Hotel inventory supplier readiness");
    expect(adminSettings).toContain("ready for sandbox validation");
  });
});
