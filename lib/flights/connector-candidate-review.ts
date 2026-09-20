import {
  flightBookingConnectorDefinitions,
  type FlightBookingConnectorId,
} from "./booking-connectors";
import {
  flightSupplierEvidenceWorkstreams,
  type FlightSupplierEvidenceWorkstream,
} from "./supplier-due-diligence";

export const FLIGHT_CONNECTOR_CANDIDATE_REVIEW_MODE = "candidate_evidence_pending" as const;

export type FlightConnectorCandidateReviewWorkstream = Readonly<
  Pick<FlightSupplierEvidenceWorkstream, "id" | "label" | "owner" | "requiredEvidence" | "safetyBoundary"> & {
    complete: boolean;
  }
>;

export type FlightConnectorCandidateReviewEvidence = Partial<
  Record<FlightSupplierEvidenceWorkstream["id"], boolean>
>;

export type FlightConnectorCandidateReviewEvidenceByConnector = Partial<
  Record<FlightBookingConnectorId, FlightConnectorCandidateReviewEvidence>
>;

export type FlightConnectorCandidateReview = Readonly<{
  connectorId: FlightBookingConnectorId;
  label: string;
  candidateState: "approved_candidate";
  reviewState: "evidence_pending";
  workstreams: readonly FlightConnectorCandidateReviewWorkstream[];
  completedCount: number;
  totalCount: number;
  reviewComplete: boolean;
  shortlisted: false;
  selected: false;
  contractApproved: false;
  credentialsAccepted: false;
  externalNetworkAccess: false;
}>;

export function buildFlightConnectorCandidateReviews(
  evidence: FlightConnectorCandidateReviewEvidenceByConnector = {},
) {
  const reviews: readonly FlightConnectorCandidateReview[] = flightBookingConnectorDefinitions.map((connector) => {
    const connectorEvidence = evidence[connector.id] ?? {};
    const workstreams = flightSupplierEvidenceWorkstreams.map((workstream) => ({
      ...workstream,
      complete: connectorEvidence[workstream.id] === true,
    }));
    const completedCount = workstreams.filter((workstream) => workstream.complete).length;
    return {
      connectorId: connector.id,
      label: connector.label,
      candidateState: connector.candidateState,
      reviewState: "evidence_pending",
      workstreams,
      completedCount,
      totalCount: workstreams.length,
      reviewComplete: completedCount === workstreams.length,
      shortlisted: false,
      selected: false,
      contractApproved: false,
      credentialsAccepted: false,
      externalNetworkAccess: false,
    } as const;
  });

  return {
    mode: FLIGHT_CONNECTOR_CANDIDATE_REVIEW_MODE,
    reviews,
    totalCandidates: reviews.length,
    completeReviewCount: reviews.filter((review) => review.reviewComplete).length,
    shortlistedCount: 0,
    selectedCount: 0,
    externalNetworkAccess: false,
    credentialsAccepted: false,
  } as const;
}
