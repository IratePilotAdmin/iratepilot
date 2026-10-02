import {
  auditPriorityPmsProductionReadiness,
  type PriorityPmsLaunchEvidence,
  type PriorityPmsProviderId,
} from "../../services/hotel-suppliers/priority-readiness";
import {
  buildVerifiedSynxisReadiness,
  type SynxisVerifiedEvidence,
} from "../../services/hotel-suppliers/synxis";

export function buildVerifiedSupplierConnectionCounts(
  environment: Record<string, string | undefined>,
  priorityPmsEvidence: Partial<Record<PriorityPmsProviderId, PriorityPmsLaunchEvidence>>,
  synxisEvidence: SynxisVerifiedEvidence,
) {
  return {
    livePmsConnections: auditPriorityPmsProductionReadiness(environment, priorityPmsEvidence)
      .filter(({ status }) => status === "live").length,
    liveSynxisConnections: buildVerifiedSynxisReadiness(environment, synxisEvidence).status === "live"
      ? 1
      : 0,
  };
}
