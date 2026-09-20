export const FLIGHT_PROVIDER_CONTACT_PREFLIGHT_MODE = "duffel_contact_preflight_design_only" as const;

export type FlightProviderContactPreflightControl = {
  id:
    | "phase_18_authorization_and_scope_reference"
    | "sender_approver_identity_conflict_and_acknowledgment"
    | "message_disclosure_and_no_commitment_freeze"
    | "recipient_role_channel_domain_and_authenticity_verification"
    | "data_minimization_privacy_security_and_recordkeeping"
    | "window_expiry_revocation_stop_incident_and_no_retry"
    | "response_disposition_closeout_and_no_downstream_release";
  label: string;
  owner: string;
  preflightRequirement: string;
  nonPreflightBoundary: string;
};

export type FlightProviderContactPreflightSafeguard = {
  id:
    | "no_implicit_preflight_or_contact_opening_lock"
    | "authorization_provider_purpose_and_message_immutability_lock"
    | "sender_recipient_channel_identity_and_conflict_lock"
    | "sensitive_data_attachment_credential_and_commitment_stop_lock"
    | "expiry_revocation_incident_no_retry_and_no_downstream_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightProviderContactPreflightGate = {
  id:
    | "actual_phase_18_authorization_separately_satisfied"
    | "authorization_reference_scope_and_expiry_verified"
    | "accountable_sender_and_independent_approvers_verified"
    | "exact_message_disclosures_and_no_commitment_language_frozen"
    | "recipient_role_official_channel_and_authenticity_verified"
    | "data_minimization_privacy_security_and_recordkeeping_verified"
    | "window_expiry_revocation_stop_incident_and_no_retry_controls_bound"
    | "response_disposition_quarantine_closeout_and_no_intake_verified"
    | "no_recommendation_selection_contract_account_or_release_verified"
    | "contact_remains_a_separate_action_time_decision";
  label: string;
  owner: string;
  detail: string;
};

export const flightProviderContactPreflightControls: readonly FlightProviderContactPreflightControl[] = [
  {
    id: "phase_18_authorization_and_scope_reference",
    label: "Phase 18 authorization and scope reference",
    owner: "Risk + Release approvers",
    preflightRequirement: "Verify one separately approved, current, narrow, expiring, revocable actual Phase 18 authorization and bind its immutable reference, Duffel-only scope, diligence purpose, one-attempt limit, exclusions, and no-standing-authority boundary.",
    nonPreflightBoundary: "Design cannot create, approve, infer, refresh, broaden, or satisfy Phase 18 authorization or convert Preview acceptance into provider-contact authority.",
  },
  {
    id: "sender_approver_identity_conflict_and_acknowledgment",
    label: "Sender, approver, identity, conflict, and acknowledgment control",
    owner: "Executive + Legal + Risk",
    preflightRequirement: "Reverify the accountable organizational sender, independent approvers, current roles, identity, authority, acknowledgments, conflicts, recusals, replacements, non-delegation, stop authority, and least-privilege access immediately before contact could be considered.",
    nonPreflightBoundary: "Design cannot name, assign, authenticate, authorize, recuse, replace, or grant access to a sender or approver.",
  },
  {
    id: "message_disclosure_and_no_commitment_freeze",
    label: "Message, disclosure, and no-commitment freeze",
    owner: "Legal + Product + Privacy",
    preflightRequirement: "Verify the exact immutable subject and message version, truthful company and evaluation disclosures, permitted questions, prohibited claims, no-partnership and no-commitment language, data-minimization rules, and change-control hash.",
    nonPreflightBoundary: "Design cannot draft, personalize, approve, address, hash, store, transmit, or represent an outbound message or disclosure as ready.",
  },
  {
    id: "recipient_role_channel_domain_and_authenticity_verification",
    label: "Recipient role, channel, domain, and authenticity verification",
    owner: "Security + Procurement + Legal",
    preflightRequirement: "Verify one official Duffel business recipient role and allowlisted channel using current domain ownership, anti-impersonation, redirect, forwarding, alternate-channel, and independent authenticity controls without exposing the address in this design.",
    nonPreflightBoundary: "Design cannot search for, discover, record, validate, display, or contact an address, domain owner, telephone number, social account, portal, or recipient.",
  },
  {
    id: "data_minimization_privacy_security_and_recordkeeping",
    label: "Data minimization, privacy, security, and recordkeeping control",
    owner: "Privacy + Security + Audit",
    preflightRequirement: "Verify the message contains only approved business information; excludes passenger, credential, secret, payment, confidential, supplier-document, attachment, link, and Production data; and binds minimal receipt, access, retention, deletion, and audit rules.",
    nonPreflightBoundary: "Design cannot collect, inspect, attach, upload, retain, delete, disclose, or accept personal, secret, credential, payment, confidential, supplier, or Production data.",
  },
  {
    id: "window_expiry_revocation_stop_incident_and_no_retry",
    label: "Window, expiry, revocation, stop, incident, and no-retry control",
    owner: "Risk + Security",
    preflightRequirement: "Bind one future start and end window, automatic expiry, revocation, recipient or content mismatch stops, unexpected attachment or link handling, commercial-pressure and credential stops, incident escalation, abort, quarantine, no retry, and no channel switching.",
    nonPreflightBoundary: "Design cannot open or extend a contact window, resolve an incident, inspect unexpected content, retry, redirect, forward, switch channels, or authorize an attempt.",
  },
  {
    id: "response_disposition_closeout_and_no_downstream_release",
    label: "Response disposition, closeout, and no-downstream-release control",
    owner: "Legal + Risk + Audit",
    preflightRequirement: "Verify minimal future send receipt, response rejection or quarantine, no evidence intake or reliance, no negotiation or commitment, closeout, expiry, findings, access removal, and separately authorized handling for every response or later step.",
    nonPreflightBoundary: "Design cannot create a receipt, admit a response, open evidence intake, score, recommend, select, negotiate, contract, create an account, accept credentials, implement an adapter, enable traffic, ticket, charge, or change Production.",
  },
];

export const flightProviderContactPreflightSafeguards: readonly FlightProviderContactPreflightSafeguard[] = [
  {
    id: "no_implicit_preflight_or_contact_opening_lock",
    label: "No-implicit-preflight-or-contact-opening lock",
    owner: "Risk + Release approvers",
    safeguard: "Require actual Phase 18 authorization, independent preflight verification, and a new one-time action-time decision before one contact attempt could be considered.",
    failClosedBoundary: "Software completion, Git publication, Preview deployment, browser acceptance, checklist completion, or executive provider preference never opens preflight or authorizes contact.",
  },
  {
    id: "authorization_provider_purpose_and_message_immutability_lock",
    label: "Authorization, provider, purpose, and message immutability lock",
    owner: "Legal + Product + Risk",
    safeguard: "Bind an immutable current authorization reference, Duffel-only scope, narrow diligence purpose, exact message version, permitted questions, disclosures, exclusions, and one-attempt limit.",
    failClosedBoundary: "A missing, stale, expired, altered, broadened, reused, delegated, or mismatched authorization, provider, purpose, question, disclosure, or message keeps contact blocked.",
  },
  {
    id: "sender_recipient_channel_identity_and_conflict_lock",
    label: "Sender, recipient, channel, identity, and conflict lock",
    owner: "Security + Legal + Procurement",
    safeguard: "Require verified accountable roles, acknowledgments, conflicts, recusals, one official recipient role, one allowlisted business channel, domain authenticity, anti-impersonation, and no forwarding or alternate-channel authority.",
    failClosedBoundary: "Unassigned, conflicted, delegated, unverifiable, impersonated, redirected, forwarded, substituted, overprivileged, or otherwise changed identity or channel stops preflight and contact.",
  },
  {
    id: "sensitive_data_attachment_credential_and_commitment_stop_lock",
    label: "Sensitive-data, attachment, credential, and commitment stop lock",
    owner: "Privacy + Security + Legal",
    safeguard: "Exclude passenger, payment, credential, secret, confidential, supplier-document, attachment, link, Production, commercial-acceptance, partnership, volume, and readiness content from any future contact.",
    failClosedBoundary: "Sensitive data, credentials, attachments, unexpected links, terms, prices, contract language, partnership claims, promises, or commitments trigger immediate stop without send, retry, intake, or reliance.",
  },
  {
    id: "expiry_revocation_incident_no_retry_and_no_downstream_lock",
    label: "Expiry, revocation, incident, no-retry, and no-downstream lock",
    owner: "Risk + Security + Audit",
    safeguard: "Require a fixed window, automatic expiry, revocation, pause, incident escalation, abort, no retry, minimal closeout, and separate authority for every response, evidence, commercial, account, credential, implementation, traffic, ticketing, payment, or Production step.",
    failClosedBoundary: "Expired, revoked, incident-affected, retried, restarted, unclosed, response-bearing, evidence-bearing, or downstream-seeking activity remains blocked and creates no authority.",
  },
];

export const flightProviderContactPreflightGates: readonly FlightProviderContactPreflightGate[] = [
  { id: "actual_phase_18_authorization_separately_satisfied", label: "Actual Phase 18 authorization separately satisfied", owner: "Risk + Release approvers", detail: "Verify one actual, current, narrow, expiring, revocable Phase 18 authorization created outside this software; Phase 18 design completion and Preview acceptance cannot substitute for authority." },
  { id: "authorization_reference_scope_and_expiry_verified", label: "Authorization reference, scope, and expiry verified", owner: "Legal + Risk", detail: "Verify the immutable authorization reference, Duffel-only provider scope, one diligence purpose, one-attempt limit, permitted questions, exclusions, start, expiry, revocation, non-delegation, and no-standing-authority boundary." },
  { id: "accountable_sender_and_independent_approvers_verified", label: "Accountable sender and independent approvers verified", owner: "Executive + Legal + Risk", detail: "Reverify organizational roles, identity, authority, acknowledgments, current conflicts, recusals, replacements, least-privilege access, and unconditional stop authority immediately before contact could be considered." },
  { id: "exact_message_disclosures_and_no_commitment_language_frozen", label: "Exact message, disclosures, and no-commitment language frozen", owner: "Legal + Product + Privacy", detail: "Verify the immutable subject and message version, truthful disclosures, evaluation-only purpose, no-partnership and no-commitment language, permitted questions, prohibited claims, data minimization, and change control." },
  { id: "recipient_role_official_channel_and_authenticity_verified", label: "Recipient role, official channel, and authenticity verified", owner: "Security + Procurement", detail: "Verify one official Duffel recipient role, allowlisted business channel, domain ownership, anti-impersonation, redirect, forwarding, and alternate-channel controls through an independent current check." },
  { id: "data_minimization_privacy_security_and_recordkeeping_verified", label: "Data minimization, privacy, security, and recordkeeping verified", owner: "Privacy + Security + Audit", detail: "Verify exclusion of passenger, credential, secret, payment, confidential, supplier-document, attachment, link, and Production data plus minimal receipt, access, retention, deletion, and immutable audit controls." },
  { id: "window_expiry_revocation_stop_incident_and_no_retry_controls_bound", label: "Window, expiry, revocation, stop, incident, and no-retry controls bound", owner: "Risk + Security", detail: "Bind one fixed future window, automatic expiry, revocation, mismatch and prohibited-content stops, unexpected-content handling, escalation, quarantine, abort, no retry, no forwarding, and no channel switching." },
  { id: "response_disposition_quarantine_closeout_and_no_intake_verified", label: "Response disposition, quarantine, closeout, and no-intake verified", owner: "Legal + Risk + Audit", detail: "Verify minimal send receipt, response rejection or quarantine, no evidence admission or commercial reliance, expiry, access removal, findings, closeout, and separately authorized handling for every response." },
  { id: "no_recommendation_selection_contract_account_or_release_verified", label: "No recommendation, selection, contract, account, or release verified", owner: "Executive + Legal + Release approvers", detail: "Verify contact creates no recommendation, score, shortlist, negotiation, selection, contract, account, credential, implementation, Sandbox, traffic, ticketing, payment, deployment, or Production authority." },
  { id: "contact_remains_a_separate_action_time_decision", label: "Contact remains a separate action-time decision", owner: "Release approvers", detail: "Require a new one-time decision outside this design immediately before one approved attempt; completed design or preflight evidence never sends, opens a window, creates standing authority, or permits retry." },
];

export type FlightProviderContactPreflightEvidence = Partial<Record<FlightProviderContactPreflightGate["id"], boolean>>;

export function buildFlightProviderContactPreflightDesign(evidence: FlightProviderContactPreflightEvidence = {}) {
  const gates = flightProviderContactPreflightGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_PROVIDER_CONTACT_PREFLIGHT_MODE,
    planState: "design_only" as const,
    phase18AuthorizationPrerequisiteState: "not_satisfied" as const,
    phase18SoftwareAcceptanceState: "accepted_in_preview" as const,
    authorizationReferenceState: "not_recorded" as const,
    providerPathPreferenceState: "recorded" as const,
    primaryProviderPath: "duffel" as const,
    secondaryProviderPath: "sabre" as const,
    parallelLaunchState: "not_authorized" as const,
    preflightState: "blocked" as const,
    preflightDecisionState: "not_recorded" as const,
    contactAuthorizationState: "blocked" as const,
    contactPurposeState: "not_bound" as const,
    senderState: "not_assigned" as const,
    approverState: "not_assigned" as const,
    messageState: "not_created" as const,
    messageFreezeState: "not_confirmed" as const,
    disclosureState: "not_approved" as const,
    recipientRoleState: "not_recorded" as const,
    channelState: "not_approved" as const,
    channelAuthenticityState: "not_verified" as const,
    conflictReviewState: "not_started" as const,
    privacySecurityReviewState: "not_started" as const,
    recordkeepingPlanState: "not_approved" as const,
    stopPlanState: "not_approved" as const,
    responseDispositionPlanState: "not_approved" as const,
    closeoutPlanState: "not_approved" as const,
    contactWindowState: "not_opened" as const,
    supplierContactState: "not_started" as const,
    contactAttemptCount: 0,
    receiptState: "not_created" as const,
    responseState: "not_received" as const,
    evidenceIntakeState: "closed" as const,
    evaluationCaseState: "not_created" as const,
    recommendationState: "not_issued" as const,
    selectionState: "not_selected" as const,
    contractState: "not_received" as const,
    accountState: "not_created" as const,
    gates,
    completedCount,
    totalCount: gates.length,
    preflightDesignComplete: completedCount === gates.length,
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
