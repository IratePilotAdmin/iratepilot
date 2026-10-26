import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pmsConnectionSchema } from "../lib/validation";
import { getPmsProvider } from "../services/hotel-suppliers/providers";

const migration = readFileSync(
  new URL("../supabase/migrations/202610260172_add_anand_systems_pms.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("Anand Systems PMS catalog entry", () => {
  it("registers ASI PMS behind vendor approval and certification", () => {
    expect(getPmsProvider("anand-systems")).toMatchObject({
      name: "ASI PMS (Anand Systems)",
      vendor: "Anand Systems",
      accessModel: "vendor_partnership",
      certificationRequired: true,
      environmentPrefix: "PMS_ANAND_SYSTEMS",
      requiredConfiguration: ["BASE_URL", "API_CREDENTIAL", "VALIDATION_PATH"],
    });
  });

  it("accepts Anand Systems in partner declarations without weakening database access", () => {
    const result = pmsConnectionSchema.safeParse({
      propertyId: "00000000-0000-4000-8000-000000000001",
      providerId: "anand-systems",
      externalPropertyCode: "ASI-PILOT-1",
      vendorAccountReference: "",
      hotelAuthorized: true,
      roomTypeMapping: "",
      ratePlanMapping: "",
      taxFeeMapping: "",
      cancellationPolicyMapping: "",
    });

    expect(result.success).toBe(true);
    expect(migration).toContain("property_pms_connections_provider_id_check");
    expect(migration).toContain("'anand-systems'");
    expect(migration).not.toContain("disable row level security");
    expect(migration).not.toContain("drop policy");
  });
});
