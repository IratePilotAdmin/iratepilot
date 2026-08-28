import type { Metadata } from "next";
import { Circle, CircleSlash2, ClipboardCheck, Network, Plane, Route, Scale, ShieldCheck, TicketCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { adminNavigation } from "@/data/navigation";
import { buildFlightEvaluationGovernance, flightEvaluationControls, flightEvaluationDecisionSafeguards } from "@/lib/flights/evaluation-governance";
import { buildFlightEvaluationIntakeAuthorizationDesign, flightEvaluationIntakeAuthorizationArtifacts, flightEvaluationIntakeAuthorizationSafeguards } from "@/lib/flights/evaluation-intake-authorization";
import { buildFlightEvaluationIntakeCloseoutDesign, flightEvaluationIntakeCloseoutArtifacts, flightEvaluationIntakeCloseoutSafeguards } from "@/lib/flights/evaluation-intake-closeout";
import { buildFlightEvaluationIntakeExecutionControlDesign, flightEvaluationIntakeExecutionControls, flightEvaluationIntakeExecutionSafeguards } from "@/lib/flights/evaluation-intake-execution-control";
import { buildFlightEvaluationIntakePreflightDesign, flightEvaluationIntakePreflightControls, flightEvaluationIntakePreflightSafeguards } from "@/lib/flights/evaluation-intake-preflight";
import { buildFlightEvaluationReviewAuthorizationDesign, flightEvaluationReviewAuthorizationArtifacts, flightEvaluationReviewAuthorizationSafeguards } from "@/lib/flights/evaluation-review-authorization";
import { buildFlightEvaluationReviewExecutionControlDesign, flightEvaluationReviewExecutionSafeguards, flightEvaluationReviewExecutionStages } from "@/lib/flights/evaluation-review-execution-control";
import { buildFlightEvaluationReviewPreflightDesign, flightEvaluationReviewPreflightControls, flightEvaluationReviewPreflightSafeguards } from "@/lib/flights/evaluation-review-preflight";
import { buildFlightProviderContactAuthorizationDesign, flightProviderContactAuthorizationArtifacts, flightProviderContactAuthorizationSafeguards } from "@/lib/flights/provider-contact-authorization";
import { buildFlightProviderContactCloseoutDesign, flightProviderContactCloseoutArtifacts, flightProviderContactCloseoutSafeguards } from "@/lib/flights/provider-contact-closeout";
import { buildFlightProviderContactExecutionControlDesign, flightProviderContactExecutionSafeguards, flightProviderContactExecutionStages } from "@/lib/flights/provider-contact-execution-control";
import { buildFlightProviderContactPreflightDesign, flightProviderContactPreflightControls, flightProviderContactPreflightSafeguards } from "@/lib/flights/provider-contact-preflight";
import { buildFlightEvaluationRehearsal, flightEvaluationRehearsalReceipts, flightEvaluationRehearsalScenarios } from "@/lib/flights/evaluation-rehearsal";
import { buildFlightRehearsalAuthorizationReadiness, flightRehearsalAuthorizationArtifacts, flightRehearsalAuthorizationSafeguards } from "@/lib/flights/rehearsal-authorization";
import { buildFlightRehearsalCloseoutDesign, flightRehearsalCloseoutArtifacts, flightRehearsalCloseoutSafeguards } from "@/lib/flights/rehearsal-closeout";
import { buildFlightRehearsalExecutionControlDesign, flightRehearsalExecutionSafeguards, flightRehearsalExecutionStages } from "@/lib/flights/rehearsal-execution-control";
import { buildFlightRehearsalPreflightDesign, flightRehearsalPreflightControls, flightRehearsalPreflightSafeguards } from "@/lib/flights/rehearsal-preflight";
import { buildFlightConnectorActivationReadiness } from "@/lib/flights/connector-activation-readiness";
import { buildFlightConnectorCandidateReviews } from "@/lib/flights/connector-candidate-review";
import { buildFlightSupplierDueDiligence, flightSupplierContractLanes, flightSupplierEvidenceWorkstreams } from "@/lib/flights/supplier-due-diligence";
import { buildFlightSupplierReadiness, flightCapabilityGroups, flightSupplierPaths } from "@/lib/flights/supplier-readiness";
import { buildFlightSupplierSelectionPlan, flightSandboxAdapterOperations, flightSupplierSelectionCriteria } from "@/lib/flights/supplier-selection";

export const metadata: Metadata = {
  title: "Duffel provider-contact closeout design",
  description: "Review the blocked, read-only Duffel provider-contact closeout boundary while authorization, preflight, execution, contact, delivery, responses, closeout, replies, intake, commitments, accounts, credentials, traffic, ticketing, payments, and Production remain disabled.",
};

export default function Page() {
  const readiness = buildFlightSupplierReadiness();
  const connectorReadiness = buildFlightConnectorActivationReadiness();
  const connectorReviews = buildFlightConnectorCandidateReviews();
  const selection = buildFlightSupplierSelectionPlan();
  const diligence = buildFlightSupplierDueDiligence();
  const governance = buildFlightEvaluationGovernance();
  const rehearsal = buildFlightEvaluationRehearsal();
  const authorization = buildFlightRehearsalAuthorizationReadiness();
  const preflight = buildFlightRehearsalPreflightDesign();
  const executionControl = buildFlightRehearsalExecutionControlDesign();
  const closeout = buildFlightRehearsalCloseoutDesign();
  const intakeAuthorization = buildFlightEvaluationIntakeAuthorizationDesign();
  const intakePreflight = buildFlightEvaluationIntakePreflightDesign();
  const intakeExecutionControl = buildFlightEvaluationIntakeExecutionControlDesign();
  const intakeCloseout = buildFlightEvaluationIntakeCloseoutDesign();
  const reviewAuthorization = buildFlightEvaluationReviewAuthorizationDesign();
  const reviewPreflight = buildFlightEvaluationReviewPreflightDesign();
  const reviewExecutionControl = buildFlightEvaluationReviewExecutionControlDesign();
  const providerContactCloseout = buildFlightProviderContactCloseoutDesign();
  const providerContactCloseoutLocks = [
    ["Phase 18 authorization prerequisite", providerContactCloseout.phase18AuthorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 19 preflight prerequisite", providerContactCloseout.phase19PreflightPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 20 execution record prerequisite", providerContactCloseout.phase20ExecutionRecordPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 20 software acceptance", providerContactCloseout.phase20SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Authorization reference", providerContactCloseout.authorizationReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Preflight receipt", providerContactCloseout.preflightReceiptState === "not_created" ? "Not created" : "Created"],
    ["Execution record", providerContactCloseout.executionRecordState === "not_created" ? "Not created" : "Created"],
    ["Closeout control", providerContactCloseout.closeoutControlState === "blocked" ? "Blocked" : "Ready"],
    ["Scope reconciliation", providerContactCloseout.scopeReconciliationState === "not_started" ? "Not started" : "Started"],
    ["Message", providerContactCloseout.messageState === "not_created" ? "Not created" : "Created"],
    ["Recipient role", providerContactCloseout.recipientRoleState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Channel", providerContactCloseout.channelState === "not_approved" ? "Not approved" : "Approved"],
    ["Contact window", providerContactCloseout.contactWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Supplier contact", providerContactCloseout.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Contact attempts", `${providerContactCloseout.contactAttemptCount}`],
    ["Delivery", providerContactCloseout.deliveryState === "not_attempted" ? "Not attempted" : "Attempted"],
    ["Contact receipt", providerContactCloseout.receiptState === "not_created" ? "Not created" : "Created"],
    ["Provider response", providerContactCloseout.responseState === "not_received" ? "Not received" : "Received"],
    ["Response quarantine", providerContactCloseout.responseQuarantineState === "not_created" ? "Not created" : "Created"],
    ["Response disposition", providerContactCloseout.responseDispositionState === "not_started" ? "Not started" : "Started"],
    ["Incident", providerContactCloseout.incidentState === "not_created" ? "Not created" : "Created"],
    ["Stop record", providerContactCloseout.stopRecordState === "not_created" ? "Not created" : "Created"],
    ["Access removal", providerContactCloseout.accessRemovalState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Retention", providerContactCloseout.retentionState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Deletion", providerContactCloseout.deletionState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Audit record", providerContactCloseout.auditRecordState === "not_created" ? "Not created" : "Created"],
    ["Role acknowledgments", providerContactCloseout.roleAcknowledgmentState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Conflict review", providerContactCloseout.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Dissent", providerContactCloseout.dissentState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Exceptions", providerContactCloseout.exceptionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Findings", `${providerContactCloseout.findingCount}`],
    ["Finding disposition", providerContactCloseout.findingDispositionState === "not_started" ? "Not started" : "Started"],
    ["Authorization expiry", providerContactCloseout.authorizationExpiryState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Closeout decision", providerContactCloseout.closeoutDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Closeout", providerContactCloseout.closeoutState === "not_created" ? "Not created" : "Created"],
    ["Evidence intake", providerContactCloseout.evidenceIntakeState === "closed" ? "Closed" : "Open"],
    ["Evaluation case", providerContactCloseout.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Recommendation", providerContactCloseout.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Supplier selection", providerContactCloseout.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", providerContactCloseout.contractState === "not_received" ? "Not received" : "Received"],
    ["Provider account", providerContactCloseout.accountState === "not_created" ? "Not created" : "Created"],
    ["Credentials", providerContactCloseout.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", providerContactCloseout.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", providerContactCloseout.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", providerContactCloseout.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", providerContactCloseout.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", providerContactCloseout.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", providerContactCloseout.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const providerContactExecutionControl = buildFlightProviderContactExecutionControlDesign();
  const providerContactExecutionLocks = [
    ["Phase 18 authorization prerequisite", providerContactExecutionControl.phase18AuthorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 19 preflight prerequisite", providerContactExecutionControl.phase19PreflightPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 19 software acceptance", providerContactExecutionControl.phase19SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Authorization reference", providerContactExecutionControl.authorizationReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Preflight receipt", providerContactExecutionControl.preflightReceiptState === "not_created" ? "Not created" : "Created"],
    ["Execution control", providerContactExecutionControl.executionControlState === "blocked" ? "Blocked" : "Ready"],
    ["Action-time decision", providerContactExecutionControl.executionDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Contact scope binding", providerContactExecutionControl.contactScopeBindingState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Sender", providerContactExecutionControl.senderState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Approvers", providerContactExecutionControl.approverState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Conflict review", providerContactExecutionControl.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Contact access", providerContactExecutionControl.accessState === "not_granted" ? "Not granted" : "Granted"],
    ["Message", providerContactExecutionControl.messageState === "not_created" ? "Not created" : "Created"],
    ["Message freeze", providerContactExecutionControl.messageFreezeState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Disclosures", providerContactExecutionControl.disclosureState === "not_approved" ? "Not approved" : "Approved"],
    ["Recipient role", providerContactExecutionControl.recipientRoleState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Channel", providerContactExecutionControl.channelState === "not_approved" ? "Not approved" : "Approved"],
    ["Channel authenticity", providerContactExecutionControl.channelAuthenticityState === "not_verified" ? "Not verified" : "Verified"],
    ["Recordkeeping plan", providerContactExecutionControl.recordkeepingPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Contact window", providerContactExecutionControl.contactWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Supplier contact", providerContactExecutionControl.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Contact attempts", `${providerContactExecutionControl.contactAttemptCount}`],
    ["Contact receipt", providerContactExecutionControl.receiptState === "not_created" ? "Not created" : "Created"],
    ["Provider response", providerContactExecutionControl.responseState === "not_received" ? "Not received" : "Received"],
    ["Response disposition", providerContactExecutionControl.responseDispositionState === "not_started" ? "Not started" : "Started"],
    ["Response quarantine", providerContactExecutionControl.responseQuarantineState === "not_created" ? "Not created" : "Created"],
    ["Incident", providerContactExecutionControl.incidentState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Stop record", providerContactExecutionControl.stopRecordState === "not_created" ? "Not created" : "Created"],
    ["Closeout", providerContactExecutionControl.closeoutState === "not_created" ? "Not created" : "Created"],
    ["Evidence intake", providerContactExecutionControl.evidenceIntakeState === "closed" ? "Closed" : "Open"],
    ["Evaluation case", providerContactExecutionControl.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Recommendation", providerContactExecutionControl.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Supplier selection", providerContactExecutionControl.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", providerContactExecutionControl.contractState === "not_received" ? "Not received" : "Received"],
    ["Provider account", providerContactExecutionControl.accountState === "not_created" ? "Not created" : "Created"],
    ["Credentials", providerContactExecutionControl.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", providerContactExecutionControl.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", providerContactExecutionControl.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", providerContactExecutionControl.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", providerContactExecutionControl.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", providerContactExecutionControl.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", providerContactExecutionControl.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const providerContactPreflight = buildFlightProviderContactPreflightDesign();
  const providerContactPreflightLocks = [
    ["Phase 18 authorization prerequisite", providerContactPreflight.phase18AuthorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 18 software acceptance", providerContactPreflight.phase18SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Authorization reference", providerContactPreflight.authorizationReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Primary intended path", providerContactPreflight.primaryProviderPath === "duffel" ? "Duffel" : "Not recorded"],
    ["Secondary intended path", providerContactPreflight.secondaryProviderPath === "sabre" ? "Sabre" : "Not recorded"],
    ["Parallel launch", providerContactPreflight.parallelLaunchState === "not_authorized" ? "Not authorized" : "Authorized"],
    ["Preflight", providerContactPreflight.preflightState === "blocked" ? "Blocked" : "Ready"],
    ["Preflight decision", providerContactPreflight.preflightDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Contact authorization", providerContactPreflight.contactAuthorizationState === "blocked" ? "Blocked" : "Ready"],
    ["Contact purpose", providerContactPreflight.contactPurposeState === "not_bound" ? "Not bound" : "Bound"],
    ["Sender", providerContactPreflight.senderState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Approvers", providerContactPreflight.approverState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Message", providerContactPreflight.messageState === "not_created" ? "Not created" : "Created"],
    ["Message freeze", providerContactPreflight.messageFreezeState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Disclosures", providerContactPreflight.disclosureState === "not_approved" ? "Not approved" : "Approved"],
    ["Recipient role", providerContactPreflight.recipientRoleState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Channel", providerContactPreflight.channelState === "not_approved" ? "Not approved" : "Approved"],
    ["Channel authenticity", providerContactPreflight.channelAuthenticityState === "not_verified" ? "Not verified" : "Verified"],
    ["Conflict review", providerContactPreflight.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Privacy and security review", providerContactPreflight.privacySecurityReviewState === "not_started" ? "Not started" : "Started"],
    ["Recordkeeping plan", providerContactPreflight.recordkeepingPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Stop plan", providerContactPreflight.stopPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Response disposition plan", providerContactPreflight.responseDispositionPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Closeout plan", providerContactPreflight.closeoutPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Contact window", providerContactPreflight.contactWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Supplier contact", providerContactPreflight.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Contact attempts", `${providerContactPreflight.contactAttemptCount}`],
    ["Contact receipt", providerContactPreflight.receiptState === "not_created" ? "Not created" : "Created"],
    ["Provider response", providerContactPreflight.responseState === "not_received" ? "Not received" : "Received"],
    ["Evidence intake", providerContactPreflight.evidenceIntakeState === "closed" ? "Closed" : "Open"],
    ["Evaluation case", providerContactPreflight.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Recommendation", providerContactPreflight.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Supplier selection", providerContactPreflight.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", providerContactPreflight.contractState === "not_received" ? "Not received" : "Received"],
    ["Provider account", providerContactPreflight.accountState === "not_created" ? "Not created" : "Created"],
    ["Credentials", providerContactPreflight.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", providerContactPreflight.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox traffic", providerContactPreflight.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", providerContactPreflight.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", providerContactPreflight.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", providerContactPreflight.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const providerContactAuthorization = buildFlightProviderContactAuthorizationDesign();
  const providerContactAuthorizationLocks = [
    ["Provider-path preference", providerContactAuthorization.providerPathPreferenceState === "recorded" ? "Recorded" : "Pending"],
    ["Primary intended path", providerContactAuthorization.primaryProviderPath === "duffel" ? "Duffel" : "Not recorded"],
    ["Secondary intended path", providerContactAuthorization.secondaryProviderPath === "sabre" ? "Sabre" : "Not recorded"],
    ["Parallel launch", providerContactAuthorization.parallelLaunchState === "not_authorized" ? "Not authorized" : "Authorized"],
    ["Contact authorization", providerContactAuthorization.contactAuthorizationState === "blocked" ? "Blocked" : "Ready"],
    ["Action-time decision", providerContactAuthorization.actionTimeDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Contact purpose", providerContactAuthorization.contactPurposeState === "not_bound" ? "Not bound" : "Bound"],
    ["Sender", providerContactAuthorization.senderState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Approvers", providerContactAuthorization.approverState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Approved message", providerContactAuthorization.messageState === "not_created" ? "Not created" : "Created"],
    ["Disclosures", providerContactAuthorization.disclosureState === "not_approved" ? "Not approved" : "Approved"],
    ["Recipient", providerContactAuthorization.recipientState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Channel", providerContactAuthorization.channelState === "not_approved" ? "Not approved" : "Approved"],
    ["Contact window", providerContactAuthorization.contactWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Supplier contact", providerContactAuthorization.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Contact attempts", `${providerContactAuthorization.contactAttemptCount}`],
    ["Contact receipt", providerContactAuthorization.receiptState === "not_created" ? "Not created" : "Created"],
    ["Provider response", providerContactAuthorization.responseState === "not_received" ? "Not received" : "Received"],
    ["Evidence intake", providerContactAuthorization.evidenceIntakeState === "closed" ? "Closed" : "Open"],
    ["Evaluation case", providerContactAuthorization.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Recommendation", providerContactAuthorization.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Supplier selection", providerContactAuthorization.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", providerContactAuthorization.contractState === "not_received" ? "Not received" : "Received"],
    ["Provider account", providerContactAuthorization.accountState === "not_created" ? "Not created" : "Created"],
    ["Credentials", providerContactAuthorization.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", providerContactAuthorization.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox traffic", providerContactAuthorization.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", providerContactAuthorization.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", providerContactAuthorization.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", providerContactAuthorization.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const reviewExecutionLocks = [
    ["Phase 15 authorization prerequisite", reviewExecutionControl.phase15AuthorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 16 preflight prerequisite", reviewExecutionControl.phase16PreflightPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 16 software acceptance", reviewExecutionControl.phase16SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Authorization reference", reviewExecutionControl.authorizationReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Preflight receipt", reviewExecutionControl.preflightReceiptState === "not_created" ? "Not created" : "Created"],
    ["Execution control", reviewExecutionControl.executionControlState === "blocked" ? "Blocked" : "Ready"],
    ["Action-time decision", reviewExecutionControl.executionDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Review scope binding", reviewExecutionControl.reviewScopeBindingState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evidence review", reviewExecutionControl.evaluationReviewState === "closed" ? "Closed" : "Open"],
    ["Review window", reviewExecutionControl.reviewWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Supplier contact", reviewExecutionControl.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Candidate", reviewExecutionControl.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", reviewExecutionControl.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Submission channel", reviewExecutionControl.submissionChannelState === "not_created" ? "Not created" : "Created"],
    ["Supplier evidence", `${reviewExecutionControl.evidenceCount}`],
    ["Evidence inventory", reviewExecutionControl.evidenceInventoryState === "not_created" ? "Not created" : "Created"],
    ["Evidence inventory hash", reviewExecutionControl.evidenceInventoryHashState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evidence lineage", reviewExecutionControl.evidenceLineageState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Admissibility review", reviewExecutionControl.admissibilityReviewState === "not_started" ? "Not started" : "Started"],
    ["Rubric", reviewExecutionControl.rubricState === "not_approved" ? "Not approved" : "Approved"],
    ["Rubric version", reviewExecutionControl.rubricVersionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Rubric freeze", reviewExecutionControl.rubricFreezeState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Reviewer", reviewExecutionControl.reviewerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", reviewExecutionControl.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Conflict review", reviewExecutionControl.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Review access", reviewExecutionControl.accessState === "not_granted" ? "Not granted" : "Granted"],
    ["Review session", reviewExecutionControl.reviewSessionState === "not_created" ? "Not created" : "Created"],
    ["Released criteria", `${reviewExecutionControl.releasedCriterionCount}`],
    ["Reviewed evidence", `${reviewExecutionControl.reviewedEvidenceCount}`],
    ["Observations", `${reviewExecutionControl.observationCount}`],
    ["Calculations", `${reviewExecutionControl.calculationCount}`],
    ["Privacy and security review", reviewExecutionControl.privacySecurityReviewState === "not_started" ? "Not started" : "Started"],
    ["Work product", reviewExecutionControl.workProductState === "not_created" ? "Not created" : "Created"],
    ["Variance review", reviewExecutionControl.varianceReviewState === "not_started" ? "Not started" : "Started"],
    ["Dissent", reviewExecutionControl.dissentState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Exceptions", reviewExecutionControl.exceptionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Findings", `${reviewExecutionControl.findingCount}`],
    ["Stop record", reviewExecutionControl.stopRecordState === "not_created" ? "Not created" : "Created"],
    ["Closeout", reviewExecutionControl.closeoutState === "not_created" ? "Not created" : "Created"],
    ["Score", reviewExecutionControl.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Scorecard", reviewExecutionControl.scorecardState === "not_created" ? "Not created" : "Created"],
    ["Recommendation", reviewExecutionControl.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", reviewExecutionControl.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Commercial diligence", reviewExecutionControl.commercialDiligenceState === "not_started" ? "Not started" : "Started"],
    ["Contract", reviewExecutionControl.contractState === "not_received" ? "Not received" : "Received"],
    ["Supplier selection", reviewExecutionControl.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Credentials", reviewExecutionControl.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", reviewExecutionControl.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", reviewExecutionControl.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", reviewExecutionControl.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", reviewExecutionControl.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", reviewExecutionControl.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", reviewExecutionControl.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const reviewPreflightLocks = [
    ["Phase 15 authorization prerequisite", reviewPreflight.phase15AuthorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 15 software acceptance", reviewPreflight.phase15SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Authorization reference", reviewPreflight.authorizationReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Review preflight", reviewPreflight.preflightState === "blocked" ? "Blocked" : "Ready"],
    ["Action-time decision", reviewPreflight.preflightDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evidence review", reviewPreflight.evaluationReviewState === "closed" ? "Closed" : "Open"],
    ["Review window", reviewPreflight.reviewWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Supplier contact", reviewPreflight.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Candidate", reviewPreflight.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", reviewPreflight.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Submission channel", reviewPreflight.submissionChannelState === "not_created" ? "Not created" : "Created"],
    ["Supplier evidence", `${reviewPreflight.evidenceCount}`],
    ["Evidence inventory", reviewPreflight.evidenceInventoryState === "not_created" ? "Not created" : "Created"],
    ["Evidence inventory hash", reviewPreflight.evidenceInventoryHashState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evidence lineage", reviewPreflight.evidenceLineageState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Admissibility review", reviewPreflight.admissibilityReviewState === "not_started" ? "Not started" : "Started"],
    ["Rubric", reviewPreflight.rubricState === "not_approved" ? "Not approved" : "Approved"],
    ["Rubric version", reviewPreflight.rubricVersionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Rubric freeze", reviewPreflight.rubricFreezeState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Reviewer", reviewPreflight.reviewerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", reviewPreflight.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Conflict review", reviewPreflight.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Review access", reviewPreflight.accessState === "not_granted" ? "Not granted" : "Granted"],
    ["Privacy and security review", reviewPreflight.privacySecurityReviewState === "not_started" ? "Not started" : "Started"],
    ["Retention", reviewPreflight.retentionState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Deletion", reviewPreflight.deletionState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Work-product plan", reviewPreflight.workProductPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Variance review", reviewPreflight.varianceReviewState === "not_started" ? "Not started" : "Started"],
    ["Dissent", reviewPreflight.dissentState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Exceptions", reviewPreflight.exceptionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Stop plan", reviewPreflight.stopPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Closeout plan", reviewPreflight.closeoutPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Score", reviewPreflight.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Scorecard", reviewPreflight.scorecardState === "not_created" ? "Not created" : "Created"],
    ["Findings", `${reviewPreflight.findingCount}`],
    ["Recommendation", reviewPreflight.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", reviewPreflight.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Commercial diligence", reviewPreflight.commercialDiligenceState === "not_started" ? "Not started" : "Started"],
    ["Contract", reviewPreflight.contractState === "not_received" ? "Not received" : "Received"],
    ["Supplier selection", reviewPreflight.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Credentials", reviewPreflight.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", reviewPreflight.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", reviewPreflight.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", reviewPreflight.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", reviewPreflight.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", reviewPreflight.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", reviewPreflight.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const reviewAuthorizationLocks = [
    ["Phase 14 closeout prerequisite", reviewAuthorization.phase14CloseoutPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 14 software acceptance", reviewAuthorization.phase14SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Closeout reference", reviewAuthorization.closeoutReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Review authorization", reviewAuthorization.reviewAuthorizationState === "blocked" ? "Blocked" : "Ready"],
    ["Evidence review", reviewAuthorization.evaluationReviewState === "closed" ? "Closed" : "Open"],
    ["Action-time decision", reviewAuthorization.reviewDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Review window", reviewAuthorization.reviewWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Supplier contact", reviewAuthorization.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Candidate", reviewAuthorization.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", reviewAuthorization.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Submission channel", reviewAuthorization.submissionChannelState === "not_created" ? "Not created" : "Created"],
    ["Supplier evidence", `${reviewAuthorization.evidenceCount}`],
    ["Evidence inventory", reviewAuthorization.evidenceInventoryState === "not_created" ? "Not created" : "Created"],
    ["Evidence lineage", reviewAuthorization.evidenceLineageState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Admissibility review", reviewAuthorization.admissibilityReviewState === "not_started" ? "Not started" : "Started"],
    ["Rubric", reviewAuthorization.rubricState === "not_approved" ? "Not approved" : "Approved"],
    ["Rubric version", reviewAuthorization.rubricVersionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Reviewer", reviewAuthorization.reviewerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", reviewAuthorization.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Conflict review", reviewAuthorization.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Review access", reviewAuthorization.accessState === "not_granted" ? "Not granted" : "Granted"],
    ["Score", reviewAuthorization.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Scorecard", reviewAuthorization.scorecardState === "not_created" ? "Not created" : "Created"],
    ["Variance review", reviewAuthorization.varianceReviewState === "not_started" ? "Not started" : "Started"],
    ["Dissent", reviewAuthorization.dissentState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Exceptions", reviewAuthorization.exceptionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Findings", `${reviewAuthorization.findingCount}`],
    ["Recommendation", reviewAuthorization.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", reviewAuthorization.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Commercial diligence", reviewAuthorization.commercialDiligenceState === "not_started" ? "Not started" : "Started"],
    ["Contract", reviewAuthorization.contractState === "not_received" ? "Not received" : "Received"],
    ["Supplier selection", reviewAuthorization.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Credentials", reviewAuthorization.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", reviewAuthorization.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", reviewAuthorization.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", reviewAuthorization.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", reviewAuthorization.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", reviewAuthorization.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", reviewAuthorization.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const intakeCloseoutLocks = [
    ["Phase 11 authorization prerequisite", intakeCloseout.phase11AuthorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 12 preflight prerequisite", intakeCloseout.phase12PreflightPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 13 execution-record prerequisite", intakeCloseout.phase13ExecutionRecordPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 13 software acceptance", intakeCloseout.phase13SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Authorization reference", intakeCloseout.authorizationReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Preflight receipt", intakeCloseout.preflightReceiptState === "not_created" ? "Not created" : "Created"],
    ["Execution record", intakeCloseout.executionRecordState === "not_created" ? "Not created" : "Created"],
    ["Closeout control", intakeCloseout.closeoutControlState === "blocked" ? "Blocked" : "Ready"],
    ["Scope reconciliation", intakeCloseout.scopeReconciliationState === "not_started" ? "Not started" : "Started"],
    ["Intake window", intakeCloseout.intakeWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Supplier contact", intakeCloseout.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Contact handoff", intakeCloseout.contactHandoffState === "not_created" ? "Not created" : "Created"],
    ["Candidate", intakeCloseout.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", intakeCloseout.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Submission channel", intakeCloseout.submissionChannelState === "not_created" ? "Not created" : "Created"],
    ["Supplier evidence", `${intakeCloseout.evidenceCount}`],
    ["Evidence inventory", intakeCloseout.evidenceInventoryState === "not_created" ? "Not created" : "Created"],
    ["Sanitation", intakeCloseout.sanitationState === "not_started" ? "Not started" : "Started"],
    ["Quarantine", intakeCloseout.quarantineState === "not_started" ? "Not started" : "Started"],
    ["Incident", intakeCloseout.incidentState === "not_created" ? "Not created" : "Created"],
    ["Stop record", intakeCloseout.stopRecordState === "not_created" ? "Not created" : "Created"],
    ["Contamination review", intakeCloseout.contaminationReviewState === "not_started" ? "Not started" : "Started"],
    ["Retention", intakeCloseout.retentionState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Deletion", intakeCloseout.deletionState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Access removal", intakeCloseout.accessRemovalState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Reviewer", intakeCloseout.reviewerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", intakeCloseout.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Conflict review", intakeCloseout.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Dissent", intakeCloseout.dissentState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Exceptions", intakeCloseout.exceptionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Findings", `${intakeCloseout.findingCount}`],
    ["Findings disposition", intakeCloseout.findingDispositionState === "not_started" ? "Not started" : "Started"],
    ["Teardown", intakeCloseout.teardownState === "not_started" ? "Not started" : "Started"],
    ["Authorization expiry", intakeCloseout.authorizationExpiryState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Closeout decision", intakeCloseout.closeoutDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Closeout", intakeCloseout.closeoutState === "not_created" ? "Not created" : "Created"],
    ["Evaluation intake", intakeCloseout.evaluationIntakeState === "closed" ? "Closed" : "Open"],
    ["Score", intakeCloseout.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Recommendation", intakeCloseout.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", intakeCloseout.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Contract", intakeCloseout.contractState === "not_received" ? "Not received" : "Received"],
    ["Supplier selection", intakeCloseout.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Credentials", intakeCloseout.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", intakeCloseout.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", intakeCloseout.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", intakeCloseout.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", intakeCloseout.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", intakeCloseout.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", intakeCloseout.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const intakeExecutionLocks = [
    ["Phase 11 authorization prerequisite", intakeExecutionControl.phase11AuthorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 12 preflight prerequisite", intakeExecutionControl.phase12PreflightPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 12 software acceptance", intakeExecutionControl.phase12SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Authorization reference", intakeExecutionControl.authorizationReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Preflight receipt", intakeExecutionControl.preflightReceiptState === "not_created" ? "Not created" : "Created"],
    ["Execution control", intakeExecutionControl.executionControlState === "blocked" ? "Blocked" : "Ready"],
    ["Action-time decision", intakeExecutionControl.executionDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Scope binding", intakeExecutionControl.scopeBindingState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Intake window", intakeExecutionControl.intakeWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Candidate-neutrality check", intakeExecutionControl.candidateNeutralityCheckState === "not_started" ? "Not started" : "Started"],
    ["Contact handoff", intakeExecutionControl.contactHandoffState === "not_created" ? "Not created" : "Created"],
    ["Submission channel", intakeExecutionControl.submissionChannelState === "not_created" ? "Not created" : "Created"],
    ["Isolation proof", intakeExecutionControl.isolationProofState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evidence taxonomy", intakeExecutionControl.evidenceTaxonomyState === "not_approved" ? "Not approved" : "Approved"],
    ["Reviewer", intakeExecutionControl.roleAssignmentState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", intakeExecutionControl.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Conflict review", intakeExecutionControl.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Evaluation intake", intakeExecutionControl.evaluationIntakeState === "closed" ? "Closed" : "Open"],
    ["Supplier contact", intakeExecutionControl.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Candidate", intakeExecutionControl.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", intakeExecutionControl.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Supplier evidence", `${intakeExecutionControl.evidenceCount}`],
    ["Sanitation", intakeExecutionControl.sanitationState === "not_started" ? "Not started" : "Started"],
    ["Quarantine", intakeExecutionControl.quarantineState === "not_started" ? "Not started" : "Started"],
    ["Incident", intakeExecutionControl.incidentState === "not_created" ? "Not created" : "Created"],
    ["Stop record", intakeExecutionControl.stopRecordState === "not_created" ? "Not created" : "Created"],
    ["Teardown", intakeExecutionControl.teardownState === "not_started" ? "Not started" : "Started"],
    ["Closeout", intakeExecutionControl.closeoutState === "not_created" ? "Not created" : "Created"],
    ["Authorization expiry", intakeExecutionControl.authorizationExpiryState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Score", intakeExecutionControl.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Recommendation", intakeExecutionControl.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", intakeExecutionControl.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Supplier selection", intakeExecutionControl.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", intakeExecutionControl.contractState === "not_received" ? "Not received" : "Received"],
    ["Credentials", intakeExecutionControl.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", intakeExecutionControl.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", intakeExecutionControl.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", intakeExecutionControl.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", intakeExecutionControl.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", intakeExecutionControl.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", intakeExecutionControl.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const intakePreflightLocks = [
    ["Phase 11 authorization prerequisite", intakePreflight.phase11AuthorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 11 software acceptance", intakePreflight.phase11SoftwareAcceptanceState === "accepted_in_preview" ? "Accepted in Preview" : "Pending"],
    ["Authorization reference", intakePreflight.authorizationReferenceState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Intake preflight", intakePreflight.preflightState === "blocked" ? "Blocked" : "Ready"],
    ["Scope binding", intakePreflight.scopeBindingState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Candidate-neutrality check", intakePreflight.candidateNeutralityCheckState === "not_started" ? "Not started" : "Started"],
    ["Contact plan", intakePreflight.contactPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Submission channel", intakePreflight.submissionChannelState === "not_created" ? "Not created" : "Created"],
    ["Isolation proof", intakePreflight.isolationProofState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evidence taxonomy", intakePreflight.evidenceTaxonomyState === "not_approved" ? "Not approved" : "Approved"],
    ["Reviewer", intakePreflight.roleAssignmentState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", intakePreflight.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Conflict review", intakePreflight.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Evaluation intake", intakePreflight.evaluationIntakeState === "closed" ? "Closed" : "Open"],
    ["Supplier contact", intakePreflight.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Candidate", intakePreflight.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", intakePreflight.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Supplier evidence", `${intakePreflight.evidenceCount}`],
    ["Authorization window", intakePreflight.authorizationWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Stop plan", intakePreflight.stopPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Closeout plan", intakePreflight.closeoutPlanState === "not_approved" ? "Not approved" : "Approved"],
    ["Score", intakePreflight.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Recommendation", intakePreflight.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", intakePreflight.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Supplier selection", intakePreflight.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", intakePreflight.contractState === "not_received" ? "Not received" : "Received"],
    ["Credentials", intakePreflight.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", intakePreflight.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", intakePreflight.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", intakePreflight.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", intakePreflight.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", intakePreflight.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", intakePreflight.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const intakeAuthorizationLocks = [
    ["Phase 10 closeout prerequisite", intakeAuthorization.phase10CloseoutPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Phase 10 Preview acceptance", intakeAuthorization.phase10PreviewAcceptanceState === "pending" ? "Pending" : "Complete"],
    ["Intake authorization", intakeAuthorization.intakeAuthorizationState === "blocked" ? "Blocked" : "Ready"],
    ["Evaluation intake", intakeAuthorization.evaluationIntakeState === "closed" ? "Closed" : "Open"],
    ["Supplier contact", intakeAuthorization.supplierContactState === "not_started" ? "Not started" : "Started"],
    ["Candidate", intakeAuthorization.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", intakeAuthorization.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Submission channel", intakeAuthorization.submissionChannelState === "not_created" ? "Not created" : "Created"],
    ["Supplier evidence", `${intakeAuthorization.evidenceCount}`],
    ["Reviewer", intakeAuthorization.reviewerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", intakeAuthorization.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Conflict review", intakeAuthorization.conflictReviewState === "not_started" ? "Not started" : "Started"],
    ["Authorization decision", intakeAuthorization.authorizationDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Authorization window", intakeAuthorization.authorizationWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Score", intakeAuthorization.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Recommendation", intakeAuthorization.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", intakeAuthorization.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Supplier selection", intakeAuthorization.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", intakeAuthorization.contractState === "not_received" ? "Not received" : "Received"],
    ["Credentials", intakeAuthorization.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", intakeAuthorization.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", intakeAuthorization.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", intakeAuthorization.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", intakeAuthorization.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", intakeAuthorization.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", intakeAuthorization.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;
  const closeoutLocks = [
    ["Authorization prerequisite", closeout.authorizationPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Preflight prerequisite", closeout.preflightPrerequisiteState === "not_satisfied" ? "Not satisfied" : "Satisfied"],
    ["Execution record", closeout.executionRecordState === "not_created" ? "Not created" : "Created"],
    ["Closeout control", closeout.closeoutControlState === "blocked" ? "Blocked" : "Ready"],
    ["Execution window", closeout.executionWindowState === "not_opened" ? "Not opened" : "Opened"],
    ["Scope binding", closeout.scopeBindingState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Fixture manifest", closeout.fixtureManifestState === "not_created" ? "Not created" : "Created"],
    ["Synthetic fixture", closeout.syntheticFixtureState === "not_created" ? "Not created" : "Created"],
    ["Roles", closeout.roleAssignmentState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Observer", closeout.observerState === "not_assigned" ? "Not assigned" : "Assigned"],
    ["Rehearsal", closeout.rehearsalState === "not_run" ? "Not run" : "Run"],
    ["Released scenarios", `${closeout.releasedScenarioCount}`],
    ["Scenario results", `${closeout.scenarioResultCount}`],
    ["Observations", `${closeout.observationCount}`],
    ["Rehearsal receipts", closeout.receiptState === "not_created" ? "Not created" : "Created"],
    ["Findings", `${closeout.findingCount}`],
    ["Findings disposition", closeout.findingDispositionState === "not_started" ? "Not started" : "Started"],
    ["Contamination review", closeout.contaminationReviewState === "not_started" ? "Not started" : "Started"],
    ["Teardown", closeout.teardownState === "not_started" ? "Not started" : "Started"],
    ["Fixture deletion", closeout.fixtureDeletionState === "not_confirmed" ? "Not confirmed" : "Confirmed"],
    ["Observer closeout", closeout.observerCloseoutState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Authorization expiration", closeout.authorizationExpirationState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Closeout decision", closeout.closeoutDecisionState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Closeout", closeout.closeoutState === "not_created" ? "Not created" : "Created"],
    ["Evaluation intake", closeout.evaluationIntakeState === "closed" ? "Closed" : "Open"],
    ["Candidate", closeout.candidateState === "not_recorded" ? "Not recorded" : "Recorded"],
    ["Evaluation case", closeout.evaluationCaseState === "not_created" ? "Not created" : "Created"],
    ["Score", closeout.scoreState === "not_calculated" ? "Not calculated" : "Calculated"],
    ["Recommendation", closeout.recommendationState === "not_issued" ? "Not issued" : "Issued"],
    ["Shortlist", closeout.shortlistState === "not_created" ? "Not created" : "Created"],
    ["Supplier selection", closeout.selectionState === "not_selected" ? "Not selected" : "Selected"],
    ["Contract", closeout.contractState === "not_received" ? "Not received" : "Received"],
    ["Credentials", closeout.credentialsAccepted ? "Accepted" : "Not accepted"],
    ["External network", closeout.externalNetworkAccess ? "Enabled" : "Disabled"],
    ["Sandbox adapter", closeout.sandboxAdapterImplemented ? "Implemented" : "Not implemented"],
    ["Sandbox traffic", closeout.sandboxTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Production traffic", closeout.productionTrafficAuthorized ? "Enabled" : "Disabled"],
    ["Ticketing", closeout.ticketingAuthorized ? "Enabled" : "Disabled"],
    ["Flight payments", closeout.paymentAuthorized ? "Enabled" : "Disabled"],
  ] as const;

  return (
    <DashboardShell title="Admin Console" items={adminNavigation}>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 21 · Duffel contact closeout design only</p>
      <h1 className="mt-2 text-3xl font-bold">Duffel provider-contact closeout plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the fail-closed reconciliation and closeout boundary for a possible future, separately authorized single Duffel diligence contact: actual Phase 18 authorization, a separately approved Phase 19 preflight receipt, a separately approved Phase 20 execution record, immutable scope and message, accountable roles, authentic channel, attempt and delivery outcome, minimal receipt, responses and quarantine, incidents and stops, access removal, retention and deletion, audit, findings, expiry, no retry, no restart, and no downstream authority. Phase 20 software was accepted in isolated Preview, but no actual authorization, preflight, execution, contact, delivery, receipt, response, or closeout evidence exists. This page has no closeout or reply control and cannot identify or contact a recipient, create or transmit a message, reconcile an attempt, open or inspect a response, admit evidence, accept terms, recommend or select a supplier, create an account, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Duffel provider-contact closeout is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">Phase 20 software acceptance is recorded, but no actual Phase 18 authorization, Phase 19 preflight receipt, Phase 20 execution record, message, recipient role, channel, contact window, attempt, delivery, receipt, response, quarantine item, incident, stop, access-removal record, retention or deletion proof, audit record, finding, expiry record, closeout decision, closeout receipt, reply, intake, case, recommendation, selection, contract, account, credential, traffic, ticketing, or payment exists. Completing every Phase 21 design gate cannot prove contact or create closeout.</p>
          <div className="mt-6 text-4xl font-bold">{providerContactCloseout.completedCount}/{providerContactCloseout.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 21 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providerContactCloseoutLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Candidate evidence review</p><h2 className="mt-2 text-2xl font-bold">Seven-workstream diligence checklist</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Approved-candidate status does not select a supplier. Each connector requires attributable evidence across seven workstreams before a shortlist or contract decision can be considered. Current state: {connectorReviews.completeReviewCount}/{connectorReviews.totalCandidates} reviews complete.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connectorReviews.reviews.map((review) => (
            <article key={review.connectorId} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{review.label}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600">Evidence {review.completedCount}/{review.totalCount}</span></div>
              <p className="mt-3 text-sm leading-6 text-slate-600">Review pending; no shortlist, selection, contract, credential, or provider contact is recorded.</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Workstreams:</strong> {review.workstreams.map((workstream) => workstream.label).join(", ")}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact closeout blueprint only</p><h2 className="mt-2 text-2xl font-bold">Seven provider-contact closeout evidence artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static artifacts define how a future separately authorized attempt would have to be reconciled from prerequisite records through expiry and closeout. They do not create or validate authorization, preflight, execution, roles, a message, a recipient, a channel, a window, an attempt, delivery, a receipt, a response, quarantine, an incident, access removal, retention, deletion, audit evidence, a finding, closeout, a reply, intake, commitment, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightProviderContactCloseoutArtifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{artifact.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{artifact.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{artifact.closeoutRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {artifact.nonRecordBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Any missing, altered, sensitive, unresolved, retained, or disputed evidence blocks closeout</p><h2 className="mt-2 text-2xl font-bold">Five closeout reconciliation safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep implied execution, authority or scope drift, duplicate or automated attempts, delivery and receipt mismatch, responses, quarantine, incidents, stops, access, retention, deletion, expiry, replies, retries, restarts, and downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightProviderContactCloseoutSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 21 provider-contact closeout sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned provider-contact closeout gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot satisfy actual Phase 18 authorization, Phase 19 preflight, or Phase 20 execution; prove that contact occurred; reconcile an attempt; create a closeout receipt; reply to Duffel; admit or rely on a response; recommend or select a supplier; or authorize any external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {providerContactCloseout.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 20 · Duffel contact execution-control design only</p>
        <h2 className="mt-2 text-2xl font-bold">Provider-contact execution-control reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Actual provider-contact execution remains unsatisfied.</strong> Phase 20 software was accepted in isolated Preview, but no actual Phase 18 authorization, Phase 19 preflight receipt, Phase 20 execution record, sender, approver, message, recipient role, channel, contact window, attempt, delivery, or receipt exists. Phase 21 does not create, satisfy, replace, or bypass Phase 18, Phase 19, or Phase 20 authority.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 20 · Duffel contact execution-control design only</p>
      <h1 className="mt-2 text-3xl font-bold">Duffel provider-contact execution-control plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the fail-closed control sequence for a possible future single Duffel diligence contact: actual Phase 18 authorization, a separately approved Phase 19 preflight receipt, immutable scope and message, accountable independent roles, official recipient role and authentic channel, one manual attempt, a fixed window, two-person release, immediate stops, response quarantine, incident handling, minimal audit, expiry, closeout, and no-downstream authority. Phase 19 software was accepted in isolated Preview, but no actual authorization or preflight exists. This page has no send control and cannot identify or contact a recipient, create or transmit a message, open a window, receive or inspect a response, admit evidence, accept terms, recommend or select a supplier, create an account, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Duffel provider-contact execution is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">Phase 19 software acceptance is recorded, but no actual Phase 18 authorization, Phase 19 preflight receipt, immutable authority reference, bound contact scope, sender, approver, access, message, disclosure packet, recipient role, verified channel, action-time start decision, contact window, attempt, receipt, response, quarantine, incident record, closeout, intake, case, recommendation, selection, contract, account, credential, traffic, ticketing, or payment exists. Completing every Phase 20 design gate cannot start or perform contact.</p>
          <div className="mt-6 text-4xl font-bold">{providerContactExecutionControl.completedCount}/{providerContactExecutionControl.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 20 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providerContactExecutionLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contact execution blueprint only</p><h2 className="mt-2 text-2xl font-bold">Seven controlled provider-contact stages</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static stages define how a future separately authorized one-attempt contact would have to remain bound from authority through closeout. They do not create authorization, preflight, roles, access, a message, a recipient, a channel, a window, a send, a receipt, a response, evidence, an incident, closeout, commitment, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightProviderContactExecutionStages.map((stage) => (
            <article key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{stage.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{stage.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{stage.executionRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {stage.nonExecutionBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Any missing, changed, automated, sensitive, or response-bearing event aborts contact</p><h2 className="mt-2 text-2xl font-bold">Five immediate-stop contact safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep implied start, authority or message drift, identity or channel mismatch, conflicts, automation, retries, sensitive content, attachments, credentials, commitments, incidents, responses, incomplete closeout, and downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightProviderContactExecutionSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 20 provider-contact execution sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned provider-contact execution gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot satisfy actual Phase 18 authorization or Phase 19 preflight, assign or verify a person, approve a message or channel, identify a recipient, open a contact window, contact Duffel, create a receipt, admit or rely on a response, recommend or select a supplier, or authorize any external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {providerContactExecutionControl.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 19 · Duffel contact preflight design only</p>
        <h2 className="mt-2 text-2xl font-bold">Provider-contact preflight reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Actual provider-contact preflight remains unsatisfied.</strong> Phase 19 software was accepted in isolated Preview, but no actual Phase 18 authorization, Phase 19 preflight receipt, sender, approver, message, recipient role, channel, contact window, or action-time start decision exists. Phase 20 does not create, satisfy, replace, or bypass Phase 18 or Phase 19 authority.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 19 · Duffel contact preflight design only</p>
      <h1 className="mt-2 text-3xl font-bold">Duffel provider-contact preflight plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the final verification sequence for a possible future Duffel diligence contact: the actual Phase 18 authority reference, provider and purpose scope, accountable sender and independent approvers, immutable exact message and disclosures, official recipient role and channel authenticity, data minimization, privacy, security, recordkeeping, contact window, expiry, revocation, stops, incident handling, no retry, response disposition, closeout, and no-downstream-release controls. Phase 18 software was accepted in isolated Preview, but no actual Phase 18 authorization exists. This page cannot satisfy authorization, identify or contact a recipient, create or send a message, open a window, receive evidence, accept terms, recommend or select a supplier, create an account, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Duffel provider-contact preflight is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">Phase 18 software acceptance is recorded, but no actual Phase 18 authorization, immutable authority reference, bound purpose, sender, approver, message, disclosure packet, recipient role, verified channel, preflight decision, contact window, attempt, receipt, response, intake, case, recommendation, selection, contract, account, credential, traffic, ticketing, or payment exists. Completing every Phase 19 design gate cannot open preflight or authorize contact.</p>
          <div className="mt-6 text-4xl font-bold">{providerContactPreflight.completedCount}/{providerContactPreflight.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 19 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providerContactPreflightLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" || status === "Duffel" || status === "Sabre" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preflight verification blueprint only</p><h2 className="mt-2 text-2xl font-bold">Seven provider-contact preflight controls</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static controls define what a future independent preflight would have to verify immediately before a one-time contact decision. They do not create authorization, an identity, a message, a recipient, a channel, a window, a receipt, a response, evidence, commitment, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightProviderContactPreflightControls.map((control) => (
            <article key={control.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{control.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{control.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{control.preflightRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {control.nonPreflightBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Any missing, stale, changed, sensitive, or unverifiable item stops preflight</p><h2 className="mt-2 text-2xl font-bold">Five immediate-stop preflight safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep implied authority, scope or message drift, identity or channel mismatch, conflicts, sensitive content, attachments, credentials, commitments, expiry, retries, incidents, responses, and downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightProviderContactPreflightSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 19 provider-contact preflight sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned provider-contact preflight gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot satisfy actual Phase 18 authorization, assign or verify a person, approve a message or channel, identify a recipient, open a contact window, contact Duffel, admit a response, recommend or select a supplier, or authorize any external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {providerContactPreflight.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 18 · Duffel contact-authorization design only</p>
        <h2 className="mt-2 text-2xl font-bold">Provider-contact authorization reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Actual provider-contact authorization remains unsatisfied.</strong> Phase 18 software was accepted in isolated Preview, but no actual authorization, sender, approver, message, recipient, channel, contact window, or action-time decision exists. Phase 19 does not create, satisfy, replace, or bypass Phase 18 authority.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 18 · Duffel contact-authorization design only</p>
      <h1 className="mt-2 text-3xl font-bold">Duffel provider-contact authorization plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the narrow purpose, accountable sender, independent approvals, immutable message, truthful disclosures, official channel, recipient-role validation, data-minimization, one-contact limit, expiry, revocation, stop, incident, receipt, closeout, and no-commitment controls that would be required before a future Duffel diligence contact could be considered. The recorded Duffel-primary and Sabre-secondary preference is documentation only. This page cannot identify or contact a recipient, draft or send a message, submit a form, place a call, create an account or case, receive evidence, accept terms, recommend or select a supplier, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Duffel provider contact is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">The staged provider-path preference is recorded, but no contact purpose, sender, approver, message, disclosure packet, recipient, channel, action-time decision, contact window, contact attempt, receipt, response, evidence intake, evaluation case, recommendation, selection, contract, account, credential, traffic, ticketing, or payment exists. Completing every Phase 18 design gate cannot authorize or imply contact.</p>
          <div className="mt-6 text-4xl font-bold">{providerContactAuthorization.completedCount}/{providerContactAuthorization.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 18 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providerContactAuthorizationLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Recorded" || status === "Duffel" || status === "Sabre" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authorization packet blueprint only</p><h2 className="mt-2 text-2xl font-bold">Six provider-contact authorization artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six static artifacts define what future accountable approval would need to bind. They do not create an owner, authority, recipient, address, message, disclosure, channel, window, send attempt, receipt, response, evidence, commitment, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightProviderContactAuthorizationArtifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{artifact.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{artifact.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{artifact.authorizationRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {artifact.nonContactBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Any drift, ambiguity, sensitive data, or missing authority stops contact</p><h2 className="mt-2 text-2xl font-bold">Five immediate-stop contact safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep implied authority, recipient or purpose drift, unapproved messages, sensitive data, impersonation, retries, commitments, evidence intake, accounts, credentials, and downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightProviderContactAuthorizationSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 18 provider-contact authorization sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned provider-contact authorization gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot assign a sender, approve a message or channel, identify a recipient, open a contact window, contact Duffel, admit a response, recommend or select a supplier, or authorize any external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {providerContactAuthorization.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 17 · Evidence-review execution-control design only</p>
        <h2 className="mt-2 text-2xl font-bold">Evidence-review execution-control reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Supplier-evidence review remains closed.</strong> Phase 17 software was accepted in isolated Preview, but no actual provider contact, response, evidence intake, Phase 15 authorization, Phase 16 preflight receipt, or Phase 17 review-opening decision exists. Phase 18 does not satisfy or bypass those controls.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 17 · Evidence-review execution-control design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight supplier-evidence review execution-control plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the authorization, preflight, fixed-inventory, lineage, hash, rubric, role, access, one-criterion-at-a-time, observation, calculation, variance, dissent, finding, stop, work-product, expiry, closeout, and no-downstream-authority controls that a future supplier-evidence review would require. Phase 16 software was accepted in isolated Preview, but no actual Phase 15 authorization, Phase 16 preflight receipt, or action-time start decision exists. This page cannot contact a supplier, reopen intake, receive, restore, inspect, hash, admit, or review evidence, approve or run a rubric, assign reviewers, grant access, open a review window, release a criterion, calculate a score, recommend or shortlist a supplier, accept a contract or credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Supplier-evidence review execution is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No separately approved actual Phase 15 authorization or Phase 16 preflight receipt exists. No action-time decision, scope binding, review window, supplier contact, candidate, case, channel, evidence, inventory, inventory hash, lineage, admissibility review, rubric, version or freeze, reviewer, observer, conflict review, access, session, released criterion, reviewed evidence, observation, calculation, work product, variance review, dissent, exception, finding, stop record, closeout, score, scorecard, recommendation, shortlist, commercial diligence, contract, selection, credential, traffic, ticketing, or payment exists. Completing every design gate cannot open or imply evidence review.</p>
          <div className="mt-6 text-4xl font-bold">{reviewExecutionControl.completedCount}/{reviewExecutionControl.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 17 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {reviewExecutionLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Review execution blueprint only</p><h2 className="mt-2 text-2xl font-bold">Controlled evidence-review stages</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static stages define future authorization and preflight binding, fixed inventory and rubric release, independent roles and access, one-criterion-at-a-time review, variance and stop records, sanitized work product, expiry, and closeout. They create no prerequisite, identity, evidence, hash, assignment, access, session, calculation, score, finding, recommendation, approval, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationReviewExecutionStages.map((stage) => (
            <article key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{stage.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{stage.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{stage.executionRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {stage.nonExecutionBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Any drift, conflict, contamination, or missing authority stops review</p><h2 className="mt-2 text-2xl font-bold">Immediate-stop execution safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep implicit opening, inventory or rubric drift, conflicted or overprivileged access, contaminated evidence, uncontrolled work product, suppressed dissent, incomplete closeout, and every downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationReviewExecutionSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 17 evidence-review execution-control sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned evidence-review execution-control gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot create Phase 15 authorization, approve Phase 16 preflight, open a review window, admit or review evidence, release a criterion, assign a reviewer, grant access, calculate a score, recommend or shortlist a supplier, select a supplier, or authorize an external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {reviewExecutionControl.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 16 · Evidence-review preflight design only</p>
        <h2 className="mt-2 text-2xl font-bold">Evidence-review preflight design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Supplier-evidence review preflight is blocked.</strong> Phase 16 software is repository-verified, Git-published, deployed, and accepted in isolated Preview. That evidence confirms only the protected software surface; it does not create the separately accountable actual Phase 15 authorization or Phase 16 preflight receipt that Phase 17 requires.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 16 · Evidence-review preflight design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight supplier-evidence review preflight plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the authorization-reference, fixed-inventory, lineage, hash, rubric-freeze, reviewer-role, conflict, access, privacy, security, retention, work-product, variance, dissent, exception, stop, expiry, closeout, and no-release checks that must pass immediately before a future supplier-evidence review could be considered. Phase 15 software was accepted in isolated Preview, but no actual Phase 15 authorization exists. This page cannot contact a supplier, reopen intake, receive, restore, inspect, hash, or admit evidence, approve or change a rubric, assign reviewers, grant access, open review, calculate scores, recommend or shortlist a supplier, accept a contract or credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Supplier-evidence review preflight is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No separately approved actual Phase 15 authorization exists. No authorization reference, action-time decision, review window, supplier contact, candidate, case, channel, evidence, inventory, inventory hash, lineage, admissibility review, rubric, rubric version or freeze, reviewer, observer, conflict review, access, privacy or security review, retention, deletion, work-product plan, variance review, dissent, exception, stop plan, closeout plan, score, scorecard, finding, recommendation, shortlist, commercial diligence, contract, selection, credential, traffic, ticketing, or payment exists. Completing every design gate cannot open or imply evidence review.</p>
          <div className="mt-6 text-4xl font-bold">{reviewPreflight.completedCount}/{reviewPreflight.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 16 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {reviewPreflightLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Review-preflight packet blueprint only</p><h2 className="mt-2 text-2xl font-bold">Evidence-review preflight controls</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static controls define the future authorization reference, fixed inventory and lineage recheck, frozen rubric, independent roles and access, privacy and work-product plan, variance and stop plan, and expiring no-release boundary. They create no prerequisite, identity, evidence, hash, assignment, access, rubric, score, finding, recommendation, approval, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationReviewPreflightControls.map((control) => (
            <article key={control.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{control.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{control.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{control.preflightRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {control.nonOpeningBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Any drift or missing prerequisite stops review</p><h2 className="mt-2 text-2xl font-bold">Immediate-stop review safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep missing authority, inventory or rubric drift, new intake, conflicted or overprivileged access, suppressed dissent, incomplete closeout, and every downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationReviewPreflightSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 16 evidence-review preflight sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned evidence-review preflight gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot create Phase 15 authorization, admit or review evidence, approve or change a rubric, assign a reviewer, grant access, calculate a score, recommend or shortlist a supplier, select a supplier, or authorize an external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {reviewPreflight.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 15 · Evidence-review authorization design only</p>
        <h2 className="mt-2 text-2xl font-bold">Evidence-review authorization design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Supplier-evidence review authorization is blocked.</strong> Phase 15 software is repository-verified, Git-published, deployed, and accepted in isolated Preview. That evidence confirms only the protected software surface; it does not create the separately accountable actual Phase 15 authorization that Phase 16 requires.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 15 · Evidence-review authorization design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight supplier-evidence review authorization plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the closeout prerequisite, fixed evidence inventory, source lineage, admissibility, objective rubric, version freeze, independent review, conflicts, variance, dissent, exceptions, audit, reproducibility, expiry, revocation, and no-selection controls that a future supplier-evidence review authorization would require. Phase 14 software was accepted in isolated Preview, but no actual Phase 14 intake closeout exists. This page cannot contact a supplier, reopen intake, receive or restore evidence, admit material, open review, assign reviewers, calculate scores, recommend or shortlist a supplier, accept a contract or credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Supplier-evidence review authorization is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No separately approved actual Phase 14 closeout exists. No closeout reference, action-time decision, review window, supplier contact, candidate, case, channel, evidence, evidence inventory, lineage, admissibility review, rubric, version, reviewer, observer, conflict review, access, score, scorecard, variance review, dissent, exception, finding, recommendation, shortlist, commercial diligence, contract, selection, credential, traffic, ticketing, or payment exists. Completing every design gate cannot open or imply evidence review.</p>
          <div className="mt-6 text-4xl font-bold">{reviewAuthorization.completedCount}/{reviewAuthorization.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 15 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {reviewAuthorizationLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Review-authorization packet blueprint only</p><h2 className="mt-2 text-2xl font-bold">Evidence-review authorization artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static artifacts define the future closeout reference, admissible evidence lineage, objective rubric, independent review, variance and dissent handling, recommendation separation, and expiring no-selection authority. They create no prerequisite, identity, evidence, assignment, rubric, score, finding, recommendation, approval, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationReviewAuthorizationArtifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{artifact.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{artifact.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{artifact.authorizationRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {artifact.nonReviewBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">No implied evidence use, scoring, or release</p><h2 className="mt-2 text-2xl font-bold">Review-integrity safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep missing closeout, new or inadmissible evidence, rubric drift, conflicts, dissent, exceptions, recommendation, selection, and every downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationReviewAuthorizationSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 15 evidence-review authorization sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned evidence-review authorization gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot create Phase 14 closeout, admit or review evidence, approve or change a rubric, assign a reviewer, calculate a score, create a recommendation or shortlist, select a supplier, or authorize an external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {reviewAuthorization.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 14 · Evaluation-intake closeout design only</p>
        <h2 className="mt-2 text-2xl font-bold">Evaluation-intake closeout design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Evaluation-intake closeout is blocked.</strong> Phase 14 software is repository-verified, Git-published, deployed, and accepted in isolated Preview. That evidence confirms only the protected software surface; it does not create the separately accountable actual Phase 14 closeout that Phase 15 requires.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 14 · Evaluation-intake closeout design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight supplier-evaluation intake closeout plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the prerequisite references, scope and receipt reconciliation, evidence sanitation, retention, deletion, incident and quarantine disposition, independent dissent, findings ownership, expiry, teardown, no-restart, and separate closeout-decision controls that a future completed supplier-evaluation intake would require. Phase 13 software was accepted in isolated Preview, but no actual Phase 11 authorization, Phase 12 preflight receipt, or Phase 13 execution record exists. This page cannot contact a supplier, open or close intake, receive or inspect evidence, remove access, delete material, resolve an incident or finding, score or select a supplier, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Evaluation-intake closeout is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No separately approved Phase 11 authorization, Phase 12 preflight receipt, or Phase 13 execution record exists. No reconciliation, intake window, supplier contact, candidate, case, channel, evidence, inventory, sanitation, quarantine, incident, stop record, retention confirmation, deletion confirmation, access removal, role assignment, conflict review, dissent, exception, finding, teardown, expiry, closeout decision, score, recommendation, shortlist, contract, selection, credential, traffic, ticketing, or payment exists. Completing every design gate cannot close or imply an intake.</p>
          <div className="mt-6 text-4xl font-bold">{intakeCloseout.completedCount}/{intakeCloseout.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 14 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {intakeCloseoutLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Closeout packet blueprint only</p><h2 className="mt-2 text-2xl font-bold">Intake closeout evidence artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static artifacts define future execution-record reference, intake reconciliation, evidence sanitation and deletion, incident and quarantine disposition, independent dissent, findings ownership, and expiry-to-closeout proof. They create no prerequisite, identity, contact, channel, evidence, assignment, finding, deletion, teardown, decision, receipt, approval, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationIntakeCloseoutArtifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{artifact.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{artifact.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{artifact.closeoutRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {artifact.nonRecordBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">No implied intake, teardown, approval, or release</p><h2 className="mt-2 text-2xl font-bold">Findings-disposition safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep missing execution evidence, unreconciled data, incidents, findings, dissent, incomplete deletion or teardown, restart, scoring, selection, and every downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationIntakeCloseoutSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 14 intake-closeout sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned intake-closeout gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot create authorization, preflight, or execution evidence, reconcile an intake, delete material, resolve an incident or finding, complete teardown, create a closeout receipt, score or select a supplier, or authorize an external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {intakeCloseout.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 13 · Evaluation-intake execution-control design only</p>
        <h2 className="mt-2 text-2xl font-bold">Evaluation-intake execution-control design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Evaluation-intake execution control is blocked.</strong> Phase 13 software is repository-verified, Git-published, deployed, and accepted in isolated Preview. That evidence confirms only the protected software surface; it does not create the separately accountable Phase 11 authorization, Phase 12 preflight receipt, or Phase 13 execution record that Phase 14 requires.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 13 · Evaluation-intake execution-control design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight supplier-evaluation intake execution-control plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the dual-prerequisite, one-time window, contact handoff, isolated channel, evidence receipt, sanitation, quarantine, independent observation, immediate-stop, expiry, teardown, and closeout controls that a future supplier-evaluation intake would require at action time. Phase 12 software was accepted in isolated Preview, but no actual Phase 11 authorization or Phase 12 preflight receipt exists. This page cannot contact a supplier, open intake, create a candidate or case, create a submission channel, receive or inspect evidence, assign a reviewer, score or select a supplier, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Evaluation-intake execution control is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No separately approved Phase 11 authorization or Phase 12 preflight receipt exists. No action-time decision, scope binding, intake window, contact handoff, submission channel, isolation proof, evidence taxonomy, role assignment, conflict review, supplier contact, candidate, case, evidence, sanitation, quarantine, incident, stop record, teardown, closeout, score, recommendation, shortlist, contract, selection, credential, traffic, ticketing, or payment exists. Completing every design gate cannot start or imply intake.</p>
          <div className="mt-6 text-4xl font-bold">{intakeExecutionControl.completedCount}/{intakeExecutionControl.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 13 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {intakeExecutionLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Execution packet blueprint only</p><h2 className="mt-2 text-2xl font-bold">Intake execution-control artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static controls define the future preflight receipt, one-time intake window, approved contact handoff, isolated submission channel, evidence sanitation and quarantine, independent observation, and expiry-to-closeout handoff. They create no prerequisite, identity, contact, channel, evidence, assignment, execution, storage path, decision, approval, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationIntakeExecutionControls.map((control) => (
            <article key={control.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{control.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{control.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{control.executionRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {control.nonExecutionBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">No implicit start, receipt, use, or release</p><h2 className="mt-2 text-2xl font-bold">Immediate-stop execution safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep missing prerequisites, widened scope, supplier or channel exposure, prohibited data, role conflict, dissent, incomplete teardown, and every downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationIntakeExecutionSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 13 intake-execution sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned intake-execution gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot create Phase 11 authorization or a Phase 12 receipt, open an intake window, contact a supplier, create a channel, receive evidence, assign a reviewer, score or select a supplier, or authorize an external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {intakeExecutionControl.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 12 · Evaluation-intake preflight design only</p>
        <h2 className="mt-2 text-2xl font-bold">Evaluation-intake preflight design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Evaluation-intake preflight is blocked.</strong> Phase 12 software is repository-verified, Git-published, deployed, and accepted in isolated Preview. That evidence confirms only the protected software surface; it does not create the separately accountable Phase 11 authorization or Phase 12 preflight receipt that Phase 13 requires.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 12 · Evaluation-intake preflight design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight supplier-evaluation intake preflight plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the authorization-reference, candidate-neutrality, contact, identity, isolated-channel, evidence-taxonomy, independent-role, stop, revocation, expiry, and closeout checks that a future supplier-evaluation intake preflight would require. Phase 11 software was accepted in isolated Preview, but no actual intake-opening authorization exists. This page cannot contact a supplier, open intake, create a candidate or case, create a submission channel, receive evidence, assign a reviewer, score or select a supplier, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Evaluation-intake preflight is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No separately approved Phase 11 intake-opening authorization or authorization reference exists. No scope binding, candidate-neutrality check, contact plan, submission channel, isolation proof, evidence taxonomy, role assignment, conflict review, stop plan, closeout plan, intake window, supplier contact, candidate, case, evidence, score, recommendation, shortlist, contract, selection, credential, traffic, ticketing, or payment exists. Completing every design gate cannot open preflight or intake.</p>
          <div className="mt-6 text-4xl font-bold">{intakePreflight.completedCount}/{intakePreflight.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 12 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {intakePreflightLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className={`mt-1 block text-sm font-medium ${status === "Accepted in Preview" ? "text-emerald-700" : "text-rose-700"}`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preflight packet blueprint only</p><h2 className="mt-2 text-2xl font-bold">Intake preflight control artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static controls define the future authorization reference, candidate-neutral scope recheck, contact and identity boundary, submission-channel isolation proof, evidence taxonomy, independent role check-in, and stop-to-closeout plan. They create no authorization, identity, contact, channel, evidence, assignment, decision, approval, storage path, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationIntakePreflightControls.map((control) => (
            <article key={control.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{control.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{control.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{control.preflightRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {control.nonOpeningBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">No inferred authority, contact, channel, or release</p><h2 className="mt-2 text-2xl font-bold">Immediate-stop intake safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep missing authority, supplier identity and contact, channel or data contamination, role conflicts and dissent, incomplete closeout, and every downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationIntakePreflightSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 12 intake-preflight sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned intake-preflight gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot create Phase 11 authority, open preflight or intake, contact a supplier, create a candidate or case, receive evidence, assign a reviewer, score or select a supplier, or authorize an external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {intakePreflight.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 11 · Evaluation-intake authorization design only</p>
        <h2 className="mt-2 text-2xl font-bold">Evaluation-intake authorization design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Evaluation-intake authorization is blocked.</strong> Phase 11 software is repository-verified, Git-published, deployed, and accepted in isolated Preview. That evidence confirms only the protected software surface; it does not create the separately accountable intake-opening authorization that Phase 12 requires.</p>
      </section>

      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">Flights · Phase 11 · Evaluation-intake authorization design only</p>
      <h1 className="mt-2 text-3xl font-bold">Flight supplier-evaluation intake authorization plan</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Define the prerequisite, purpose, candidate-neutral entry, evidence-channel, independent-review, expiry, revocation, and no-downstream-authority controls that a future supplier-evaluation intake-opening decision would require. Phase 10 authenticated Preview acceptance and its actual closeout prerequisite remain incomplete. This page cannot contact a supplier, open intake, create a candidate or case, receive evidence, assign a reviewer, score or select a supplier, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Evaluation-intake authorization is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No separately approved Phase 10 closeout exists and Phase 10 authenticated Preview acceptance remains pending. No intake decision, window, supplier contact, candidate, evaluation case, submission channel, evidence, reviewer, observer, conflict review, score, recommendation, shortlist, contract, selection, credential, traffic, ticketing, or payment exists. Completing every design gate cannot open intake or create downstream authority.</p>
          <div className="mt-6 text-4xl font-bold">{intakeAuthorization.completedCount}/{intakeAuthorization.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 11 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {intakeAuthorizationLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className="mt-1 block text-sm font-medium text-rose-700">{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authorization packet blueprint only</p><h2 className="mt-2 text-2xl font-bold">Intake authorization artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six static artifacts define the future closeout prerequisite, evaluation charter, candidate-neutral entry rules, evidence channel, independent review, and expiring no-release authority. They create no closeout, contact, candidate, case, channel, evidence, assignment, decision, approval, storage path, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationIntakeAuthorizationArtifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{artifact.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{artifact.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{artifact.authorizationRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {artifact.nonOpeningBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">No inferred intake or authority</p><h2 className="mt-2 text-2xl font-bold">Intake-opening safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep implied intake, supplier contact, candidate bias, unapproved data channels, scoring, selection, implementation, and every external release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationIntakeAuthorizationSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 11 intake-authorization sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned intake-authorization gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot satisfy Phase 10 closeout, open intake, contact a supplier, create a candidate or case, receive evidence, assign a reviewer, score or select a supplier, or authorize an external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {intakeAuthorization.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 10 · Rehearsal closeout design only</p>
        <h2 className="mt-2 text-2xl font-bold">Synthetic rehearsal closeout design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Rehearsal closeout is blocked.</strong> Phase 10 software is repository-verified, Git-published, and deployed to isolated Preview, while authenticated browser acceptance is still pending. More importantly, no separately authorized rehearsal ran, so no actual closeout prerequisite exists. Phase 10 remains a static reference and cannot open supplier evaluation intake.</p>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6" /><strong>Rehearsal closeout is blocked</strong></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">No separately approved execution record exists and the rehearsal remains unrun. No window, scope binding, fixture, participant, released scenario, result, observation, receipt, finding, teardown, deletion confirmation, closeout, candidate, or supplier evidence exists. Completing this design cannot imply execution, erase or resolve evidence, open intake, accept credentials, enable traffic, issue tickets, collect payment, or change Production.</p>
          <div className="mt-6 text-4xl font-bold">{closeout.completedCount}/{closeout.totalCount}</div>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">Phase 10 gates recorded complete</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {closeoutLocks.map(([label, status]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <CircleSlash2 className="h-5 w-5 text-rose-600" />
              <strong className="mt-4 block">{label}</strong>
              <span className="mt-1 block text-sm font-medium text-rose-700">{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Closeout packet blueprint only</p><h2 className="mt-2 text-2xl font-bold">Closeout evidence artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six static artifacts define future scenario disposition, stop evidence, sanitized observations, fixture destruction, findings ownership, authorization expiration, and closeout proof. They create no execution record, receipt, finding, deletion, approval, storage path, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalCloseoutArtifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{artifact.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{artifact.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{artifact.closeoutRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {artifact.nonRecordBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">No inferred completion or release</p><h2 className="mt-2 text-2xl font-bold">Findings-disposition safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep implied execution, incomplete teardown, unresolved findings, dissent, conflicts, exceptions, restart, supplier evaluation, and every external release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalCloseoutSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 10 closeout-control sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned closeout-control gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot imply execution, start teardown, confirm deletion, create or resolve a finding, create a receipt, approve closeout, open named supplier evaluation, or authorize an external capability.</p></div>
        <div className="divide-y divide-slate-100">
          {closeout.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 9 · Rehearsal execution-control design only</p>
        <h2 className="mt-2 text-2xl font-bold">Rehearsal execution-control design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Rehearsal execution control is blocked.</strong> Phase 9 is a static reference for entry, one-scenario-at-a-time release, observer, immediate-stop, sanitized observation, teardown, and closeout controls. It cannot prove that a rehearsal ran, create closeout evidence, resolve a finding, or authorize downstream activity.</p>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Runbook blueprint only</p><h2 className="mt-2 text-2xl font-bold">Controlled rehearsal stages</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six static stages define future entry, scenario release, observation, stop, evidence, teardown, and closeout controls. They create no record, authorization, preflight approval, fixture, assignment, execution path, observation, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalExecutionStages.map((stage) => (
            <article key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{stage.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{stage.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{stage.controlRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {stage.nonExecutionBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pause before every transition</p><h2 className="mt-2 text-2xl font-bold">Pause-and-abort safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep start authority, fictional scenario sequencing, observer veto, evidence quarantine, abort handling, restart, and every downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalExecutionSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 9 execution-control reference</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned execution-control gates</h2><p className="mt-2 text-sm text-slate-600">Every gate remains incomplete. A Phase 10 design cannot satisfy Phase 9, open an execution window, create a fixture, assign roles, release a scenario, run a rehearsal, record an observation, or authorize named supplier evaluation.</p></div>
        <div className="divide-y divide-slate-100">
          {executionControl.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 8 · Rehearsal preflight design only</p>
        <h2 className="mt-2 text-2xl font-bold">Rehearsal preflight design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Rehearsal preflight is blocked.</strong> Phase 8 remains separately controlled and unsatisfied and is a static reference for isolation, fictional-fixture, role, scenario, evidence, stop, and teardown requirements. It cannot satisfy either prerequisite, open an execution window, create a fixture, assign a participant, or run a rehearsal.</p>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preflight blueprint only</p><h2 className="mt-2 text-2xl font-bold">Preflight control artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven static controls define the future authorization scope, fictional fixture, isolation, roles, scenario checks, evidence, and teardown proof. They create no record, fixture, assignment, authorization, execution path, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalPreflightControls.map((control) => (
            <article key={control.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{control.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{control.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{control.readinessRequirement}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {control.nonExecutionBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Stop before any action</p><h2 className="mt-2 text-2xl font-bold">Immediate-stop safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep authorization prerequisites, real-data contamination, external connectivity, role conflicts, evidence handling, teardown, and downstream release fail closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalPreflightSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 8 preflight sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned preflight-readiness gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed design cannot satisfy the Phase 7 authorization prerequisite, create a fixture, assign roles, start preflight, run a rehearsal, record a result, or authorize a named supplier evaluation.</p></div>
        <div className="divide-y divide-slate-100">
          {preflight.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 7 · Rehearsal authorization readiness only</p>
        <h2 className="mt-2 text-2xl font-bold">Rehearsal authorization design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>No rehearsal authorization is recorded.</strong> Phase 7 remains a static reference for the approval packet and fail-closed decision boundary. It cannot satisfy the Phase 8 prerequisite, create a fixture, assign a participant, or run a rehearsal.</p>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Decision packet design only</p><h2 className="mt-2 text-2xl font-bold">Authorization packet artifacts</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six artifacts define what accountable owners would need to approve before a one-time fictional rehearsal decision could be considered. They are static requirements and create no record, assignment, fixture, authorization, or external action.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalAuthorizationArtifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{artifact.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{artifact.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{artifact.requiredDecision}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {artifact.activationBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authorization cannot self-activate</p><h2 className="mt-2 text-2xl font-bold">Fail-closed authorization safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep fictional data, external connectivity, participant independence, one-time scope, findings, and downstream release decisions separately controlled.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightRehearsalAuthorizationSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.safeguard}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Fail closed:</strong> {safeguard.failClosedBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 7 decision sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned authorization-readiness gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed packet cannot record authorization, satisfy the Phase 8 prerequisite, create a fixture, assign roles, run a rehearsal, record a result, or authorize a named supplier evaluation.</p></div>
        <div className="divide-y divide-slate-100">
          {authorization.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 6 · Synthetic rehearsal design only</p>
        <h2 className="mt-2 text-2xl font-bold">Synthetic rehearsal design reference</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Synthetic rehearsal has not run.</strong> Phase 6 remains a static reference for fictional scenarios and sanitized receipt safeguards. It cannot create a fixture, assign a reviewer, record a result, or authorize Phase 7.</p>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fictional tabletop only</p><h2 className="mt-2 text-2xl font-bold">Synthetic evaluation scenarios</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six scenarios define the fail-closed control responses a future internal rehearsal must prove. They contain no supplier identity, supplier evidence, passenger data, credentials, endpoints, schedules, fares, availability, or external communication.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationRehearsalScenarios.map((scenario) => (
            <article key={scenario.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{scenario.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{scenario.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{scenario.rehearsalObjective}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {scenario.safetyBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Future sanitized evidence design</p><h2 className="mt-2 text-2xl font-bold">Rehearsal receipt safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five receipt designs keep fictional fixtures, role separation, scenario outcomes, exceptions, dissent, and release boundaries distinct. This phase creates no receipt or storage path.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationRehearsalReceipts.map((receipt) => (
            <article key={receipt.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{receipt.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{receipt.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{receipt.receiptRule}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {receipt.activationBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 6 release sequence</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned rehearsal-design gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed plan cannot create a fictional fixture, assign reviewers, run a rehearsal, record a result, or authorize a named supplier evaluation.</p></div>
        <div className="divide-y divide-slate-100">
          {rehearsal.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flights · Phase 5 · Evaluation governance only</p><h2 className="mt-2 text-2xl font-bold">Evidence admissibility controls</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six controls define how future evidence would be attributed, compared, protected, independently reviewed, and escalated. They do not open an intake channel or receive any supplier material.</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600"><strong>Evaluation intake remains closed.</strong> Phase 5 governance remains a reference only and cannot create an evaluation case or accept supplier evidence.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationControls.map((control) => (
            <article key={control.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{control.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{control.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{control.requiredRule}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {control.safetyBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Decision separation</p><h2 className="mt-2 text-2xl font-bold">Decision-record safeguards</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Five safeguards keep admissibility, scoring, conflicts, exceptions, recommendations, shortlist approval, contracting, supplier selection, and release as separate future records.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightEvaluationDecisionSafeguards.map((safeguard) => (
            <article key={safeguard.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{safeguard.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{safeguard.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{safeguard.recordRule}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {safeguard.activationBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 5 evaluation governance reference</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned evaluation-governance gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed governance record cannot open evidence intake, create an evaluation case, or authorize a named supplier review.</p></div>
        <div className="divide-y divide-slate-100">
          {governance.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 4 diligence reference</p><h2 className="mt-2 text-2xl font-bold">Candidate evidence packet</h2></div><ClipboardCheck className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Seven workstreams define what attributable, current evidence would be required from a future candidate. This page stores no supplier identity, response, document, score, quote, or representation.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightSupplierEvidenceWorkstreams.map((workstream) => (
            <article key={workstream.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{workstream.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{workstream.owner}</p>
              <ul className="mt-4 grid gap-3 text-sm text-slate-600">
                {workstream.requiredEvidence.map((item) => <li key={item} className="flex gap-3"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{item}</li>)}
              </ul>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {workstream.safetyBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Negotiation boundary</p><h2 className="mt-2 text-2xl font-bold">Contract review matrix</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Six separately owned lanes define future review scope. They do not receive, negotiate, approve, sign, or activate an agreement.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {flightSupplierContractLanes.map((lane) => (
            <article key={lane.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{lane.label}</h3>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{lane.owner}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{lane.reviewScope}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {lane.activationBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 4 release sequence</p><h2 className="mt-2 text-2xl font-bold">Nine separately owned diligence gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Even a completed diligence record cannot create a candidate, accept a contract, select a supplier, or authorize implementation.</p></div>
        <div className="divide-y divide-slate-100">
          {diligence.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 3 planning reference</p><h2 className="mt-2 text-2xl font-bold">One-hundred-point selection rubric</h2></div><Scale className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Weights define how comparable evidence should be reviewed later. This page stores no candidate, score, evidence, shortlist, or selection.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flightSupplierSelectionCriteria.map((criterion) => (
            <article key={criterion.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4"><h3 className="font-bold">{criterion.label}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{criterion.weight}%</span></div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{criterion.owner}</p>
              <ul className="mt-4 grid gap-3 text-sm text-slate-600">
                {criterion.questions.map((question) => <li key={question} className="flex gap-3"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{question}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adapter design only</p><h2 className="mt-2 text-2xl font-bold">Provider-neutral sandbox contract</h2></div><Network className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These four shapes define a future integration boundary. There is no adapter, endpoint, secret, provider SDK, database state, request, response, or network access in Phase 3.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {flightSandboxAdapterOperations.map((operation) => (
            <article key={operation.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <ClipboardCheck className="h-6 w-6 text-brand-700" />
              <h3 className="mt-4 font-bold">{operation.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{operation.contract}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-rose-700"><strong>Boundary:</strong> {operation.safetyBoundary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 3 release sequence</p><h2 className="mt-2 text-2xl font-bold">Eight separately owned decision gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. A completed planning record still cannot choose a supplier or authorize an adapter build.</p></div>
        <div className="divide-y divide-slate-100">
          {selection.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Supply model</p><h2 className="mt-2 text-2xl font-bold">Paths to evaluate</h2></div><Route className="h-7 w-7 text-slate-400" /></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {flightSupplierPaths.map((path) => (
            <article key={path.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <Plane className="h-6 w-6 text-brand-700" />
              <h3 className="mt-5 text-lg font-bold">{path.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{path.fit}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Diligence:</strong> {path.diligence}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Connector catalog</p><h2 className="mt-2 text-2xl font-bold">GDS and airline adapter surfaces</h2></div><Network className="h-7 w-7 text-slate-400" /></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">The nine requested provider surfaces are catalogued for future diligence. Every entry is dark by default: no credential, endpoint, external request, booking, ticketing, payment, or live-traffic authority is implied.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connectorReadiness.tracks.map((connector) => (
            <article key={connector.connectorId} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{connector.label}</h3><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">Approved candidate · {connector.completedCount}/{connector.totalCount} gates</span></div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{connector.category.replaceAll("_", " ")}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{connector.notes}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Planned scope:</strong> {connector.plannedOperations.join(", ")}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Certification scope</p><h2 className="mt-2 text-2xl font-bold">Required capabilities</h2></div><TicketCheck className="h-7 w-7 text-slate-400" /></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {flightCapabilityGroups.map((group) => (
            <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">{group.label}</h3>
              <ul className="mt-4 grid gap-3 text-sm text-slate-600">
                {group.capabilities.map((capability) => <li key={capability} className="flex gap-3"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{capability}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phase 2 activation reference</p><h2 className="mt-2 text-2xl font-bold">Ten separately owned activation gates</h2><p className="mt-2 text-sm text-slate-600">Every gate starts incomplete. Evidence entry and approval controls are intentionally deferred until a supplier path and storage model receive separate approval.</p></div>
        <div className="divide-y divide-slate-100">
          {readiness.gates.map((gate, index) => (
            <article key={gate.id} className="grid gap-3 p-6 md:grid-cols-[3rem_1fr_11rem] md:items-start">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</span>
              <div><h3 className="font-bold">{gate.label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{gate.detail}</p></div>
              <div className="md:text-right"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{gate.owner}</span><span className="mt-2 block text-sm font-medium text-amber-700">Not recorded</span></div>
            </article>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
