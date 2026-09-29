export const FLIGHT_PROVIDER_CONTACT_CLOSEOUT_MODE = "duffel_contact_closeout_design_only" as const;

export type FlightProviderContactCloseoutArtifact = {
  id:
    | "phase_20_execution_record_reference"
    | "authority_preflight_execution_and_scope_reconciliation"
    | "message_recipient_channel_attempt_and_delivery_reconciliation"
    | "receipt_response_quarantine_and_incident_disposition"
    | "access_recordkeeping_retention_deletion_and_audit_reconciliation"
    | "roles_stops_dissent_findings_and_ownership_record"
    | "expiry_closeout_no_retry_and_no_downstream_receipt";
  label: string;
  owner: string;
  closeoutRequirement: string;
  nonRecordBoundary: string;
};

export type FlightProviderContactCloseoutSafeguard = {
  id:
    | "no_implied_contact_or_execution_lock"
    | "attempt_receipt_channel_and_delivery_reconciliation_lock"
    | "response_quarantine_incident_and_stop_lock"
    | "access_retention_deletion_expiry_and_audit_lock"
    | "no_reply_intake_recommendation_selection_or_release_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightProviderContactCloseoutGate = {
  id:
    | "phase_18_authorization_phase_19_preflight_and_phase_20_execution_verified"
    | "scope_message_recipient_channel_and_window_reconciled"
    | "attempt_delivery_receipt_and_no_retry_reconciled"
    | "response_quarantine_no_opening_and_no_reply_reconciled"
    | "sensitive_data_attachments_links_incidents_and_stops_resolved"
    | "roles_conflicts_dissent_exceptions_findings_and_audit_reconciled"
    | "access_retention_deletion_and_minimal_record_confirmed"
    | "expiry_closeout_and_no_restart_confirmed"
    | "no_intake_recommendation_selection_contract_account_or_release_confirmed"
    | "closeout_requires_separate_decision";
  label: string;
  owner: string;
  detail: string;
};

export const flightProviderContactCloseoutArtifacts: readonly FlightProviderContactCloseoutArtifact[] = [
  {
    id: "phase_20_execution_record_reference",
    label: "Phase 20 execution-record reference",
    owner: "Risk + Release approvers",
    closeoutRequirement: "Require separately approved, current Phase 18 authorization, Phase 19 preflight, and Phase 20 execution records before a future provider-contact closeout could be considered.",
    nonRecordBoundary: "Design cannot create, approve, infer, reuse, broaden, validate, or satisfy a prerequisite or convert software acceptance into contact or closeout evidence.",
  },
  {
    id: "authority_preflight_execution_and_scope_reconciliation",
    label: "Authority, preflight, execution, and scope reconciliation",
    owner: "Legal + Risk",
    closeoutRequirement: "Define future reconciliation of one Duffel-only purpose, authority reference, preflight receipt, execution record, immutable message, official recipient role, authentic channel, one-attempt limit, fixed window, revocation, stops, and final disposition.",
    nonRecordBoundary: "Design cannot create authority, approve preflight, open or close a window, identify a person, approve a message or channel, contact Duffel, or reconcile an execution record.",
  },
  {
    id: "message_recipient_channel_attempt_and_delivery_reconciliation",
    label: "Message, recipient, channel, attempt, and delivery reconciliation",
    owner: "Legal + Security + Audit",
    closeoutRequirement: "Define future proof that only the approved message version, recipient role, channel, sender, approvers, manual release, single attempt, delivery outcome, minimal receipt, and no-retry rule were involved.",
    nonRecordBoundary: "Design cannot create, inspect, address, route, send, deliver, retry, forward, redirect, validate, or record a message, recipient, channel, attempt, delivery, or receipt.",
  },
  {
    id: "receipt_response_quarantine_and_incident_disposition",
    label: "Receipt, response, quarantine, and incident disposition",
    owner: "Security + Privacy + Legal",
    closeoutRequirement: "Define future reconciliation of minimal receipt metadata, every delivery anomaly, response, attachment, link, term, proposal, credential, unexpected item, quarantine action, incident, escalation, abort, no opening, no reply, and no reliance outcome.",
    nonRecordBoundary: "Design cannot receive, restore, open, inspect, follow, reply to, forward, retain, delete, quarantine, admit, rely on, negotiate from, or resolve a response or incident.",
  },
  {
    id: "access_recordkeeping_retention_deletion_and_audit_reconciliation",
    label: "Access, recordkeeping, retention, deletion, and audit reconciliation",
    owner: "Privacy + Security + Audit",
    closeoutRequirement: "Define future proof for sender and approver access removal, minimal immutable records, access history, allowed receipt retention, prohibited-content deletion, copy reconciliation, incident records, audit completeness, and independent verification.",
    nonRecordBoundary: "Design cannot grant or remove access, create or inspect an audit record, retain, copy, sanitize, quarantine, delete, certify, restore, disclose, or transform provider or sensitive data.",
  },
  {
    id: "roles_stops_dissent_findings_and_ownership_record",
    label: "Roles, stops, dissent, findings, and ownership record",
    owner: "Executive + Legal + Risk",
    closeoutRequirement: "Define future confirmation of accountable sender and independent approver participation, conflicts, recusals, replacements, stops, aborts, preserved dissent, exceptions, findings, owners, due dates, verification, and final acknowledgments.",
    nonRecordBoundary: "Design cannot assign a person, clear a conflict, waive or suppress dissent, approve an exception, create or resolve a finding, obtain an acknowledgment, or convert a stop into authority.",
  },
  {
    id: "expiry_closeout_no_retry_and_no_downstream_receipt",
    label: "Expiry, closeout, no-retry, and no-downstream receipt",
    owner: "Legal + Executive + Release approvers",
    closeoutRequirement: "Define future proof that authority and access expired, the contact window closed, the attempt and every stop or response were reconciled, retry and restart are prohibited, closeout completed, and no downstream authority follows.",
    nonRecordBoundary: "Design cannot expire authority, close a window, reconcile an attempt, create a closeout receipt, retry, reply, admit evidence, score, recommend, select, contract, create an account, accept credentials, activate traffic, ticket, charge, or change Production.",
  },
];

export const flightProviderContactCloseoutSafeguards: readonly FlightProviderContactCloseoutSafeguard[] = [
  {
    id: "no_implied_contact_or_execution_lock",
    label: "No-implied-contact-or-execution lock",
    owner: "Risk + Release approvers",
    safeguard: "Require separate action-time Phase 18 authorization, Phase 19 preflight, and Phase 20 execution records before closeout review; software completion, publication, deployment, page access, or browser acceptance is never evidence that contact occurred.",
    failClosedBoundary: "Missing, expired, inferred, reused, widened, disputed, or absent execution evidence keeps reconciliation, expiry, audit, closeout, and every downstream decision blocked.",
  },
  {
    id: "attempt_receipt_channel_and_delivery_reconciliation_lock",
    label: "Attempt, receipt, channel, and delivery reconciliation lock",
    owner: "Legal + Security + Audit",
    safeguard: "Require exact immutable authority, message, recipient role, authentic channel, manual two-person release, one-attempt count, delivery outcome, minimal receipt, and no-retry evidence to reconcile independently.",
    failClosedBoundary: "Any missing, altered, duplicated, automated, redirected, forwarded, retried, unverifiable, mismatched, or disputed message, role, channel, attempt, delivery, or receipt blocks closeout.",
  },
  {
    id: "response_quarantine_incident_and_stop_lock",
    label: "Response, quarantine, incident, and stop lock",
    owner: "Security + Privacy + Legal",
    safeguard: "Require every response, attachment, link, term, credential, proposal, delivery anomaly, sensitive-data event, quarantine action, incident, stop, abort, escalation, and no-reply disposition to remain visible and independently owned.",
    failClosedBoundary: "An opened, followed, replied-to, forwarded, relied-on, unquarantined, unresolved, suppressed, waived, unsigned, or disputed item keeps closeout, intake, negotiation, and release blocked.",
  },
  {
    id: "access_retention_deletion_expiry_and_audit_lock",
    label: "Access, retention, deletion, expiry, and audit lock",
    owner: "Privacy + Security + Audit",
    safeguard: "Require proof that authority and access expired, records remain minimal, every copy is reconciled, prohibited material was deleted, required retention is narrow, audit evidence is complete, and restart requires a new cycle.",
    failClosedBoundary: "Any open authority, active access, retained prohibited item, missing copy, incomplete deletion, uncertain expiry, incomplete audit, extension, renewal, or restart path keeps closeout blocked.",
  },
  {
    id: "no_reply_intake_recommendation_selection_or_release_lock",
    label: "No-reply, intake, recommendation, selection, or release lock",
    owner: "Legal + Executive",
    safeguard: "Require closeout to state explicitly that any attempt, receipt, response, quarantine, incident, finding, deletion, or audit record creates no reply, evidence intake, score, recommendation, shortlist, negotiation, contract, supplier selection, account, credential, implementation, or traffic authority.",
    failClosedBoundary: "No contact result or closeout record can authorize a reply, commercial commitment, evidence reuse, Sandbox traffic, ticketing, payment, Production traffic, or another contact attempt.",
  },
];

export const flightProviderContactCloseoutGates: readonly FlightProviderContactCloseoutGate[] = [
  { id: "phase_18_authorization_phase_19_preflight_and_phase_20_execution_verified", label: "Phase 18 authorization, Phase 19 preflight, and Phase 20 execution verified", owner: "Risk + Release approvers", detail: "Require separate, current, action-time records for every prerequisite; this design neither creates nor assumes authorization, preflight, execution, contact, delivery, receipt, response, expiry, audit, or closeout." },
  { id: "scope_message_recipient_channel_and_window_reconciled", label: "Scope, message, recipient, channel, and window reconciled", owner: "Legal + Security", detail: "Reconcile the separately authorized Duffel-only purpose, immutable message and disclosures, sender, approvers, official recipient role, authentic allowlisted channel, fixed window, expiry, revocation, stops, and no-delegation boundary." },
  { id: "attempt_delivery_receipt_and_no_retry_reconciled", label: "Attempt, delivery, receipt, and no retry reconciled", owner: "Risk + Audit", detail: "Reconcile the separately approved manual two-person release, attempt count, timestamp window, delivery outcome, minimal receipt, failures, aborts, and proof that no retry, resend, forwarding, redirect, automation, or alternate channel occurred." },
  { id: "response_quarantine_no_opening_and_no_reply_reconciled", label: "Response, quarantine, no opening, and no reply reconciled", owner: "Legal + Security + Privacy", detail: "Reconcile whether any response or unexpected item existed, its unopened quarantine and access record, no link following, no attachment opening, no reply, no forwarding, no negotiation, no reliance, and separately authorized final disposition." },
  { id: "sensitive_data_attachments_links_incidents_and_stops_resolved", label: "Sensitive data, attachments, links, incidents, and stops resolved", owner: "Security + Privacy + Risk", detail: "Require separate proof for prohibited-data detection, credentials, attachments, links, terms, delivery anomalies, impersonation, privacy and security events, immediate stops, quarantine, escalation, abort, incident ownership, and no restart." },
  { id: "roles_conflicts_dissent_exceptions_findings_and_audit_reconciled", label: "Roles, conflicts, dissent, exceptions, findings, and audit reconciled", owner: "Executive + Legal + Risk", detail: "Require separate sender and approver acknowledgments plus reconciliation of authority, access, conflicts, recusals, replacements, dissent, exceptions, overrides, stop decisions, findings, owners, due dates, verification, and immutable audit evidence." },
  { id: "access_retention_deletion_and_minimal_record_confirmed", label: "Access, retention, deletion, and minimal record confirmed", owner: "Privacy + Security + Audit", detail: "Confirm authority and access removal, minimal receipt retention, complete copy inventory, prohibited-content deletion, incident-record controls, audit completeness, independent verification, and no mailbox, portal, endpoint, or session remains available." },
  { id: "expiry_closeout_and_no_restart_confirmed", label: "Expiry, closeout, and no restart confirmed", owner: "Legal + Release approvers", detail: "Require proof that one-time authority and access expired, the contact window closed, every attempt, stop, response, incident, and record was reconciled, closeout completed, reuse is prohibited, and any future contact requires a new authorization, preflight, and execution cycle." },
  { id: "no_intake_recommendation_selection_contract_account_or_release_confirmed", label: "No intake, recommendation, selection, contract, account, or release confirmed", owner: "Executive + Release approvers", detail: "Confirm that contact and closeout create no reply, evidence intake, score, recommendation, shortlist, negotiation, contract, supplier selection, account, credential, implementation, Sandbox, ticketing, payment, or Production authority." },
  { id: "closeout_requires_separate_decision", label: "Closeout requires a separate decision", owner: "Release approvers", detail: "Require a new decision outside this design after every prerequisite, reconciliation, independent acknowledgment, finding, deletion, access-removal, expiry, audit, and no-restart requirement is satisfied before a closeout receipt could be created." },
];

export type FlightProviderContactCloseoutEvidence = Partial<Record<FlightProviderContactCloseoutGate["id"], boolean>>;

export function buildFlightProviderContactCloseoutDesign(evidence: FlightProviderContactCloseoutEvidence = {}) {
  const gates = flightProviderContactCloseoutGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_PROVIDER_CONTACT_CLOSEOUT_MODE,
    planState: "design_only" as const,
    closeoutControlState: "blocked" as const,
    phase18AuthorizationPrerequisiteState: "not_satisfied" as const,
    phase19PreflightPrerequisiteState: "not_satisfied" as const,
    phase20ExecutionRecordPrerequisiteState: "not_satisfied" as const,
    phase20SoftwareAcceptanceState: "accepted_in_preview" as const,
    authorizationReferenceState: "not_recorded" as const,
    preflightReceiptState: "not_created" as const,
    executionRecordState: "not_created" as const,
    scopeReconciliationState: "not_started" as const,
    messageState: "not_created" as const,
    recipientRoleState: "not_recorded" as const,
    channelState: "not_approved" as const,
    contactWindowState: "not_opened" as const,
    supplierContactState: "not_started" as const,
    contactAttemptCount: 0,
    deliveryState: "not_attempted" as const,
    receiptState: "not_created" as const,
    responseState: "not_received" as const,
    responseQuarantineState: "not_created" as const,
    responseDispositionState: "not_started" as const,
    incidentState: "not_created" as const,
    stopRecordState: "not_created" as const,
    accessRemovalState: "not_confirmed" as const,
    retentionState: "not_confirmed" as const,
    deletionState: "not_confirmed" as const,
    auditRecordState: "not_created" as const,
    roleAcknowledgmentState: "not_recorded" as const,
    conflictReviewState: "not_started" as const,
    dissentState: "not_recorded" as const,
    exceptionState: "not_recorded" as const,
    findingCount: 0,
    findingDispositionState: "not_started" as const,
    authorizationExpiryState: "not_recorded" as const,
    closeoutDecisionState: "not_recorded" as const,
    closeoutState: "not_created" as const,
    evidenceIntakeState: "closed" as const,
    evaluationCaseState: "not_created" as const,
    recommendationState: "not_issued" as const,
    selectionState: "not_selected" as const,
    contractState: "not_received" as const,
    accountState: "not_created" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    closeoutDesignComplete: completedCount === gates.length,
    realSupplierDataAccepted: false,
    passengerDataAccepted: false,
    credentialsAccepted: false,
    externalNetworkAccess: false,
    externalSideEffects: false,
    providerAccountCreated: false,
    sandboxAdapterImplemented: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    ticketingAuthorized: false,
    paymentAuthorized: false,
  } as const;
}
