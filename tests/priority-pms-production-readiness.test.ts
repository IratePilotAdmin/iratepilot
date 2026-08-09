import { describe, expect, it } from "vitest";
import {
  auditPriorityPmsProductionReadiness,
  priorityPmsProductionManifest,
  priorityPmsProviderIds,
} from "../services/hotel-suppliers/priority-readiness";

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
    const environment = Object.fromEntries(
      priorityPmsProductionManifest.flatMap((provider) =>
        provider.requiredEnvironmentKeys.map((key) => [key, `configured-${key}`]),
      ),
    );
    expect(auditPriorityPmsProductionReadiness(environment)[0]?.status).toBe("vendor_approval_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true },
    })[0]?.status).toBe("property_mapping_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, propertyMapped: true },
    })[0]?.status).toBe("sandbox_validation_required");
    expect(auditPriorityPmsProductionReadiness(environment, {
      "oracle-opera": { vendorApproved: true, propertyMapped: true, sandboxValidated: true },
    })[0]?.status).toBe("ready_for_live");
  });
});
