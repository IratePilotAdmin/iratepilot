import { describe, expect, it, vi } from "vitest";
import {
  buildVerifiedSynxisRuntimeEvidence,
  createSynxisRuntimeAuthorizer,
} from "../lib/integrations/synxis-runtime-authorizer";
import {
  assertSynxisTrafficAuthorized,
  type SynxisRuntimeEvidence,
} from "../services/hotel-suppliers/synxis";

const complete: SynxisRuntimeEvidence = {
  vendorApproved: true,
  certificationEnvironmentApproved: true,
  propertyMapped: true,
  sandboxValidated: true,
  productionSmokeValidated: true,
  liveEnabled: true,
};

describe("SynXis persisted runtime gate", () => {
  const configuredEnvironment = {
    CRS_SYNXIS_BASE_URL: "https://example.test",
    CRS_SYNXIS_USERNAME: "user",
    CRS_SYNXIS_PASSWORD: "password",
    CRS_SYNXIS_HOTEL_ID: "hotel",
    CRS_SYNXIS_RATE_SOAP_ACTION: "rate",
    CRS_SYNXIS_INVENTORY_SOAP_ACTION: "inventory",
  };

  it("allows certification only after approval, environment provisioning, and mapping", () => {
    expect(() => assertSynxisTrafficAuthorized({
      ...complete,
      sandboxValidated: false,
      productionSmokeValidated: false,
      liveEnabled: false,
    }, "certification")).not.toThrow();
    expect(() => assertSynxisTrafficAuthorized({
      ...complete,
      propertyMapped: false,
    }, "certification")).toThrow("propertyMapped");
  });

  it("requires sandbox validation for a controlled production smoke test", () => {
    expect(() => assertSynxisTrafficAuthorized({
      ...complete,
      productionSmokeValidated: false,
      liveEnabled: false,
    }, "production_smoke")).not.toThrow();
    expect(() => assertSynxisTrafficAuthorized({
      ...complete,
      sandboxValidated: false,
    }, "production_smoke")).toThrow("sandboxValidated");
  });

  it("requires every gate and explicit live enablement for live traffic", () => {
    expect(() => assertSynxisTrafficAuthorized(complete, "live")).not.toThrow();
    expect(() => assertSynxisTrafficAuthorized({
      ...complete,
      liveEnabled: false,
    }, "live")).toThrow("liveEnabled");
  });

  it("fails closed when evidence is absent or cannot be read", async () => {
    expect(() => assertSynxisTrafficAuthorized(null, "certification"))
      .toThrow("persisted launch evidence is unavailable");
    const failedReader = vi.fn(async () => { throw new Error("database unavailable"); });
    await expect(createSynxisRuntimeAuthorizer(failedReader)("live"))
      .rejects.toThrow("launch evidence could not be verified");
  });

  it("rechecks persisted evidence on every authorization", async () => {
    const reader = vi.fn(async () => complete);
    const authorize = createSynxisRuntimeAuthorizer(reader);
    await authorize("certification");
    await authorize("live");
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it("converts persisted booleans to false until their details are verified", () => {
    const booleansOnly = buildVerifiedSynxisRuntimeEvidence(configuredEnvironment, {
      vendor_approved: true,
      certification_environment_approved: true,
      property_mapped: true,
      sandbox_validated: true,
      production_smoke_validated: true,
      live_enabled: true,
    });
    expect(booleansOnly).toEqual({
      vendorApproved: false,
      certificationEnvironmentApproved: false,
      propertyMapped: false,
      sandboxValidated: false,
      productionSmokeValidated: false,
      liveEnabled: false,
    });

    expect(buildVerifiedSynxisRuntimeEvidence(configuredEnvironment, {
      vendor_approved: true,
      certification_environment_approved: true,
      property_mapped: true,
      sandbox_validated: true,
      production_smoke_validated: true,
      live_enabled: true,
      vendor_approval_reference: "SABRE-APPROVAL-2026",
      approved_environment: "SynXis production certification",
      property_code: "HOTEL-12345",
      support_contact: "synxis-support@sabre.com",
    })).toEqual(complete);
  });
});
