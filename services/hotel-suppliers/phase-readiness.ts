import type { PmsProviderReadiness } from "./types";
import type {
  PriorityPmsLaunchEvidence,
  PriorityPmsLaunchStatus,
  PriorityPmsProviderId,
} from "./priority-readiness";

type PriorityProviderReadiness = {
  id: PriorityPmsProviderId;
  status: PriorityPmsLaunchStatus;
  readyForRealPropertyActivation: boolean;
  evidence: Required<Pick<PriorityPmsLaunchEvidence,
    | "vendorApproved"
    | "propertyMapped"
    | "sandboxValidated"
    | "webhookValidated"
    | "productionSmokeValidated"
    | "liveEnabled"
  >>;
};

export type SupplierPhaseStatus =
  | "framework_attention"
  | "vendor_certification_pending"
  | "controlled_activation_ready"
  | "live_provider_present";

export type SupplierPhaseReadiness = {
  status: SupplierPhaseStatus;
  frameworkReady: boolean;
  evidenceTrackingAvailable: boolean;
  providerManifestCount: number;
  priorityLaunchManifestCount: number;
  priorityManifestCoverageCount: number;
  readyForValidationCount: number;
  vendorApprovedCount: number;
  propertyMappedCount: number;
  sandboxValidatedCount: number;
  webhookValidatedCount: number;
  productionSmokeValidatedCount: number;
  controlledActivationCandidateCount: number;
  liveProviderCount: number;
  certificationPendingCount: number;
  readOnly: true;
};

function uniqueCount(values: readonly string[]) {
  return new Set(values).size;
}

export function buildSupplierPhaseReadiness(
  providers: readonly PmsProviderReadiness[],
  priorityProviders: readonly PriorityProviderReadiness[],
  evidenceTrackingAvailable: boolean,
): SupplierPhaseReadiness {
  const providerIds = providers.map(({ id }) => id);
  const providerIdSet = new Set(providerIds);
  const priorityIds = priorityProviders.map(({ id }) => id);
  const priorityManifestCoverageCount = priorityIds.filter((id) => providerIdSet.has(id)).length;
  const manifestCoverageComplete = priorityProviders.length > 0
    && priorityManifestCoverageCount === priorityProviders.length;
  const manifestsAreUnique = uniqueCount(providerIds) === providerIds.length
    && uniqueCount(priorityIds) === priorityIds.length;
  const frameworkReady = providers.length > 0
    && manifestCoverageComplete
    && manifestsAreUnique
    && evidenceTrackingAvailable;

  const controlledActivationCandidateCount = priorityProviders.filter(
    ({ readyForRealPropertyActivation }) => readyForRealPropertyActivation,
  ).length;
  const liveProviderCount = priorityProviders.filter(({ status }) => status === "live").length;
  const status: SupplierPhaseStatus = !frameworkReady
    ? "framework_attention"
    : liveProviderCount > 0
      ? "live_provider_present"
      : controlledActivationCandidateCount > 0
        ? "controlled_activation_ready"
        : "vendor_certification_pending";

  return {
    status,
    frameworkReady,
    evidenceTrackingAvailable,
    providerManifestCount: providers.length,
    priorityLaunchManifestCount: priorityProviders.length,
    priorityManifestCoverageCount,
    readyForValidationCount: providers.filter(({ status: providerStatus }) => providerStatus === "ready_for_validation").length,
    vendorApprovedCount: priorityProviders.filter(({ evidence }) => evidence.vendorApproved).length,
    propertyMappedCount: priorityProviders.filter(({ evidence }) => evidence.propertyMapped).length,
    sandboxValidatedCount: priorityProviders.filter(({ evidence }) => evidence.sandboxValidated).length,
    webhookValidatedCount: priorityProviders.filter(({ evidence }) => evidence.webhookValidated).length,
    productionSmokeValidatedCount: priorityProviders.filter(({ evidence }) => evidence.productionSmokeValidated).length,
    controlledActivationCandidateCount,
    liveProviderCount,
    certificationPendingCount: priorityProviders.length - controlledActivationCandidateCount,
    readOnly: true,
  };
}
