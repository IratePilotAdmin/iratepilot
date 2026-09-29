export const FLIGHT_EVALUATION_INTAKE_PREFLIGHT_MODE = "supplier_evaluation_intake_preflight_design_only" as const;

export type FlightEvaluationIntakePreflightControl = {
  id:
    | "phase_11_authorization_reference"
    | "candidate_neutral_scope_recheck"
    | "contact_and_identity_boundary"
    | "submission_channel_isolation_proof"
    | "evidence_taxonomy_and_prohibited_data_manifest"
    | "independent_role_and_conflict_check_in"
    | "stop_revocation_expiry_and_closeout_plan";
  label: string;
  owner: string;
  preflightRequirement: string;
  nonOpeningBoundary: string;
};

export type FlightEvaluationIntakePreflightSafeguard = {
  id:
    | "authorization_prerequisite_lock"
    | "identity_and_contact_stop"
    | "channel_and_data_contamination_stop"
    | "role_conflict_and_dissent_stop"
    | "evidence_closeout_and_no_release_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightEvaluationIntakePreflightGate = {
  id:
    | "phase_11_authorization_prerequisite_verified"
    | "one_time_scope_and_expiry_bound"
    | "candidate_neutrality_rechecked"
    | "contact_identity_and_message_controls_approved"
    | "submission_channel_isolation_approved"
    | "evidence_taxonomy_and_prohibited_data_approved"
    | "independent_roles_conflicts_and_dissent_approved"
    | "stop_revocation_incident_and_quarantine_approved"
    | "retention_deletion_and_closeout_approved"
    | "intake_opening_remains_separate";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationIntakePreflightControls: readonly FlightEvaluationIntakePreflightControl[] = [
  {
    id: "phase_11_authorization_reference",
    label: "Phase 11 authorization reference",
    owner: "Risk + Release approvers",
    preflightRequirement: "Require a separately created, approved, current, one-time Phase 11 intake-opening authorization reference before any preflight evidence could be considered.",
    nonOpeningBoundary: "Design cannot create, infer, reuse, approve, or satisfy an intake-opening authorization from software completion, Git publication, deployment, page access, or Preview acceptance.",
  },
  {
    id: "candidate_neutral_scope_recheck",
    label: "Candidate-neutral scope recheck",
    owner: "Commercial + Risk",
    preflightRequirement: "Define an action-time recheck of the approved supplier path, objective eligibility, exclusions, permitted evidence, owners, duration, and no-selection boundary without introducing a supplier identity.",
    nonOpeningBoundary: "Design cannot identify, prefer, rank, nominate, record, invite, contact, shortlist, or select a supplier.",
  },
  {
    id: "contact_and_identity_boundary",
    label: "Contact and identity boundary",
    owner: "Legal + Commercial",
    preflightRequirement: "Define the future accountable contact owner, approved message, channel, disclosure, identity-minimization rule, jurisdiction, stop condition, and no-commercial-commitment statement.",
    nonOpeningBoundary: "Design cannot assign a contact owner, approve a message, disclose an identity, send an invitation, schedule a meeting, solicit material, or create a commercial commitment.",
  },
  {
    id: "submission_channel_isolation_proof",
    label: "Submission-channel isolation proof",
    owner: "Security + Privacy",
    preflightRequirement: "Define future evidence for channel allowlisting, isolation, least privilege, sanitation, malware review, access logging, retention, deletion, incident handling, and credential exclusion.",
    nonOpeningBoundary: "Design cannot create or test a form, upload, mailbox, database path, secret store, endpoint, webhook, provider connection, or external network channel.",
  },
  {
    id: "evidence_taxonomy_and_prohibited_data_manifest",
    label: "Evidence taxonomy and prohibited-data manifest",
    owner: "Privacy + Security",
    preflightRequirement: "Define the minimal future evidence classes and explicitly prohibit credentials, passenger data, live content, executable material, unnecessary personal data, and out-of-scope commercial records.",
    nonOpeningBoundary: "Design cannot request, receive, inspect, sanitize, retain, delete, transform, score, or otherwise process supplier evidence or sensitive data.",
  },
  {
    id: "independent_role_and_conflict_check_in",
    label: "Independent-role and conflict check-in",
    owner: "Legal + Risk",
    preflightRequirement: "Define a future action-time confirmation for accountable reviewer, independent observer, recusals, replacements, dissent, exceptions, escalation, and authority separation.",
    nonOpeningBoundary: "Design cannot name or assign a person, attest independence, clear a conflict, waive dissent, approve an exception, review evidence, or authorize intake.",
  },
  {
    id: "stop_revocation_expiry_and_closeout_plan",
    label: "Stop, revocation, expiry, and closeout plan",
    owner: "Security + Release approvers",
    preflightRequirement: "Define future immediate-stop triggers, authorization revocation and expiry, evidence quarantine, incident escalation, retention and deletion confirmation, closeout, no restart, and no downstream release.",
    nonOpeningBoundary: "Design cannot open, stop, revoke, expire, quarantine, delete, close, or restart an intake window and cannot release Sandbox, ticketing, payment, or Production activity.",
  },
];

export const flightEvaluationIntakePreflightSafeguards: readonly FlightEvaluationIntakePreflightSafeguard[] = [
  {
    id: "authorization_prerequisite_lock",
    label: "Authorization-prerequisite lock",
    owner: "Risk + Release approvers",
    safeguard: "Require an actual, separately approved, current Phase 11 authorization reference and a new action-time intake-opening decision; Phase 11 software acceptance never satisfies either requirement.",
    failClosedBoundary: "Missing, inferred, expired, disputed, reused, broadened, or incomplete authority keeps preflight blocked and evaluation intake closed.",
  },
  {
    id: "identity_and_contact_stop",
    label: "Identity and contact stop",
    owner: "Commercial + Legal",
    safeguard: "Keep supplier identity outside this model and require separately approved ownership, message, channel, disclosure, jurisdiction, and stop controls before any future contact.",
    failClosedBoundary: "No identity can be entered and no supplier can be found, contacted, invited, notified, scheduled, solicited, or messaged by this design.",
  },
  {
    id: "channel_and_data_contamination_stop",
    label: "Channel and data-contamination stop",
    owner: "Security + Privacy",
    safeguard: "Require isolation proof, minimal evidence classes, prohibited-data rules, sanitation, malware review, least privilege, logging, retention, deletion, and incident controls before a channel could be considered.",
    failClosedBoundary: "No submission channel, storage path, provider connection, credential, passenger data, live content, supplier material, or external network access exists in this phase.",
  },
  {
    id: "role_conflict_and_dissent_stop",
    label: "Role, conflict, and dissent stop",
    owner: "Legal + Risk",
    safeguard: "Require independent role confirmation, conflict disclosure, recusal, replacement, dissent preservation, exception ownership, and escalation at action time.",
    failClosedBoundary: "An absent owner, observer, disclosure, recusal, replacement, unresolved objection, or exception keeps preflight blocked and cannot become implied approval.",
  },
  {
    id: "evidence_closeout_and_no_release_lock",
    label: "Evidence closeout and no-release lock",
    owner: "Privacy + Release approvers",
    safeguard: "Require stop, revocation, expiry, quarantine, retention, deletion, incident, closeout, no-restart, and explicit no-downstream-authority controls before intake could open.",
    failClosedBoundary: "Preflight completion could not authorize evidence receipt, scoring, recommendation, shortlist, contracting, selection, implementation, credentials, Sandbox traffic, ticketing, payment, or Production traffic.",
  },
];

export const flightEvaluationIntakePreflightGates: readonly FlightEvaluationIntakePreflightGate[] = [
  { id: "phase_11_authorization_prerequisite_verified", label: "Phase 11 authorization prerequisite verified", owner: "Risk + Release approvers", detail: "Verify a separately created, approved, current, one-time Phase 11 authorization reference; software verification and Preview acceptance are evidence about the application, not intake authority." },
  { id: "one_time_scope_and_expiry_bound", label: "One-time scope and expiry bound", owner: "Product + Legal", detail: "Bind the permitted supplier path, evaluation purpose, evidence classes, owners, exclusions, duration, expiry, revocation, and no-selection boundary without widening or reusing authority." },
  { id: "candidate_neutrality_rechecked", label: "Candidate neutrality rechecked", owner: "Commercial + Risk", detail: "Recheck objective eligibility and exclusion criteria before supplier identity, relationship, preference, urgency, proposal, or commercial pressure could enter the evaluation." },
  { id: "contact_identity_and_message_controls_approved", label: "Contact, identity, and message controls approved", owner: "Legal + Commercial", detail: "Approve the future contact owner, message, channel, disclosure, identity-minimization rule, jurisdiction, stop condition, and no-commercial-commitment statement outside this design." },
  { id: "submission_channel_isolation_approved", label: "Submission-channel isolation approved", owner: "Security + Privacy", detail: "Approve action-time evidence that the future allowlisted channel is isolated, least-privilege, logged, sanitized, malware-reviewed, time-limited, and free of credential or live-system access." },
  { id: "evidence_taxonomy_and_prohibited_data_approved", label: "Evidence taxonomy and prohibited data approved", owner: "Privacy + Security", detail: "Approve minimal evidence classes and explicit exclusions for credentials, passenger data, live content, executable material, unnecessary personal data, and out-of-scope records." },
  { id: "independent_roles_conflicts_and_dissent_approved", label: "Independent roles, conflicts, and dissent approved", owner: "Legal + Risk", detail: "Confirm accountable reviewer and observer roles, disclosures, recusals, replacements, dissent preservation, exceptions, escalation, and authority separation without assigning them here." },
  { id: "stop_revocation_incident_and_quarantine_approved", label: "Stop, revocation, incident, and quarantine approved", owner: "Security + Risk", detail: "Approve immediate-stop triggers, authority revocation and expiry, access removal, evidence quarantine, incident escalation, and no-restart requirements before intake could open." },
  { id: "retention_deletion_and_closeout_approved", label: "Retention, deletion, and closeout approved", owner: "Privacy + Release approvers", detail: "Approve retention limits, deletion confirmation, sanitized closeout evidence, findings ownership, dissent disposition, and final no-restart confirmation before an intake window could be considered." },
  { id: "intake_opening_remains_separate", label: "Intake opening remains separate", owner: "Release approvers", detail: "Require a new, one-time, scoped, expiring, revocable action-time decision outside this preflight immediately before intake could open; preflight completion creates no standing or downstream authority." },
];

export type FlightEvaluationIntakePreflightEvidence = Partial<Record<FlightEvaluationIntakePreflightGate["id"], boolean>>;

export function buildFlightEvaluationIntakePreflightDesign(evidence: FlightEvaluationIntakePreflightEvidence = {}) {
  const gates = flightEvaluationIntakePreflightGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_EVALUATION_INTAKE_PREFLIGHT_MODE,
    planState: "design_only" as const,
    preflightState: "blocked" as const,
    phase11AuthorizationPrerequisiteState: "not_satisfied" as const,
    phase11SoftwareAcceptanceState: "accepted_in_preview" as const,
    authorizationReferenceState: "not_recorded" as const,
    scopeBindingState: "not_recorded" as const,
    candidateNeutralityCheckState: "not_started" as const,
    contactPlanState: "not_approved" as const,
    submissionChannelState: "not_created" as const,
    isolationProofState: "not_recorded" as const,
    evidenceTaxonomyState: "not_approved" as const,
    roleAssignmentState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    conflictReviewState: "not_started" as const,
    evaluationIntakeState: "closed" as const,
    supplierContactState: "not_started" as const,
    candidateState: "not_recorded" as const,
    evaluationCaseState: "not_created" as const,
    evidenceCount: 0,
    authorizationWindowState: "not_opened" as const,
    stopPlanState: "not_approved" as const,
    closeoutPlanState: "not_approved" as const,
    scoreState: "not_calculated" as const,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    preflightDesignComplete: completedCount === gates.length,
    realSupplierDataAccepted: false,
    passengerDataAccepted: false,
    credentialsAccepted: false,
    externalNetworkAccess: false,
    externalSideEffects: false,
    sandboxAdapterImplemented: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
