import { describe, expect, it } from "vitest";
import {
  auditPriorityPmsProductionReadiness,
  priorityPmsProductionManifest,
  priorityPmsProviderIds,
} from "../services/hotel-suppliers/priority-readiness";


function configuredEnvironment() {
  return Object.fromEntries(
    priorityPmsProductionManifest.flatMap((provider) =>
      provider.requiredEnvironmentKeys.map((key) => {
        if (key.endsWith("_BASE_URL")) return [key, `https://${provider.id}.example.com`];
        if (key.endsWith("_TOKEN_URL")) return [key, `https://auth.${provider.id}.example.com/token`];
        if (key.endsWith("_PATH")) return [key, `/v1/${key.toLowerCase()}`];
        return [key, `configured-${key}`];
      }),
    ),
  );
}

describe("unified PMS production readiness", () => {
  it("defines a launch contract for every completed provider", () => {
    expect(priorityPmsProductionManifest.map(({ id }) => id)).toEqual(priorityPmsProviderIds);
    expect(priorityPmsProviderIds).toHaveLength(22);
    for (const provider of priorityPmsProductionManifest) {
      expect(provider.requiredEnvironmentKeys.length).toBeGreaterThan(0);
      expect(new Set(provider.requiredEnvironmentKeys).size).toBe(provider.requiredEnvironmentKeys.length);
      expect(new Set(provider.optionalEnvironmentKeys).size).toBe(provider.optionalEnvironmentKeys.length);
    }
  });

  it("tracks the real adapter contract for representative public and legacy connectors", () => {
    expect(priorityPmsProductionManifest.find(({ id }) => id === "mews")?.requiredEnvironmentKeys)
      .toEqual(expect.arrayContaining(["PMS_MEWS_CLIENT_TOKEN", "PMS_MEWS_SERVICE_ID", "PMS_MEWS_RATE_ID"]));
    expect(priorityPmsProductionManifest.find(({ id }) => id === "oracle-opera-5")?.requiredEnvironmentKeys)
      .toEqual(expect.arrayContaining(["PMS_OPERA5_BASE_URL", "PMS_OPERA5_CREATE_RESERVATION_SOAP_ACTION"]));
    expect(priorityPmsProductionManifest.find(({ id }) => id === "rms-cloud")?.requiredEnvironmentKeys)
      .toEqual(expect.arrayContaining(["PMS_RMS_CLOUD_AUTH_TOKEN", "PMS_RMS_CLOUD_CATEGORY_IDS"]));
  });

  it("reports configuration without returning secret values", () => {
    const provider = priorityPmsProductionManifest.find(({ id }) => id === "hotelkey")!;
    const environment = Object.fromEntries(provider.requiredEnvironmentKeys.map((key) => [key, `secret-${key}`]));
    delete environment.PMS_HOTELKEY_CANCEL_PATH;
    const [hotelKey] = auditPriorityPmsProductionReadiness(environment).filter(({ id }) => id === "hotelkey");
    expect(hotelKey).toMatchObject({
      status: "configuration_required",
      missingEnvironmentKeys: ["PMS_HOTELKEY_CANCEL_PATH"],
    });
    expect(JSON.stringify(hotelKey)).not.toContain("secret-PMS");
  });

  it("requires operational evidence after configuration", () => {
    const environment = configuredEnvironment();
    expect(auditPriorityPmsProductionReadiness(environment)[0]?.status).toBe("vendor_approval_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true },
    })[0]?.status).toBe("activation_details_required");
    const activationDetails = {
      vendorApprovalReference: "OHIP-APPROVAL-42",
      approvedEnvironment: "Production tenant",
      propertyCode: "MSYIR",
      supportContact: "hospitality-support@oracle.com",
    };
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, ...activationDetails, propertyMapped: true },
    })[0]?.status).toBe("sandbox_validation_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, ...activationDetails, propertyMapped: true, sandboxValidated: true },
    })[0]?.status).toBe("webhook_validation_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, ...activationDetails, propertyMapped: true, sandboxValidated: true, webhookValidated: true },
    })[0]?.status).toBe("production_smoke_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, ...activationDetails, propertyMapped: true, sandboxValidated: true, webhookValidated: true, productionSmokeValidated: true },
    })[0]?.status).toBe("activation_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, ...activationDetails, propertyMapped: true, sandboxValidated: true, webhookValidated: true, productionSmokeValidated: true, liveEnabled: true },
    })[0]?.status).toBe("live");
  });

  it("rejects placeholder activation evidence for a real property", () => {
    const [oracle] = auditPriorityPmsProductionReadiness(configuredEnvironment(), {
      "oracle-opera": {
        vendorApproved: true,
        vendorApprovalReference: "TBD",
        approvedEnvironment: "test",
        propertyCode: "Test Hotel",
        supportContact: "unknown",
      },
    });

    expect(oracle.status).toBe("activation_details_required");
    expect(oracle.readyForRealPropertyActivation).toBe(false);
    expect(oracle.activationChecklist).toMatchObject({
      productionConfigurationValid: true,
      vendorApprovalDocumented: false,
      realPropertyCodeDocumented: false,
      supportContactDocumented: false,
    });
  });

  it("rejects insecure and malformed URLs before declaring a provider live-ready", () => {
    const environment = configuredEnvironment();
    environment.PMS_HILTON_PEP_BASE_URL = "http://pep.example.com";
    environment.PMS_ORACLE_OPERA_DISTRIBUTION_TOKEN_URL = "not-a-url";

    const results = auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, propertyMapped: true, sandboxValidated: true },
      "hilton-pep": { vendorApproved: true, propertyMapped: true, sandboxValidated: true },
    });

    expect(results.find(({ id }) => id === "oracle-opera")).toMatchObject({
      status: "configuration_invalid",
      invalidEnvironmentKeys: ["PMS_ORACLE_OPERA_DISTRIBUTION_TOKEN_URL"],
    });
    expect(results.find(({ id }) => id === "hilton-pep")).toMatchObject({
      status: "configuration_invalid",
      invalidEnvironmentKeys: expect.arrayContaining(["PMS_HILTON_PEP_BASE_URL"]),
    });
  });

  it("rejects cross-origin operation paths and invalid timeouts", () => {
    const environment = configuredEnvironment();
    environment.PMS_HOTELKEY_CREATE_PATH = "https://attacker.example.com/reservations";
    environment.PMS_HOTELKEY_TIMEOUT_MS = "0";

    const hotelKey = auditPriorityPmsProductionReadiness(environment, {
      hotelkey: { vendorApproved: true, propertyMapped: true, sandboxValidated: true },
    }).find(({ id }) => id === "hotelkey");

    expect(hotelKey).toMatchObject({
      status: "configuration_invalid",
      invalidEnvironmentKeys: [
        "PMS_HOTELKEY_CREATE_PATH",
        "PMS_HOTELKEY_TIMEOUT_MS",
      ],
    });
    expect(JSON.stringify(hotelKey)).not.toContain("attacker.example.com");
  });
});
