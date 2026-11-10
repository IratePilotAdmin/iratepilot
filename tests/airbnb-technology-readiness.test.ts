import { describe, expect, it } from "vitest";
import { buildAirbnbTechnologyReadiness } from "../services/hotel-suppliers/airbnb-technology-readiness";

describe("Airbnb technology-strength evidence", () => {
  it("reports repository controls without claiming Airbnb eligibility", () => {
    const readiness = buildAirbnbTechnologyReadiness({});

    expect(readiness.status).toBe("evidence_only");
    expect(readiness.eligibilityDetermined).toBe(false);
    expect(readiness.controls.map(({ id }) => id)).toEqual([
      "admin_access_control",
      "credential_encryption",
      "continuous_integration",
      "code_scanning",
      "dependency_governance",
      "health_monitoring",
      "operational_alerting",
    ]);
    expect(readiness.controls.find(({ id }) => id === "credential_encryption")?.configured).toBe(false);
    expect(readiness.controls.find(({ id }) => id === "operational_alerting")?.configured).toBe(false);
  });

  it("reports configured runtime controls without returning secret values", () => {
    const secret = Buffer.alloc(32, 7).toString("base64");
    const readiness = buildAirbnbTechnologyReadiness({
      PMS_CREDENTIAL_ENCRYPTION_KEY: secret,
      ERROR_WEBHOOK_URL: "https://alerts.example.test/iratepilot",
    });

    expect(readiness.controls.find(({ id }) => id === "credential_encryption")?.configured).toBe(true);
    expect(readiness.controls.find(({ id }) => id === "operational_alerting")?.configured).toBe(true);
    expect(JSON.stringify(readiness)).not.toContain(secret);
    expect(JSON.stringify(readiness)).not.toContain("alerts.example.test");
  });

  it("rejects encryption keys the credential vault cannot use", () => {
    const readiness = buildAirbnbTechnologyReadiness({
      PMS_CREDENTIAL_ENCRYPTION_KEY: "sensitive-encryption-key-material",
    });

    expect(readiness.controls.find(({ id }) => id === "credential_encryption")?.configured).toBe(false);
  });

  it("rejects unusable operational alert webhook URLs", () => {
    const readiness = buildAirbnbTechnologyReadiness({
      ERROR_WEBHOOK_URL: "javascript:alert(1)",
    });

    expect(readiness.controls.find(({ id }) => id === "operational_alerting")?.configured).toBe(false);
  });
});
