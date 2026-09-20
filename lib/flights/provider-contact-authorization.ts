export const FLIGHT_PROVIDER_CONTACT_AUTHORIZATION_MODE = "duffel_contact_authorization_design_only" as const;

export type FlightProviderContactAuthorizationArtifact = {
  id:
    | "provider_path_and_purpose_record"
    | "accountable_owner_and_authority_record"
    | "approved_message_and_disclosure_packet"
    | "approved_channel_and_recipient_scope"
    | "expiry_stop_withdrawal_and_incident_plan"
    | "contact_receipt_and_no_commitment_closeout";
  label: string;
  owner: string;
  authorizationRequirement: string;
  nonContactBoundary: string;
};

export type FlightProviderContactAuthorizationSafeguard = {
  id:
    | "no_implicit_contact_authority_lock"
    | "named_provider_purpose_and_recipient_lock"
    | "message_disclosure_and_data_minimization_lock"
    | "one_time_channel_expiry_and_stop_lock"
    | "no_commitment_intake_or_downstream_authority_lock";
  label: string;
  owner: string;
  safeguard: string;
  failClosedBoundary: string;
};

export type FlightProviderContactAuthorizationGate = {
  id:
    | "executive_provider_path_preference_verified"
    | "one_contact_purpose_and_duffel_scope_bound"
    | "accountable_sender_and_approvers_named"
    | "approved_message_and_no_commitment_language_frozen"
    | "required_disclosures_and_prohibited_statements_verified"
    | "recipient_role_and_official_channel_allowlisted"
    | "data_minimization_security_and_recordkeeping_verified"
    | "start_expiry_revocation_stop_and_incident_controls_bound"
    | "response_handling_closeout_and_no_intake_boundary_verified"
    | "contact_requires_separate_action_time_authorization";
  label: string;
  owner: string;
  detail: string;
};

export const flightProviderContactAuthorizationArtifacts: readonly FlightProviderContactAuthorizationArtifact[] = [
  {
    id: "provider_path_and_purpose_record",
    label: "Provider-path and purpose record",
    owner: "Executive + Product",
    authorizationRequirement: "Bind the recorded Duffel-primary preference to one narrow diligence purpose covering United States content, ticketing authority, servicing, settlement, support, security, privacy, and commercial evidence without implying recommendation or selection.",
    nonContactBoundary: "Design cannot contact Duffel, identify a recipient, open a conversation, request evidence, recommend a provider, or select a supplier.",
  },
  {
    id: "accountable_owner_and_authority_record",
    label: "Accountable owner and authority record",
    owner: "Executive + Legal + Risk",
    authorizationRequirement: "Require one named organizational sender, independent approvers, a non-delegable purpose, permitted channel, start and expiry, revocation, stop conditions, and a one-contact limit before contact could be considered.",
    nonContactBoundary: "Design cannot assign a person, verify identity, grant authority, delegate authority, begin a window, or create standing permission.",
  },
  {
    id: "approved_message_and_disclosure_packet",
    label: "Approved message and disclosure packet",
    owner: "Legal + Product + Privacy",
    authorizationRequirement: "Freeze an approved message, truthful company and evaluation disclosures, no-partnership and no-commitment language, permitted questions, prohibited claims, and data-minimization rules before any send decision.",
    nonContactBoundary: "Design cannot draft, approve, personalize, address, send, or store an outbound message or disclose passenger, credential, financial, confidential, or Production data.",
  },
  {
    id: "approved_channel_and_recipient_scope",
    label: "Approved channel and recipient scope",
    owner: "Security + Legal + Procurement",
    authorizationRequirement: "Allowlist one official Duffel business channel and recipient role with identity validation, anti-impersonation checks, audit capture, access controls, and no alternate-channel or forwarding authority.",
    nonContactBoundary: "Design cannot browse for, validate, record, or message an address, create an account or case, submit a form, place a call, or use social media.",
  },
  {
    id: "expiry_stop_withdrawal_and_incident_plan",
    label: "Expiry, stop, withdrawal, and incident plan",
    owner: "Risk + Security + Legal",
    authorizationRequirement: "Define automatic expiry, revocation, recipient mismatch, unexpected attachment, prohibited-data, commercial-pressure, credential, payment, contract, incident, escalation, quarantine, and no-retry rules.",
    nonContactBoundary: "Design cannot open, inspect, retain, quarantine, delete, or respond to a message or attachment, resolve an incident, retry contact, or extend authority.",
  },
  {
    id: "contact_receipt_and_no_commitment_closeout",
    label: "Contact receipt and no-commitment closeout",
    owner: "Audit + Legal + Executive",
    authorizationRequirement: "Require a minimal future receipt, exact authority reference, channel and message version, send outcome, stop outcome, expiry, response disposition, closeout, and explicit separation from intake, scoring, recommendation, selection, contracting, credentials, and traffic.",
    nonContactBoundary: "Design cannot create a receipt, claim contact occurred, admit a response, open evidence intake, score, recommend, negotiate, contract, credential, deploy, ticket, or collect payment.",
  },
];

export const flightProviderContactAuthorizationSafeguards: readonly FlightProviderContactAuthorizationSafeguard[] = [
  {
    id: "no_implicit_contact_authority_lock",
    label: "No-implicit-contact-authority lock",
    owner: "Executive + Release approvers",
    safeguard: "Require a new one-time, named, scoped, expiring, revocable action-time authorization after every design gate and prerequisite is independently verified.",
    failClosedBoundary: "The provider-path preference, this software, Git publication, deployment, browser acceptance, or a completed checklist never authorizes contact.",
  },
  {
    id: "named_provider_purpose_and_recipient_lock",
    label: "Named-provider, purpose, and recipient lock",
    owner: "Legal + Procurement + Risk",
    safeguard: "Limit any future authority to Duffel, one approved diligence purpose, one accountable sender, one official recipient role, one allowlisted channel, and one contact attempt.",
    failClosedBoundary: "A changed provider, purpose, sender, recipient, channel, audience, forwarding path, or attempt count voids authority before contact.",
  },
  {
    id: "message_disclosure_and_data_minimization_lock",
    label: "Message, disclosure, and data-minimization lock",
    owner: "Legal + Privacy + Security",
    safeguard: "Require an immutable approved message version with truthful disclosures, no-commitment language, permitted questions, prohibited claims, and no passenger, credential, payment, secret, confidential, or Production data.",
    failClosedBoundary: "Unapproved text, personalization, attachments, links, sensitive data, credentials, pricing acceptance, partnership claims, or commitments stop the contact.",
  },
  {
    id: "one_time_channel_expiry_and_stop_lock",
    label: "One-time channel, expiry, and stop lock",
    owner: "Security + Risk",
    safeguard: "Require identity validation, anti-impersonation controls, a fixed send window, automatic expiry, revocation, pause, incident escalation, no retry, and no channel switching.",
    failClosedBoundary: "Expired, revoked, unverifiable, redirected, retried, forwarded, broadened, or incident-affected contact remains blocked.",
  },
  {
    id: "no_commitment_intake_or_downstream_authority_lock",
    label: "No-commitment, intake, or downstream-authority lock",
    owner: "Executive + Legal + Risk",
    safeguard: "Separate any future contact receipt and response disposition from evidence intake, scoring, recommendation, selection, contracting, accounts, credentials, implementation, Sandbox, ticketing, payments, and Production.",
    failClosedBoundary: "A reply, document, quote, term, credential, link, invitation, or verbal statement creates no intake, reliance, commitment, or downstream authority.",
  },
];

export const flightProviderContactAuthorizationGates: readonly FlightProviderContactAuthorizationGate[] = [
  { id: "executive_provider_path_preference_verified", label: "Executive provider-path preference verified", owner: "Executive + Product", detail: "Verify the current documentation-only decision naming Duffel as the primary intended diligence path and Sabre as the inactive secondary path without converting preference into recommendation or selection." },
  { id: "one_contact_purpose_and_duffel_scope_bound", label: "One contact purpose and Duffel scope bound", owner: "Product + Legal", detail: "Bind one narrow diligence purpose, permitted questions, exclusions, one-contact limit, no-partnership claim, no-commitment boundary, and no supplier-selection authority." },
  { id: "accountable_sender_and_approvers_named", label: "Accountable sender and approvers named", owner: "Executive + Legal + Risk", detail: "Require one accountable organizational sender and independent legal, privacy, security, finance, operations, and release approvals with no delegation or reuse." },
  { id: "approved_message_and_no_commitment_language_frozen", label: "Approved message and no-commitment language frozen", owner: "Legal + Product", detail: "Freeze the exact outbound message version, subject, questions, truthful disclosures, evaluation-only language, no-commitment statement, and prohibited edits before any action-time decision." },
  { id: "required_disclosures_and_prohibited_statements_verified", label: "Required disclosures and prohibited statements verified", owner: "Legal + Privacy", detail: "Verify company identity, intended use, data-minimization, confidentiality expectations, permitted claims, and explicit prohibitions on partnership, certification, customer volume, live readiness, or commercial acceptance claims." },
  { id: "recipient_role_and_official_channel_allowlisted", label: "Recipient role and official channel allowlisted", owner: "Security + Procurement", detail: "Allowlist one official Duffel business channel and recipient role with identity, domain, anti-impersonation, forwarding, and alternate-channel controls; no recipient address is recorded by this design." },
  { id: "data_minimization_security_and_recordkeeping_verified", label: "Data minimization, security, and recordkeeping verified", owner: "Privacy + Security + Audit", detail: "Verify no passenger, credential, payment, secret, confidential, supplier-document, or Production data; define minimal receipt, access, retention, deletion, and audit requirements." },
  { id: "start_expiry_revocation_stop_and_incident_controls_bound", label: "Start, expiry, revocation, stop, and incident controls bound", owner: "Risk + Security", detail: "Bind one start and end window, automatic expiry, revocation, recipient mismatch, unexpected content, prohibited data, credential, payment, contract, incident, escalation, abort, and no-retry controls." },
  { id: "response_handling_closeout_and_no_intake_boundary_verified", label: "Response handling, closeout, and no-intake boundary verified", owner: "Legal + Risk + Audit", detail: "Define minimal send receipt, response quarantine or rejection, no evidence admission, no commercial reliance, closeout, findings, expiry, and separate future authorization for every intake or downstream step." },
  { id: "contact_requires_separate_action_time_authorization", label: "Contact requires separate action-time authorization", owner: "Release approvers", detail: "Require a new one-time decision outside this design immediately before one approved contact attempt; software completion never creates standing authority." },
];

export type FlightProviderContactAuthorizationEvidence = Partial<Record<FlightProviderContactAuthorizationGate["id"], boolean>>;

export function buildFlightProviderContactAuthorizationDesign(evidence: FlightProviderContactAuthorizationEvidence = {}) {
  const gates = flightProviderContactAuthorizationGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: FLIGHT_PROVIDER_CONTACT_AUTHORIZATION_MODE,
    planState: "design_only" as const,
    providerPathPreferenceState: "recorded" as const,
    primaryProviderPath: "duffel" as const,
    secondaryProviderPath: "sabre" as const,
    parallelLaunchState: "not_authorized" as const,
    contactAuthorizationState: "blocked" as const,
    actionTimeDecisionState: "not_recorded" as const,
    contactPurposeState: "not_bound" as const,
    senderState: "not_assigned" as const,
    approverState: "not_assigned" as const,
    messageState: "not_created" as const,
    disclosureState: "not_approved" as const,
    recipientState: "not_recorded" as const,
    channelState: "not_approved" as const,
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
    authorizationDesignComplete: completedCount === gates.length,
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
