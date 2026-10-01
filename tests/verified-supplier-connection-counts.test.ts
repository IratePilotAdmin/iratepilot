import { describe, expect, it } from "vitest";
import { buildVerifiedSupplierConnectionCounts } from "../lib/admin/verified-supplier-connection-counts";

const configuredEnvironment = {
  CRS_SYNXIS_BASE_URL: "https://synxis.example.test",
  CRS_SYNXIS_USERNAME: "user",
  CRS_SYNXIS_PASSWORD: "password",
  CRS_SYNXIS_HOTEL_ID: "hotel",
  CRS_SYNXIS_RATE_SOAP_ACTION: "rate",
  CRS_SYNXIS_INVENTORY_SOAP_ACTION: "inventory",
  PMS_CLOUDBEDS_BASE_URL: "https://api.cloudbeds.com",
  PMS_CLOUDBEDS_API_KEY: "credential",
  PMS_CLOUDBEDS_SOURCE_ID: "source",
};

describe("verified operations supplier counts", () => {
  it("does not count raw live flags without documented evidence", () => {
    expect(buildVerifiedSupplierConnectionCounts(configuredEnvironment, {
      cloudbeds: {
        vendorApproved: true,
        propertyMapped: true,
        sandboxValidated: true,
        webhookValidated: true,
        productionSmokeValidated: true,
        liveEnabled: true,
      },
    }, {
      vendorApproved: true,
      certificationEnvironmentApproved: true,
      propertyMapped: true,
      sandboxValidated: true,
      productionSmokeValidated: true,
      liveEnabled: true,
    })).toEqual({ livePmsConnections: 0, liveSynxisConnections: 0 });
  });

  it("counts only configuration-valid connections with a complete evidence chain", () => {
    expect(buildVerifiedSupplierConnectionCounts(configuredEnvironment, {
      cloudbeds: {
        vendorApproved: true,
        propertyMapped: true,
        sandboxValidated: true,
        webhookValidated: true,
        productionSmokeValidated: true,
        liveEnabled: true,
        vendorApprovalReference: "CLOUDBEDS-APPROVAL-2026",
        approvedEnvironment: "Cloudbeds production",
        propertyCode: "PROPERTY-12345",
        supportContact: "integrations@cloudbeds.com",
      },
    }, {
      vendorApproved: true,
      certificationEnvironmentApproved: true,
      propertyMapped: true,
      sandboxValidated: true,
      productionSmokeValidated: true,
      liveEnabled: true,
      vendorApprovalReference: "SABRE-APPROVAL-2026",
      approvedEnvironment: "SynXis production certification",
      propertyCode: "HOTEL-12345",
      supportContact: "synxis-support@sabre.com",
    })).toEqual({ livePmsConnections: 1, liveSynxisConnections: 1 });
  });
});
