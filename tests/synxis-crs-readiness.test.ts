import { describe, expect, it } from "vitest";
import {
  buildSynxisReadiness,
  synxisCrsProvider,
  synxisRequiredEnvironmentKeys,
} from "../services/hotel-suppliers/synxis";

function configuredEnvironment() {
  return {
    CRS_SYNXIS_BASE_URL: "https://integcert.synxis.com",
    CRS_SYNXIS_USERNAME: "property-specific-user",
    CRS_SYNXIS_PASSWORD: "property-specific-password",
    CRS_SYNXIS_HOTEL_ID: "12345",
    CRS_SYNXIS_RATE_SOAP_ACTION: "OTA_HotelRateAmountNotif",
    CRS_SYNXIS_INVENTORY_SOAP_ACTION: "OTA_HotelInvCountNotif",
    CRS_SYNXIS_ENDPOINT_PATH: "/ChannelConnect/api",
    CRS_SYNXIS_TIMEOUT_MS: "30000",
  };
}

describe("Sabre SynXis CRS readiness", () => {
  it("registers SynXis as a CRS rather than a PMS", () => {
    expect(synxisCrsProvider).toMatchObject({
      id: "sabre-synxis",
      category: "crs",
    });
    expect(synxisCrsProvider.capabilities).toEqual(expect.arrayContaining([
      "product_catalog",
      "rate_push",
      "inventory_push",
      "reservation_delivery",
    ]));
  });

  it("requires the property-specific Channel Connect contract", () => {
    const readiness = buildSynxisReadiness({
      CRS_SYNXIS_BASE_URL: "https://integcert.synxis.com",
    });

    expect(readiness.status).toBe("configuration_required");
    expect(readiness.missingEnvironmentKeys).toEqual(
      synxisRequiredEnvironmentKeys.filter((key) => key !== "CRS_SYNXIS_BASE_URL"),
    );
    expect(readiness.liveTrafficAllowed).toBe(false);
  });

  it("rejects insecure, cross-origin, and unreasonable transport settings", () => {
    const readiness = buildSynxisReadiness({
      ...configuredEnvironment(),
      CRS_SYNXIS_BASE_URL: "http://integcert.synxis.com",
      CRS_SYNXIS_ENDPOINT_PATH: "https://attacker.invalid/collect",
      CRS_SYNXIS_TIMEOUT_MS: "0",
    });

    expect(readiness).toMatchObject({
      status: "configuration_invalid",
      invalidEnvironmentKeys: [
        "CRS_SYNXIS_BASE_URL",
        "CRS_SYNXIS_ENDPOINT_PATH",
        "CRS_SYNXIS_TIMEOUT_MS",
      ],
      liveTrafficAllowed: false,
    });
  });

  it("keeps credentials and property identifiers out of readiness output", () => {
    const environment = configuredEnvironment();
    const readiness = buildSynxisReadiness(environment);
    const serialized = JSON.stringify(readiness);

    expect(readiness.status).toBe("vendor_approval_required");
    expect(serialized).not.toContain(environment.CRS_SYNXIS_USERNAME);
    expect(serialized).not.toContain(environment.CRS_SYNXIS_PASSWORD);
    expect(serialized).not.toContain(environment.CRS_SYNXIS_HOTEL_ID);
  });

  it("enforces certification and validation gates before live traffic", () => {
    const environment = configuredEnvironment();

    expect(buildSynxisReadiness(environment, {
      vendorApproved: true,
    }).status).toBe("certification_required");

    expect(buildSynxisReadiness(environment, {
      vendorApproved: true,
      certificationEnvironmentApproved: true,
    }).status).toBe("property_mapping_required");

    expect(buildSynxisReadiness(environment, {
      vendorApproved: true,
      certificationEnvironmentApproved: true,
      propertyMapped: true,
    }).status).toBe("sandbox_validation_required");

    expect(buildSynxisReadiness(environment, {
      vendorApproved: true,
      certificationEnvironmentApproved: true,
      propertyMapped: true,
      sandboxValidated: true,
    }).status).toBe("production_smoke_required");

    expect(buildSynxisReadiness(environment, {
      vendorApproved: true,
      certificationEnvironmentApproved: true,
      propertyMapped: true,
      sandboxValidated: true,
      productionSmokeValidated: true,
    }).status).toBe("activation_required");

    expect(buildSynxisReadiness(environment, {
      vendorApproved: true,
      certificationEnvironmentApproved: true,
      propertyMapped: true,
      sandboxValidated: true,
      productionSmokeValidated: true,
      liveEnabled: true,
    })).toMatchObject({
      status: "live",
      liveTrafficAllowed: true,
    });
  });
});
