export const FLIGHT_PROVIDER_CONTACT_EXECUTION_CONTROL_MODE = "duffel_contact_execution_control_design_only" as const;

export type FlightProviderContactExecutionStage = {
  id:
    | "authorization_preflight_and_contact_scope_binding"
    | "sender_approver_and_access_release"
    | "message_recipient_and_channel_release"
    | "one_attempt_contact_handoff"
    | "receipt_response_and_quarantine_control"
    | "incident_abort_and_audit_record"
    | "expiry_closeout_and_no_downstream_release";
  label: string;
  owner: string;
  executionRequirement: string;
  nonExecutionBoundary: string;
};

export type FlightProviderContactExecutionSafeguard = {
  id:
    | "no_implicit_contact_start_lock"
    | "authority_message_recipient_and_channel_immutability_lock"
    | "independent_role_one_attempt_and_observer_stop_lock"
    | "sensitive_content_response_quarantine_and_abort_lock"
    | "contact_closeout_and_no_downstream_authority_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightProviderContactExecutionGate = {
  id:
    | "phase_18_authorization_separately_satisfied"
    | "phase_19_preflight_separately_approved"
    | "one_time_contact_scope_message_and_window_bound"
    | "sender_approvers_conflicts_and_access_verified"
    | "recipient_role_channel_and_authenticity_reverified"
    | "message_disclosures_data_minimization_and_freeze_reverified"
    | "one_attempt_no_retry_stop_incident_and_abort_controls_verified"
    | "receipt_response_quarantine_recordkeeping_and_closeout_verified"
    | "no_intake_recommendation_selection_contract_account_or_release_verified"
    | "contact_execution_requires_separate_action_time_start";
  label: string;
  owner: string;
  detail: string;
};

export const flightProviderContactExecutionStages: readonly FlightProviderContactExecutionStage[] = [
  {
    id: "authorization_preflight_and_contact_scope_binding",
    label: "Authorization, preflight, and contact-scope binding",
    owner: "Risk + Release approvers",
    executionRequirement: "Require one actual Phase 18 authorization, one separately approved Phase 19 preflight receipt, and one action-time start decision bound to the exact Duffel-only purpose, message, recipient role, channel, attempt, window, expiry, revocation, and stop conditions.",
    nonExecutionBoundary: "Design cannot create, approve, infer, reuse, broaden, or validate authorization, preflight, a receipt, scope, window, recipient, channel, or start decision.",
  },
  {
    id: "sender_approver_and_access_release",
    label: "Sender, approver, and access release",
    owner: "Executive + Legal + Security",
    executionRequirement: "Require accountable sender and independent approver acknowledgments, current authority and conflict checks, recusals, replacements, least-privilege access, session expiry, and unconditional pause and abort authority.",
    nonExecutionBoundary: "Design cannot identify, authenticate, assign, approve, recuse, replace, or grant access to a person or waive, override, or satisfy a role control.",
  },
  {
    id: "message_recipient_and_channel_release",
    label: "Message, recipient, and channel release",
    owner: "Legal + Privacy + Security",
    executionRequirement: "Release only one immutable approved message and disclosure version to one independently reverified official Duffel recipient role through one allowlisted authentic business channel without attachment, link, sensitive data, credential, promise, or commitment.",
    nonExecutionBoundary: "Design cannot create, read, approve, modify, discover, display, validate, address, route, transmit, forward, or redirect a message, recipient, address, domain, telephone number, portal, or channel.",
  },
  {
    id: "one_attempt_contact_handoff",
    label: "One-attempt contact handoff",
    owner: "Risk + Release approvers",
    executionRequirement: "Permit only a future separately authorized single attempt inside the fixed window, with immediate pre-send revalidation, two-person release, no automation, no delegation, no retry, no alternate channel, and no standing authority.",
    nonExecutionBoundary: "Design cannot open a window, release, queue, schedule, automate, transmit, retry, resend, forward, redirect, switch channels, or count a contact attempt.",
  },
  {
    id: "receipt_response_and_quarantine_control",
    label: "Receipt, response, and quarantine control",
    owner: "Legal + Security + Audit",
    executionRequirement: "Limit any future contact record to the approved minimal receipt; quarantine every response, attachment, link, term, credential, evidence item, proposal, or unexpected content without opening, relying on, forwarding, negotiating, or admitting it.",
    nonExecutionBoundary: "Design cannot create a receipt, receive, inspect, restore, open, follow, retain, delete, admit, rely on, reply to, or negotiate from a response or supplier material.",
  },
  {
    id: "incident_abort_and_audit_record",
    label: "Incident, abort, and audit record",
    owner: "Security + Privacy + Risk",
    executionRequirement: "Require future mismatch, impersonation, sensitive-data, unexpected-content, delivery, access, privacy, security, commitment, or commercial-pressure events to pause or abort immediately with immutable minimal audit, escalation, quarantine, access removal, and no restart.",
    nonExecutionBoundary: "Design cannot detect, investigate, resolve, close, suppress, waive, or convert an incident, mismatch, stop, abort, or audit event into contact authority.",
  },
  {
    id: "expiry_closeout_and_no_downstream_release",
    label: "Expiry, closeout, and no-downstream release",
    owner: "Legal + Executive + Release approvers",
    executionRequirement: "Require window expiry, access removal, attempt reconciliation, response disposition, incident ownership, closeout, no retry, and separate future authority for intake, scoring, recommendation, selection, contract, account, credential, implementation, traffic, ticketing, payment, and Production.",
    nonExecutionBoundary: "Design cannot expire authority, close contact, create a receipt, admit evidence, score, recommend, select, negotiate, contract, create an account, accept credentials, implement, activate, ticket, charge, or change Production.",
  },
];

export const flightProviderContactExecutionSafeguards: readonly FlightProviderContactExecutionSafeguard[] = [
  {
    id: "no_implicit_contact_start_lock",
    label: "No-implicit-contact-start lock",
    owner: "Risk + Release approvers",
    safeguard: "Require actual Phase 18 authorization, a separately approved Phase 19 preflight receipt, and a new one-time action-time start decision before one fixed contact attempt could begin.",
    failClosedBoundary: "Software completion, Git publication, deployment, browser acceptance, checklist completion, provider preference, or prior authority never starts, queues, schedules, or authorizes contact.",
  },
  {
    id: "authority_message_recipient_and_channel_immutability_lock",
    label: "Authority, message, recipient, and channel immutability lock",
    owner: "Legal + Security + Risk",
    safeguard: "Require the current authorization, preflight receipt, Duffel-only purpose, exact message and disclosures, official recipient role, authentic allowlisted channel, attempt limit, and window to remain fixed and independently reproducible.",
    failClosedBoundary: "Any missing, stale, expired, altered, broadened, reused, delegated, substituted, redirected, forwarded, impersonated, or irreproducible item stops contact.",
  },
  {
    id: "independent_role_one_attempt_and_observer_stop_lock",
    label: "Independent-role, one-attempt, and observer-stop lock",
    owner: "Executive + Legal + Risk",
    safeguard: "Require accountable independent roles, current conflicts and recusals, two-person release, least privilege, one manual attempt, unconditional observer stop, no delegation, no automation, no retry, and no alternate channel.",
    failClosedBoundary: "A missing, conflicted, combined, overprivileged, expired, unsigned, automated, retried, unavailable, suppressed, or overridden role or stop keeps contact blocked.",
  },
  {
    id: "sensitive_content_response_quarantine_and_abort_lock",
    label: "Sensitive-content, response-quarantine, and abort lock",
    owner: "Privacy + Security + Legal",
    safeguard: "Exclude passenger, payment, credential, secret, attachment, link, confidential, supplier-document, Production, commercial-acceptance, partnership, volume, and readiness content and quarantine every unexpected response without reliance.",
    failClosedBoundary: "Sensitive data, credentials, attachments, links, terms, prices, proposals, contract language, partnership claims, delivery anomalies, or unexpected responses trigger immediate abort without retry, intake, reply, negotiation, or reliance.",
  },
  {
    id: "contact_closeout_and_no_downstream_authority_lock",
    label: "Contact-closeout and no-downstream-authority lock",
    owner: "Legal + Executive + Audit",
    safeguard: "Require expiry, attempt reconciliation, access removal, response and incident disposition, minimal audit, closeout, no restart, and a separate future decision for every response, evidence, recommendation, commercial, account, credential, implementation, traffic, ticketing, payment, or Production step.",
    failClosedBoundary: "Contact authority remains one-time, narrow, revocable, non-transferable, non-renewing, and unable to admit evidence, recommend, select, contract, credential, activate, ticket through, or pay a supplier.",
  },
];

export const flightProviderContactExecutionGates: readonly FlightProviderContactExecutionGate[] = [
  { id: "phase_18_authorization_separately_satisfied", label: "Phase 18 authorization separately satisfied", owner: "Risk + Release approvers", detail: "Require one actual, current, narrow, expiring, revocable Phase 18 authorization created outside this software; Phase 18 design completion and Preview acceptance cannot substitute for authority." },
  { id: "phase_19_preflight_separately_approved", label: "Phase 19 preflight separately approved", owner: "Risk + Security", detail: "Require a separately approved preflight receipt covering the exact authority, scope, roles, message, recipient role, authentic channel, data minimization, window, stops, response disposition, and closeout; Phase 19 software cannot create it." },
  { id: "one_time_contact_scope_message_and_window_bound", label: "One-time contact scope, message, and window bound", owner: "Legal + Risk", detail: "Bind Duffel only, one diligence purpose, one immutable message and disclosure version, one official recipient role, one allowlisted channel, one attempt, start and end window, expiry, revocation, no delegation, no reuse, and stop conditions." },
  { id: "sender_approvers_conflicts_and_access_verified", label: "Sender, approvers, conflicts, and access verified", owner: "Executive + Legal + Security", detail: "Verify accountable independent roles, identity, authority, acknowledgments, current conflicts, recusals, replacements, least-privilege access, session expiry, two-person release, and unconditional stop authority." },
  { id: "recipient_role_channel_and_authenticity_reverified", label: "Recipient role, channel, and authenticity reverified", owner: "Security + Procurement", detail: "Reverify one official Duffel recipient role, allowlisted business channel, domain ownership, anti-impersonation, delivery, redirect, forwarding, alternate-channel, and substitution controls immediately before contact could start." },
  { id: "message_disclosures_data_minimization_and_freeze_reverified", label: "Message, disclosures, data minimization, and freeze reverified", owner: "Legal + Privacy + Product", detail: "Reverify the exact subject and body hash, truthful disclosures, evaluation-only purpose, permitted questions, no-partnership and no-commitment language, prohibited claims and data, no attachment or link, and immutable freeze." },
  { id: "one_attempt_no_retry_stop_incident_and_abort_controls_verified", label: "One-attempt, no-retry, stop, incident, and abort controls verified", owner: "Risk + Security", detail: "Verify one manual attempt, immediate pre-send revalidation, no automation, no delegation, no retry, no forwarding or channel switch, mismatch and sensitive-content stops, quarantine, escalation, abort, access removal, and no restart." },
  { id: "receipt_response_quarantine_recordkeeping_and_closeout_verified", label: "Receipt, response, quarantine, recordkeeping, and closeout verified", owner: "Legal + Security + Audit", detail: "Verify the minimal receipt schema, response and unexpected-content quarantine, no opening or reliance, immutable audit, retention and deletion, incident ownership, expiry, access removal, attempt reconciliation, and closeout." },
  { id: "no_intake_recommendation_selection_contract_account_or_release_verified", label: "No intake, recommendation, selection, contract, account, or release verified", owner: "Executive + Legal + Release approvers", detail: "Verify contact creates no evidence intake, score, recommendation, shortlist, negotiation, selection, contract, account, credential, implementation, Sandbox, traffic, ticketing, payment, deployment, or Production authority." },
  { id: "contact_execution_requires_separate_action_time_start", label: "Contact execution requires a separate action-time start", owner: "Release approvers", detail: "Require a new decision outside this design immediately before one approved attempt; design completion never creates a send control, opens a window, creates standing authority, or permits retry." },
];

export type FlightProviderContactExecutionEvidence = Partial<Record<FlightProviderContactExecutionGate["id"], boolean>>;

export function buildFlightProviderContactExecutionControlDesign(evidence: FlightProviderContactExecutionEvidence = {}) {
  const gates = flightProviderContactExecutionGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_PROVIDER_CONTACT_EXECUTION_CONTROL_MODE,
    planState: "design_only" as const,
    executionControlState: "blocked" as const,
    phase18AuthorizationPrerequisiteState: "not_satisfied" as const,
    phase19PreflightPrerequisiteState: "not_satisfied" as const,
    phase19SoftwareAcceptanceState: "accepted_in_preview" as const,
    authorizationReferenceState: "not_recorded" as const,
    preflightReceiptState: "not_created" as const,
    executionDecisionState: "not_recorded" as const,
    contactScopeBindingState: "not_recorded" as const,
    senderState: "not_assigned" as const,
    approverState: "not_assigned" as const,
    conflictReviewState: "not_started" as const,
    accessState: "not_granted" as const,
    messageState: "not_created" as const,
    messageFreezeState: "not_confirmed" as const,
    disclosureState: "not_approved" as const,
    recipientRoleState: "not_recorded" as const,
    channelState: "not_approved" as const,
    channelAuthenticityState: "not_verified" as const,
    recordkeepingPlanState: "not_approved" as const,
    contactWindowState: "not_opened" as const,
    supplierContactState: "not_started" as const,
    contactAttemptCount: 0,
    receiptState: "not_created" as const,
    responseState: "not_received" as const,
    responseDispositionState: "not_started" as const,
    responseQuarantineState: "not_created" as const,
    incidentState: "not_recorded" as const,
    stopRecordState: "not_created" as const,
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
    executionControlDesignComplete: completedCount === gates.length,
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
