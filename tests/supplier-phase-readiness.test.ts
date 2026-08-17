import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditPriorityPmsProductionReadiness } from "../services/hotel-suppliers/priority-readiness";
import { buildPmsReadiness } from "../services/hotel-suppliers/readiness";
import { buildSupplierPhaseReadiness } from "../services/hotel-suppliers/phase-readiness";

const adminSettings = readFileSync(
  new URL("../components/dashboard/admin-settings.tsx", import.meta.url),
  "utf8",
);

function emptyReadiness() {
  return {
    providers: buildPmsReadiness({}),
    priorityProviders: auditPriorityPmsProductionReadiness({}),
  };
}

describe("supplier certification phase summary", () => {
  it("reports framework coverage separately from external certification", () => {
    const { providers, priorityProviders } = emptyReadiness();
    const summary = buildSupplierPhaseReadiness(providers, priorityProviders, true);

    expect(summary).toMatchObject({
      status: "vendor_certification_pending",
      frameworkReady: true,
      evidenceTrackingAvailable: true,
      providerManifestCount: 22,
      priorityLaunchManifestCount: 22,
      priorityManifestCoverageCount: 22,
      controlledActivationCandidateCount: 0,
      liveProviderCount: 0,
      certificationPendingCount: 22,
      readOnly: true,
    });
  });

  it("requires unique provider coverage and durable evidence tracking", () => {
    const { providers, priorityProviders } = emptyReadiness();

    expect(buildSupplierPhaseReadiness(providers.slice(1), priorityProviders, true)).toMatchObject({
      status: "framework_attention",
      frameworkReady: false,
      priorityManifestCoverageCount: 21,
    });
    expect(buildSupplierPhaseReadiness(providers, priorityProviders, false)).toMatchObject({
      status: "framework_attention",
      frameworkReady: false,
      evidenceTrackingAvailable: false,
    });
    expect(buildSupplierPhaseReadiness([...providers, providers[0]!], priorityProviders, true)).toMatchObject({
      status: "framework_attention",
      frameworkReady: false,
    });
  });

  it("counts independently verified gates without treating them as live traffic", () => {
    const { providers, priorityProviders } = emptyReadiness();
    const candidate = priorityProviders.map((provider, index) => index === 0 ? {
      ...provider,
      status: "activation_required" as const,
      readyForRealPropertyActivation: true,
      evidence: {
        ...provider.evidence,
        vendorApproved: true,
        propertyMapped: true,
        sandboxValidated: true,
        webhookValidated: true,
        productionSmokeValidated: true,
        liveEnabled: false,
      },
    } : provider);
    const summary = buildSupplierPhaseReadiness(providers, candidate, true);

    expect(summary).toMatchObject({
      status: "controlled_activation_ready",
      vendorApprovedCount: 1,
      propertyMappedCount: 1,
      sandboxValidatedCount: 1,
      webhookValidatedCount: 1,
      productionSmokeValidatedCount: 1,
      controlledActivationCandidateCount: 1,
      liveProviderCount: 0,
      certificationPendingCount: 21,
      readOnly: true,
    });
  });

  it("shows live status only when a provider's recorded launch status is live", () => {
    const { providers, priorityProviders } = emptyReadiness();
    const live = priorityProviders.map((provider, index) => index === 0 ? {
      ...provider,
      status: "live" as const,
      readyForRealPropertyActivation: true,
      evidence: { ...provider.evidence, liveEnabled: true },
    } : provider);

    expect(buildSupplierPhaseReadiness(providers, live, true)).toMatchObject({
      status: "live_provider_present",
      controlledActivationCandidateCount: 1,
      liveProviderCount: 1,
    });
  });

  it("labels the operator summary as read-only and preserves the independent SynXis gate", () => {
    expect(adminSettings).toContain("The software framework and external approvals are reported separately.");
    expect(adminSettings).toContain("This summary is read-only.");
    expect(adminSettings).toContain("It cannot approve certification, send vendor traffic, or enable a provider.");
    expect(adminSettings).toContain("<SynxisCrsReadiness />");
  });
});
