export const CAR_RENTAL_PROVIDER_ADAPTER_CERTIFICATION_MODE = "provider_adapter_certification_offline_only" as const;

export const carRentalAdapterOperationKinds = [
  "location_read",
  "availability_read",
  "quote_read",
  "reprice_check",
  "reservation_create_fixture",
  "reservation_modify_fixture",
  "reservation_cancel_fixture",
  "reservation_read",
  "refund_reconcile_fixture",
  "webhook_verify_fixture",
] as const;

export const carRentalAdapterScopeLabels = [
  "read_locations",
  "read_availability",
  "read_quotes",
  "write_reservations_fixture",
  "read_reservations",
  "reconcile_refunds_fixture",
  "verify_webhooks_fixture",
] as const;

export const carRentalAdapterResultStates = ["contract_ready", "rejected", "manual_review"] as const;
export const carRentalAdapterResponseOutcomes = ["success", "client_error", "server_error", "timeout"] as const;
export const carRentalAdapterRetryOutcomes = ["not_required", "retry_recorded", "stopped", "manual_review"] as const;
export const carRentalAdapterWebhookStates = ["not_applicable", "verified_fixture", "rejected_fixture", "manual_review"] as const;
export const carRentalAdapterKillSwitchStates = ["engaged", "released"] as const;

export const carRentalAdapterRecordedFields = [
  "certification_case_id",
  "adapter_contract_id",
  "adapter_version",
  "environment_mode",
  "operation_kind",
  "scope_labels",
  "request_digest",
  "response_digest",
  "idempotency_digest",
  "attempt_count",
  "max_attempts",
  "timeout_ms",
  "result_state",
  "response_outcome",
  "retry_outcome",
  "webhook_state",
  "audit_evidence_digest",
  "application_kill_switch_state",
  "database_kill_switch_state",
] as const;

export const carRentalAdapterProhibitedFields = [
  "provider_name",
  "supplier_name",
  "live_endpoint",
  "api_key",
  "client_secret",
  "access_token",
  "refresh_token",
  "credential_value",
  "raw_request",
  "raw_response",
  "raw_webhook_payload",
  "traveler_identity",
  "driver_license",
  "payment_card",
  "bank_account",
  "precise_location",
  "live_reservation_reference",
] as const;

export type CarRentalAdapterOperationKind = (typeof carRentalAdapterOperationKinds)[number];
export type CarRentalAdapterScopeLabel = (typeof carRentalAdapterScopeLabels)[number];
export type CarRentalAdapterResultState = (typeof carRentalAdapterResultStates)[number];
export type CarRentalAdapterResponseOutcome = (typeof carRentalAdapterResponseOutcomes)[number];
export type CarRentalAdapterRetryOutcome = (typeof carRentalAdapterRetryOutcomes)[number];
export type CarRentalAdapterWebhookState = (typeof carRentalAdapterWebhookStates)[number];
export type CarRentalAdapterKillSwitchState = (typeof carRentalAdapterKillSwitchStates)[number];
export type CarRentalAdapterRecordedField = (typeof carRentalAdapterRecordedFields)[number];

export type CarRentalProviderAdapterContract = {
  id: "adapter_identity" | "operation_allowlist" | "credential_scope" | "idempotency" | "retry_policy" | "timeout_policy" | "webhook_integrity" | "audit_evidence" | "dual_kill_switch";
  label: string;
  requiredFields: readonly string[];
  validationRule: string;
  safetyBoundary: string;
};

export const carRentalProviderAdapterContracts: readonly CarRentalProviderAdapterContract[] = [
  { id: "adapter_identity", label: "Adapter identity and version", requiredFields: ["Opaque contract ID", "Semantic version", "Offline environment"], validationRule: "Bind every fixture to one provider-neutral contract identifier, semantic version, and offline-fixture environment.", safetyBoundary: "An adapter contract is not a provider selection, integration, account, endpoint, credential, or connection." },
  { id: "operation_allowlist", label: "Operation allowlist", requiredFields: ["Controlled operation kind", "Exact scope label", "No arbitrary action"], validationRule: "Accept only the ten documented read, mutation-shaped fixture, reconciliation, and webhook-verification operation kinds.", safetyBoundary: "An allowlisted fixture describes a test shape only and cannot call, reserve, cancel, refund, or mutate anything." },
  { id: "credential_scope", label: "Credential-scope manifest", requiredFields: ["Non-secret scope label", "Exact operation binding", "No credential value"], validationRule: "Require exactly one documented scope label while prohibiting keys, secrets, tokens, credential material, and endpoints.", safetyBoundary: "A scope label is not a credential request, credential receipt, permission grant, account, or provider authorization." },
  { id: "idempotency", label: "Idempotency evidence", requiredFields: ["Digest-only key evidence", "Mutation-shaped fixtures only", "No raw key"], validationRule: "Require a lowercase SHA-256 digest for reservation and refund mutation-shaped fixtures and prohibit it on read-only fixtures.", safetyBoundary: "Digest evidence cannot create or replay a supplier request, reservation, cancellation, modification, or refund." },
  { id: "retry_policy", label: "Retry policy", requiredFields: ["Attempt count", "Maximum attempts", "Controlled outcome"], validationRule: "Bound attempts to three and require retry evidence to agree with attempt count and response outcome.", safetyBoundary: "A recorded retry is synthetic evidence, not an external request, job, queue item, replay, or provider call." },
  { id: "timeout_policy", label: "Timeout policy", requiredFields: ["Bounded milliseconds", "Timeout outcome", "Fail-closed disposition"], validationRule: "Require integer timeouts from 250 through 10,000 milliseconds and explicit stopped, retry-recorded, or manual-review timeout handling.", safetyBoundary: "A timeout fixture cannot open a socket, wait on a provider, infer availability, or authorize fallback traffic." },
  { id: "webhook_integrity", label: "Webhook-fixture integrity", requiredFields: ["Webhook operation binding", "Digest-only evidence", "Explicit verification state"], validationRule: "Require verified, rejected, or manual-review fixture evidence only for the webhook-verification operation.", safetyBoundary: "Webhook fixture validation does not create an endpoint, secret, subscription, receiver, acknowledgement, or external traffic path." },
  { id: "audit_evidence", label: "Audit evidence", requiredFields: ["Request digest", "Response digest", "Audit digest"], validationRule: "Retain only lowercase SHA-256 fixture digests and controlled outcomes without raw payloads or external identifiers.", safetyBoundary: "Audit digests do not prove supplier execution, sandbox certification, reservation state, payment state, or operational acceptance." },
  { id: "dual_kill_switch", label: "Dual fail-closed kill switches", requiredFields: ["Application switch engaged", "Database switch engaged", "No runtime override"], validationRule: "Require both independent traffic switches to remain engaged for every locally valid Phase 10 record.", safetyBoundary: "A local contract review cannot release either switch, enable sandbox or Production traffic, or create downstream authority." },
];

export type CarRentalProviderAdapterGate = {
  id: "contract_approved" | "identity_and_version_reviewed" | "operation_allowlist_reviewed" | "scope_manifest_reviewed" | "idempotency_reviewed" | "retry_and_timeout_reviewed" | "webhook_integrity_reviewed" | "audit_evidence_reviewed" | "field_minimization_reviewed" | "application_kill_switch_reviewed" | "database_kill_switch_reviewed" | "sandbox_certification_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalProviderAdapterGates: readonly CarRentalProviderAdapterGate[] = [
  { id: "contract_approved", label: "Provider-neutral adapter contract approved", owner: "Engineering + Architecture", detail: "Approve only the offline contract model, controlled vocabulary, exact field allowlist, and non-connection boundary." },
  { id: "identity_and_version_reviewed", label: "Adapter identity and version reviewed", owner: "Engineering + Audit", detail: "Verify opaque identity and semantic versioning without naming or selecting a provider." },
  { id: "operation_allowlist_reviewed", label: "Operation allowlist reviewed", owner: "Engineering + Product", detail: "Confirm the ten fixture-only operation kinds and reject arbitrary or live actions." },
  { id: "scope_manifest_reviewed", label: "Scope manifest reviewed", owner: "Security + Engineering", detail: "Review non-secret scope labels without requesting, storing, or accepting credential material." },
  { id: "idempotency_reviewed", label: "Idempotency behavior reviewed", owner: "Engineering + Audit", detail: "Require digest-only evidence for mutation-shaped fixtures without creating or replaying external requests." },
  { id: "retry_and_timeout_reviewed", label: "Retry and timeout behavior reviewed", owner: "Reliability + Engineering", detail: "Bound attempts and timeouts while keeping sockets, queues, jobs, fallbacks, and provider calls disabled." },
  { id: "webhook_integrity_reviewed", label: "Webhook-fixture integrity reviewed", owner: "Security + Engineering", detail: "Review digest-only fixture verification without endpoints, secrets, subscriptions, receivers, or acknowledgements." },
  { id: "audit_evidence_reviewed", label: "Audit evidence reviewed", owner: "Audit + Security", detail: "Retain controlled states and digests only; reject raw requests, responses, webhook payloads, identifiers, and secrets." },
  { id: "field_minimization_reviewed", label: "Adapter evidence minimization reviewed", owner: "Privacy + Security", detail: "Verify the exact allowlist and prohibit provider, endpoint, credential, traveler, driver, payment, location, and live-reference data." },
  { id: "application_kill_switch_reviewed", label: "Application kill switch reviewed", owner: "Engineering + Release", detail: "Require the independent application traffic switch to remain engaged." },
  { id: "database_kill_switch_reviewed", label: "Database kill switch reviewed", owner: "Data + Release", detail: "Require the independent database traffic switch to remain engaged without migrations or runtime overrides." },
  { id: "sandbox_certification_authorized", label: "Actual sandbox certification separately authorized", owner: "Independent release approvers", detail: "Require supplier rights, named adapter mapping, scoped credentials, legal and security approval, monitoring, incident response, and a separate sandbox decision." },
];

export type CarRentalProviderAdapterEvidence = Partial<Record<CarRentalProviderAdapterGate["id"], boolean>>;

export function buildCarRentalProviderAdapterPlan(evidence: CarRentalProviderAdapterEvidence = {}) {
  const gates = carRentalProviderAdapterGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_PROVIDER_ADAPTER_CERTIFICATION_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    contractReviewComplete: completedCount === gates.length,
    supplierResearchAuthorized: false,
    supplierContactAuthorized: false,
    providerSelected: false,
    providerMappingCreated: false,
    accountCreationAuthorized: false,
    credentialRequestAuthorized: false,
    credentialAcceptanceAuthorized: false,
    credentialMaterialPresent: false,
    sandboxConnectionAuthorized: false,
    sandboxCertified: false,
    externalTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    webhookReceiverAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
  } as const;
}

const requiredScopeByOperation: Record<CarRentalAdapterOperationKind, CarRentalAdapterScopeLabel> = {
  location_read: "read_locations",
  availability_read: "read_availability",
  quote_read: "read_quotes",
  reprice_check: "read_quotes",
  reservation_create_fixture: "write_reservations_fixture",
  reservation_modify_fixture: "write_reservations_fixture",
  reservation_cancel_fixture: "write_reservations_fixture",
  reservation_read: "read_reservations",
  refund_reconcile_fixture: "reconcile_refunds_fixture",
  webhook_verify_fixture: "verify_webhooks_fixture",
};

const idempotentMutationOperations: readonly CarRentalAdapterOperationKind[] = [
  "reservation_create_fixture",
  "reservation_modify_fixture",
  "reservation_cancel_fixture",
  "refund_reconcile_fixture",
];

export type CarRentalCanonicalAdapterCertificationRecord = {
  certificationCaseId: string;
  adapterContractId: string;
  adapterVersion: string;
  environmentMode: "offline_fixture";
  operationKind: CarRentalAdapterOperationKind;
  scopeLabels: readonly CarRentalAdapterScopeLabel[];
  requestDigest: string;
  responseDigest: string;
  idempotencyDigest: string | null;
  attemptCount: number;
  maxAttempts: number;
  timeoutMs: number;
  resultState: CarRentalAdapterResultState;
  responseOutcome: CarRentalAdapterResponseOutcome;
  retryOutcome: CarRentalAdapterRetryOutcome;
  webhookState: CarRentalAdapterWebhookState;
  auditEvidenceDigest: string;
  applicationKillSwitchState: CarRentalAdapterKillSwitchState;
  databaseKillSwitchState: CarRentalAdapterKillSwitchState;
  recordedFields: readonly string[];
  prohibitedDataDetected: boolean;
};

function isStableToken(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function isSemanticVersion(value: string) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function isSha256Digest(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function validateCarRentalAdapterCertificationRecord(record: CarRentalCanonicalAdapterCertificationRecord) {
  const errors: string[] = [];

  if (!isStableToken(record.certificationCaseId)) errors.push("Certification-case ID must be a stable opaque token.");
  if (!isStableToken(record.adapterContractId)) errors.push("Adapter-contract ID must be a stable opaque token.");
  if (!isSemanticVersion(record.adapterVersion)) errors.push("Adapter version must use semantic versioning.");
  if (record.environmentMode !== "offline_fixture") errors.push("Phase 10 certification evidence must remain in offline-fixture mode.");
  if (!carRentalAdapterOperationKinds.includes(record.operationKind)) errors.push("Adapter operation kind is not allowlisted.");
  if (!carRentalAdapterResultStates.includes(record.resultState)) errors.push("Adapter result state is not supported.");
  if (!carRentalAdapterResponseOutcomes.includes(record.responseOutcome)) errors.push("Adapter response outcome is not supported.");
  if (!carRentalAdapterRetryOutcomes.includes(record.retryOutcome)) errors.push("Adapter retry outcome is not supported.");
  if (!carRentalAdapterWebhookStates.includes(record.webhookState)) errors.push("Adapter webhook state is not supported.");
  if (!carRentalAdapterKillSwitchStates.includes(record.applicationKillSwitchState) || !carRentalAdapterKillSwitchStates.includes(record.databaseKillSwitchState)) errors.push("Adapter kill-switch state is not supported.");

  const requiredScope = requiredScopeByOperation[record.operationKind];
  if (hasDuplicates(record.scopeLabels)) errors.push("Scope-label inventory cannot contain duplicates.");
  if (record.scopeLabels.length !== 1 || record.scopeLabels[0] !== requiredScope) errors.push("Scope labels must exactly match the selected operation's non-secret scope manifest.");

  if (!isSha256Digest(record.requestDigest)) errors.push("Request evidence must be a lowercase 64-character digest.");
  if (!isSha256Digest(record.responseDigest)) errors.push("Response evidence must be a lowercase 64-character digest.");
  if (!isSha256Digest(record.auditEvidenceDigest)) errors.push("Audit evidence must be a lowercase 64-character digest.");

  const requiresIdempotency = idempotentMutationOperations.includes(record.operationKind);
  if (requiresIdempotency && (record.idempotencyDigest === null || !isSha256Digest(record.idempotencyDigest))) errors.push("Mutation-shaped fixtures require a lowercase 64-character idempotency digest.");
  if (!requiresIdempotency && record.idempotencyDigest !== null) errors.push("Read and webhook fixtures cannot contain idempotency evidence.");

  if (!Number.isInteger(record.attemptCount) || record.attemptCount < 1 || record.attemptCount > 3) errors.push("Attempt count must be an integer from one through three.");
  if (!Number.isInteger(record.maxAttempts) || record.maxAttempts < 1 || record.maxAttempts > 3) errors.push("Maximum attempts must be an integer from one through three.");
  if (record.attemptCount > record.maxAttempts) errors.push("Attempt count cannot exceed maximum attempts.");
  if (!Number.isInteger(record.timeoutMs) || record.timeoutMs < 250 || record.timeoutMs > 10_000) errors.push("Timeout must be an integer from 250 through 10000 milliseconds.");
  if (record.retryOutcome === "retry_recorded" && record.attemptCount < 2) errors.push("Retry-recorded evidence requires at least two attempts.");
  if (record.attemptCount > 1 && record.retryOutcome !== "retry_recorded") errors.push("Multiple attempts require retry-recorded evidence.");
  if (["server_error", "timeout"].includes(record.responseOutcome) && !["retry_recorded", "stopped", "manual_review"].includes(record.retryOutcome)) errors.push("Server-error and timeout outcomes require explicit retry, stop, or manual-review handling.");
  if (record.responseOutcome === "client_error" && !["stopped", "manual_review"].includes(record.retryOutcome)) errors.push("Client-error outcomes require stopped or manual-review handling.");

  if (record.operationKind === "webhook_verify_fixture" && record.webhookState === "not_applicable") errors.push("Webhook-verification fixtures require an explicit webhook state.");
  if (record.operationKind !== "webhook_verify_fixture" && record.webhookState !== "not_applicable") errors.push("Non-webhook fixtures must keep webhook state not applicable.");

  if (record.applicationKillSwitchState !== "engaged") errors.push("Application traffic kill switch must remain engaged.");
  if (record.databaseKillSwitchState !== "engaged") errors.push("Database traffic kill switch must remain engaged.");
  if (record.prohibitedDataDetected) errors.push("Provider, endpoint, credential, payload, identity, driver, payment, location, or live-reference data blocks adapter readiness.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  const unsupportedFields = record.recordedFields.filter((field) => !carRentalAdapterRecordedFields.includes(field as CarRentalAdapterRecordedField));
  if (unsupportedFields.length > 0) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalAdapterRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized adapter-certification allowlist.");

  if (record.resultState === "contract_ready" && record.responseOutcome !== "success") errors.push("Contract-ready fixtures require a successful synthetic response outcome.");
  if (record.resultState === "contract_ready" && !["not_required", "retry_recorded"].includes(record.retryOutcome)) errors.push("Contract-ready fixtures require a settled retry outcome.");
  if (record.resultState === "contract_ready" && record.operationKind === "webhook_verify_fixture" && record.webhookState !== "verified_fixture") errors.push("Contract-ready webhook fixtures require verified fixture evidence.");

  const valid = errors.length === 0;
  const contractChecksSatisfied = valid && record.resultState === "contract_ready";

  return {
    valid,
    contractChecksSatisfied,
    errors,
    supplierResearchAuthorized: false,
    supplierContactAuthorized: false,
    providerSelected: false,
    providerMappingCreated: false,
    accountCreationAuthorized: false,
    credentialRequestAuthorized: false,
    credentialAcceptanceAuthorized: false,
    credentialMaterialPresent: false,
    sandboxConnectionAuthorized: false,
    sandboxCertified: false,
    externalTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    webhookReceiverAuthorized: false,
    reservationMutationAuthorized: false,
    refundExecutionAuthorized: false,
    paymentAuthorized: false,
  } as const;
}

const baseRecord: Omit<CarRentalCanonicalAdapterCertificationRecord,
  "certificationCaseId" | "operationKind" | "scopeLabels" | "requestDigest" | "responseDigest" | "idempotencyDigest" | "attemptCount" | "maxAttempts" | "timeoutMs" | "retryOutcome" | "webhookState" | "auditEvidenceDigest"
> = {
  adapterContractId: "adapter-contract-neutral-001",
  adapterVersion: "1.0.0",
  environmentMode: "offline_fixture",
  resultState: "contract_ready",
  responseOutcome: "success",
  applicationKillSwitchState: "engaged",
  databaseKillSwitchState: "engaged",
  recordedFields: carRentalAdapterRecordedFields,
  prohibitedDataDetected: false,
};

export const carRentalProviderAdapterFixtures: readonly CarRentalCanonicalAdapterCertificationRecord[] = [
  {
    ...baseRecord,
    certificationCaseId: "cert-availability-0001",
    operationKind: "availability_read",
    scopeLabels: ["read_availability"],
    requestDigest: "a".repeat(64),
    responseDigest: "b".repeat(64),
    idempotencyDigest: null,
    attemptCount: 1,
    maxAttempts: 3,
    timeoutMs: 2_000,
    retryOutcome: "not_required",
    webhookState: "not_applicable",
    auditEvidenceDigest: "c".repeat(64),
  },
  {
    ...baseRecord,
    certificationCaseId: "cert-reservation-0001",
    operationKind: "reservation_create_fixture",
    scopeLabels: ["write_reservations_fixture"],
    requestDigest: "d".repeat(64),
    responseDigest: "e".repeat(64),
    idempotencyDigest: "f".repeat(64),
    attemptCount: 2,
    maxAttempts: 3,
    timeoutMs: 4_000,
    retryOutcome: "retry_recorded",
    webhookState: "not_applicable",
    auditEvidenceDigest: "1".repeat(64),
  },
  {
    ...baseRecord,
    certificationCaseId: "cert-webhook-0001",
    operationKind: "webhook_verify_fixture",
    scopeLabels: ["verify_webhooks_fixture"],
    requestDigest: "2".repeat(64),
    responseDigest: "3".repeat(64),
    idempotencyDigest: null,
    attemptCount: 1,
    maxAttempts: 1,
    timeoutMs: 1_000,
    retryOutcome: "not_required",
    webhookState: "verified_fixture",
    auditEvidenceDigest: "4".repeat(64),
  },
];
