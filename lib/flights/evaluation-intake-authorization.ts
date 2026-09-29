export const FLIGHT_EVALUATION_INTAKE_AUTHORIZATION_MODE = "supplier_evaluation_intake_authorization_design_only" as const;

export type FlightEvaluationIntakeAuthorizationArtifact = {
  id:
    | "closeout_prerequisite_reference"
    | "evaluation_purpose_scope_charter"
    | "candidate_neutral_entry_criteria"
    | "evidence_submission_channel_requirements"
    | "independent_review_conflict_plan"
    | "authorization_expiry_revocation_statement";
  label: string;
  owner: string;
  authorizationRequirement: string;
  nonOpeningBoundary: string;
};

export type FlightEvaluationIntakeAuthorizationSafeguard = {
  id:
    | "no_implied_intake_lock"
    | "no_supplier_contact_lock"
    | "candidate_neutrality_lock"
    | "data_minimization_channel_lock"
    | "no_downstream_decision_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightEvaluationIntakeAuthorizationGate = {
  id:
    | "phase_10_closeout_separately_approved"
    | "evaluation_purpose_and_scope_approved"
    | "supplier_path_and_eligibility_approved"
    | "legal_and_commercial_authority_approved"
    | "evidence_channel_and_taxonomy_approved"
    | "independent_roles_and_conflicts_approved"
    | "privacy_security_and_data_controls_approved"
    | "stop_revocation_and_expiry_controls_approved"
    | "no_downstream_authority_statement_approved"
    | "intake_opening_requires_action_time_decision";
  label: string;
  owner: string;
  detail: string;
};

export const flightEvaluationIntakeAuthorizationArtifacts: readonly FlightEvaluationIntakeAuthorizationArtifact[] = [
  {
    id: "closeout_prerequisite_reference",
    label: "Closeout prerequisite reference",
    owner: "Risk + Release approvers",
    authorizationRequirement: "Require a separately approved Phase 10 closeout record, including teardown, findings, dissent, expiration, and no-restart evidence, before an intake-opening decision could be considered.",
    nonOpeningBoundary: "Design cannot create or approve closeout, satisfy a prerequisite, reopen a rehearsal, contact a supplier, or open evaluation intake.",
  },
  {
    id: "evaluation_purpose_scope_charter",
    label: "Evaluation purpose and scope charter",
    owner: "Product + Executive",
    authorizationRequirement: "Define the permitted evaluation purpose, supplier-path scope, excluded activities, evidence classes, decision owners, time limit, and explicit no-selection boundary.",
    nonOpeningBoundary: "Design cannot authorize a named evaluation, create a candidate, request material, score evidence, or grant commercial or implementation authority.",
  },
  {
    id: "candidate_neutral_entry_criteria",
    label: "Candidate-neutral entry criteria",
    owner: "Commercial + Risk",
    authorizationRequirement: "Define objective, path-neutral eligibility and exclusion criteria before any supplier identity, relationship, proposal, commercial pressure, or preferred outcome could enter review.",
    nonOpeningBoundary: "Design cannot record a supplier identity, nominate a candidate, create a shortlist, rank a provider, or select a supplier.",
  },
  {
    id: "evidence_submission_channel_requirements",
    label: "Evidence-submission channel requirements",
    owner: "Security + Privacy",
    authorizationRequirement: "Define a future approved channel, allowlisted evidence taxonomy, retention window, access boundary, malware review, sanitation rules, and prohibited-data handling before any submission could be accepted.",
    nonOpeningBoundary: "Design cannot create a channel, receive or store a document, accept credentials or passenger data, call an endpoint, or transmit a message.",
  },
  {
    id: "independent_review_conflict_plan",
    label: "Independent review and conflict plan",
    owner: "Legal + Risk",
    authorizationRequirement: "Define accountable reviewer, observer, recusal, dissent, replacement, exception, and escalation requirements without preassigning a person or suppressing an objection.",
    nonOpeningBoundary: "Design cannot assign a reviewer, attest independence, resolve a conflict, waive dissent, approve evidence, or authorize intake.",
  },
  {
    id: "authorization_expiry_revocation_statement",
    label: "Authorization expiry, revocation, and no-release statement",
    owner: "Legal + Release approvers",
    authorizationRequirement: "Define one-time scope, expiry, revocation, immediate-stop, evidence quarantine, closeout, and explicit no-downstream-authority requirements for any future intake-opening decision.",
    nonOpeningBoundary: "Design cannot open or close an authorization window, revoke access, quarantine evidence, create a receipt, or release Sandbox or Production activity.",
  },
];

export const flightEvaluationIntakeAuthorizationSafeguards: readonly FlightEvaluationIntakeAuthorizationSafeguard[] = [
  {
    id: "no_implied_intake_lock",
    label: "No-implied-intake lock",
    owner: "Risk + Release approvers",
    safeguard: "Require a separately approved Phase 10 closeout and a new action-time intake-opening decision; software completion, deployment, page access, or a completed design checklist never opens intake.",
    failClosedBoundary: "Missing, incomplete, expired, disputed, inferred, or reused authority keeps intake, candidate creation, evidence receipt, review, scoring, and every downstream decision blocked.",
  },
  {
    id: "no_supplier_contact_lock",
    label: "No-supplier-contact lock",
    owner: "Commercial + Legal",
    safeguard: "Require approved purpose, contact owner, message, channel, identity boundary, and stop conditions before any named or unnamed supplier outreach could occur.",
    failClosedBoundary: "This design cannot identify, contact, invite, notify, solicit, schedule, message, or receive material from a supplier.",
  },
  {
    id: "candidate_neutrality_lock",
    label: "Candidate-neutrality lock",
    owner: "Risk + Independent reviewer",
    safeguard: "Require objective entry criteria, conflict checks, documented recusals, independent observation, and identical evidence expectations before a candidate could be recorded.",
    failClosedBoundary: "Preference, relationship, urgency, incomplete disclosure, conflict, exception, or unequal treatment blocks candidate entry and cannot be converted into approval.",
  },
  {
    id: "data_minimization_channel_lock",
    label: "Data-minimization and channel lock",
    owner: "Security + Privacy",
    safeguard: "Require an approved evidence taxonomy, allowlisted channel, least privilege, retention and deletion rules, sanitation, malware review, and explicit exclusion of credentials, passenger data, and live content.",
    failClosedBoundary: "No form, upload, mailbox, database path, secret store, endpoint, webhook, or external network channel exists in this phase; no supplier material can be accepted.",
  },
  {
    id: "no_downstream_decision_lock",
    label: "No-downstream-decision lock",
    owner: "Legal + Executive",
    safeguard: "Require every future intake authorization to state that evidence receipt cannot itself score, recommend, shortlist, contract with, select, implement, credential, or activate a supplier.",
    failClosedBoundary: "Intake authority, if later granted, would remain one-time, narrow, revocable, non-transferable, and unable to authorize Sandbox, ticketing, payment, or Production traffic.",
  },
];

export const flightEvaluationIntakeAuthorizationGates: readonly FlightEvaluationIntakeAuthorizationGate[] = [
  { id: "phase_10_closeout_separately_approved", label: "Phase 10 closeout separately approved", owner: "Risk + Release approvers", detail: "Require a separately created and approved closeout record; Phase 10 software, Git publication, Preview deployment, page access, or acceptance cannot substitute for an actual rehearsal closeout." },
  { id: "evaluation_purpose_and_scope_approved", label: "Evaluation purpose and scope approved", owner: "Product + Executive", detail: "Approve the permitted purpose, supplier path, excluded activity, evidence classes, owners, duration, and explicit no-selection boundary before any intake-opening decision." },
  { id: "supplier_path_and_eligibility_approved", label: "Supplier path and eligibility approved", owner: "Commercial + Risk", detail: "Approve objective, candidate-neutral entry and exclusion criteria without naming, preferring, ranking, contacting, inviting, or recording a supplier here." },
  { id: "legal_and_commercial_authority_approved", label: "Legal and commercial authority approved", owner: "Legal + Commercial", detail: "Confirm authority for the narrowly defined evaluation-intake purpose, contact model, disclosure language, confidentiality boundary, and jurisdiction without accepting a proposal or contract." },
  { id: "evidence_channel_and_taxonomy_approved", label: "Evidence channel and taxonomy approved", owner: "Security + Privacy", detail: "Approve a future allowlisted submission channel and minimal evidence taxonomy, access, retention, sanitation, malware, deletion, prohibited-data, and incident controls; this phase creates no channel." },
  { id: "independent_roles_and_conflicts_approved", label: "Independent roles and conflicts approved", owner: "Legal + Risk", detail: "Approve accountable reviewer, observer, recusal, replacement, dissent, escalation, and exception-handling roles without assigning people or resolving conflicts in this design." },
  { id: "privacy_security_and_data_controls_approved", label: "Privacy, security, and data controls approved", owner: "Privacy + Security", detail: "Confirm data minimization, least privilege, logging, retention, deletion, segregation, and prohibited sensitive-data controls before any supplier evidence could be received." },
  { id: "stop_revocation_and_expiry_controls_approved", label: "Stop, revocation, and expiry controls approved", owner: "Security + Risk", detail: "Approve immediate-stop triggers, authority revocation, expiry, evidence quarantine, incident escalation, closeout, and no-restart requirements before an intake window could open." },
  { id: "no_downstream_authority_statement_approved", label: "No-downstream-authority statement approved", owner: "Legal + Executive", detail: "Record that intake cannot itself score, recommend, shortlist, contract with, select, implement, credential, enable traffic for, issue tickets through, or pay a supplier." },
  { id: "intake_opening_requires_action_time_decision", label: "Intake opening requires an action-time decision", owner: "Release approvers", detail: "Require a new, one-time, scoped, expiring, revocable decision outside this design immediately before any intake could open; design completion never creates standing authority." },
];

export type FlightEvaluationIntakeAuthorizationEvidence = Partial<Record<FlightEvaluationIntakeAuthorizationGate["id"], boolean>>;

export function buildFlightEvaluationIntakeAuthorizationDesign(evidence: FlightEvaluationIntakeAuthorizationEvidence = {}) {
  const gates = flightEvaluationIntakeAuthorizationGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_EVALUATION_INTAKE_AUTHORIZATION_MODE,
    planState: "design_only" as const,
    intakeAuthorizationState: "blocked" as const,
    phase10CloseoutPrerequisiteState: "not_satisfied" as const,
    phase10PreviewAcceptanceState: "pending" as const,
    closeoutState: "not_created" as const,
    evaluationIntakeState: "closed" as const,
    supplierContactState: "not_started" as const,
    candidateState: "not_recorded" as const,
    evaluationCaseState: "not_created" as const,
    submissionChannelState: "not_created" as const,
    evidenceCount: 0,
    reviewerState: "not_assigned" as const,
    observerState: "not_assigned" as const,
    conflictReviewState: "not_started" as const,
    authorizationDecisionState: "not_recorded" as const,
    authorizationWindowState: "not_opened" as const,
    revocationState: "not_applicable" as const,
    scoreState: "not_calculated" as const,
    recommendationState: "not_issued" as const,
    shortlistState: "not_created" as const,
    contractState: "not_received" as const,
    selectionState: "not_selected" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    authorizationDesignComplete: completedCount === gates.length,
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
