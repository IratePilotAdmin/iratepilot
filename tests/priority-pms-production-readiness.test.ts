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

describe("priority PMS production readiness", () => {
  it("defines a complete launch contract for all six priority providers", () => {
    expect(priorityPmsProductionManifest.map(({ id }) => id)).toEqual(priorityPmsProviderIds);
    for (const provider of priorityPmsProductionManifest) {
      expect(provider.requiredEnvironmentKeys).toContainEqual(expect.stringMatching(/_BASE_URL$/));
      expect(provider.requiredEnvironmentKeys).toContainEqual(expect.stringMatching(/_WEBHOOK_SECRET$/));
      expect(new Set(provider.requiredEnvironmentKeys).size).toBe(provider.requiredEnvironmentKeys.length);
    }
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
    })[0]?.status).toBe("property_mapping_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, propertyMapped: true },
    })[0]?.status).toBe("sandbox_validation_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, propertyMapped: true, sandboxValidated: true },
    })[0]?.status).toBe("webhook_validation_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, propertyMapped: true, sandboxValidated: true, webhookValidated: true },
    })[0]?.status).toBe("production_smoke_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, propertyMapped: true, sandboxValidated: true, webhookValidated: true, productionSmokeValidated: true },
    })[0]?.status).toBe("activation_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, propertyMapped: true, sandboxValidated: true, webhookValidated: true, productionSmokeValidated: true, liveEnabled: true },
    })[0]?.status).toBe("live");
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
