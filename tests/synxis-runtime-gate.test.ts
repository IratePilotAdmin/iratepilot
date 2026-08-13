import { describe, expect, it, vi } from "vitest";
import { createSynxisRuntimeAuthorizer } from "../lib/integrations/synxis-runtime-authorizer";
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
});
