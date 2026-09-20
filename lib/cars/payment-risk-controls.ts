export const CAR_RENTAL_PAYMENT_RISK_MODE = "payment_risk_contract_only" as const;

export const carRentalPaymentCollectionModels = ["pay_now", "pay_at_counter"] as const;
export const carRentalDepositStates = ["not_required", "disclosed", "unknown"] as const;
export const carRentalAuthorizationHoldStates = ["not_required", "disclosed", "unknown"] as const;
export const carRentalFraudReviewStates = ["clear", "blocked", "manual_review"] as const;
export const carRentalChargebackStates = ["not_applicable", "open", "resolved_customer", "resolved_merchant", "manual_review"] as const;
export const carRentalRefundEvidenceStates = ["not_applicable", "pending", "recorded", "rejected", "manual_review"] as const;
export const carRentalTaxDisclosureStates = ["itemized", "included_unitemized", "unknown"] as const;
export const carRentalReceiptReconciliationStates = ["not_available", "pending", "matched", "mismatched", "manual_review"] as const;

export const carRentalPaymentRiskRecordedFields = [
  "payment_risk_id",
  "lifecycle_id",
  "quote_id",
  "policy_fingerprint",
  "collection_model",
  "currency",
  "quoted_total_minor",
  "payable_now_minor",
  "payable_at_counter_minor",
  "deposit_state",
  "deposit_minor",
  "authorization_hold_state",
  "authorization_hold_minor",
  "fraud_review_state",
  "chargeback_state",
  "refundable_total_minor",
  "refund_evidence_state",
  "refund_evidence_minor",
  "tax_disclosure_state",
  "taxes_minor",
  "receipt_reconciliation_state",
  "receipt_total_minor",
  "receipt_taxes_minor",
] as const;

export const carRentalPaymentRiskProhibitedFields = [
  "payment_card_number",
  "payment_security_code",
  "payment_expiration",
  "bank_account_number",
  "payment_token",
  "billing_name",
  "billing_address",
  "traveler_email",
  "raw_processor_reference",
  "raw_supplier_reference",
  "provider_credentials",
] as const;

export type CarRentalPaymentCollectionModel = (typeof carRentalPaymentCollectionModels)[number];
export type CarRentalDepositState = (typeof carRentalDepositStates)[number];
export type CarRentalAuthorizationHoldState = (typeof carRentalAuthorizationHoldStates)[number];
export type CarRentalFraudReviewState = (typeof carRentalFraudReviewStates)[number];
export type CarRentalChargebackState = (typeof carRentalChargebackStates)[number];
export type CarRentalRefundEvidenceState = (typeof carRentalRefundEvidenceStates)[number];
export type CarRentalTaxDisclosureState = (typeof carRentalTaxDisclosureStates)[number];
export type CarRentalReceiptReconciliationState = (typeof carRentalReceiptReconciliationStates)[number];
export type CarRentalPaymentRiskRecordedField = (typeof carRentalPaymentRiskRecordedFields)[number];

export type CarRentalPaymentRiskContract = {
  id: "payment_timing" | "deposit" | "authorization_hold" | "fraud" | "chargeback" | "refund" | "currency" | "tax" | "receipt";
  label: string;
  requiredFields: readonly string[];
  validationRule: string;
  safetyBoundary: string;
};

export const carRentalPaymentRiskContracts: readonly CarRentalPaymentRiskContract[] = [
  { id: "payment_timing", label: "Pay-now versus pay-at-counter", requiredFields: ["Collection model", "Quoted total", "Exact split"], validationRule: "Reconcile one explicit synthetic collection model to the exact quoted-total split using integer minor units.", safetyBoundary: "A local payment-timing classification cannot collect, authorize, capture, or promise payment." },
  { id: "deposit", label: "Deposit disclosure", requiredFields: ["Deposit state", "Integer minor units", "Currency"], validationRule: "Preserve not-required, disclosed, and unknown deposit states and reject inconsistent synthetic amounts.", safetyBoundary: "A disclosed fixture is not a deposit request, charge, receipt, or supplier requirement." },
  { id: "authorization_hold", label: "Authorization-hold disclosure", requiredFields: ["Hold state", "Integer minor units", "Currency"], validationRule: "Preserve not-required, disclosed, and unknown hold states without inferring a payment instrument or available funds.", safetyBoundary: "A synthetic hold amount never places, adjusts, releases, or guarantees an authorization hold." },
  { id: "fraud", label: "Fraud-review outcome", requiredFields: ["Clear, blocked, or manual review", "No identity data", "No payment data"], validationRule: "Retain explicit clear, blocked, and manual-review outcomes while failing readiness closed for unresolved or blocked evidence.", safetyBoundary: "A local outcome is neither a fraud decision nor permission to collect personal or payment data." },
  { id: "chargeback", label: "Chargeback state", requiredFields: ["Applicable model", "Controlled state", "No processor reference"], validationRule: "Preserve not-applicable, open, resolved, and manual-review states and reject chargeback claims for pay-at-counter fixtures.", safetyBoundary: "A contract state cannot file, accept, contest, settle, or represent a chargeback." },
  { id: "refund", label: "Refund reconciliation", requiredFields: ["Refund state", "Refundable bound", "Integer minor units"], validationRule: "Bound recorded synthetic refund evidence to the refundable total and preserve pending, rejected, or manual-review states without money movement.", safetyBoundary: "Refund evidence is accounting-only and cannot issue funds, credit a payment instrument, or prove reimbursement." },
  { id: "currency", label: "Currency integrity", requiredFields: ["ISO-style code", "Single record currency", "Minor-unit arithmetic"], validationRule: "Require one three-letter uppercase currency and safe integer arithmetic for every synthetic monetary value.", safetyBoundary: "Currency validation is format checking only and is not foreign-exchange pricing or settlement." },
  { id: "tax", label: "Tax disclosure", requiredFields: ["Disclosure state", "Itemized amount when known", "Quoted-total bound"], validationRule: "Preserve itemized, included-unitemized, and unknown tax states while rejecting contradictory synthetic amounts.", safetyBoundary: "A tax fixture is not tax advice, filing, collection authority, or proof of supplier tax treatment." },
  { id: "receipt", label: "Receipt accuracy", requiredFields: ["Reconciliation state", "Exact total", "Exact itemized tax"], validationRule: "Match synthetic receipt totals and itemized tax to the canonical quote or preserve pending, unavailable, mismatched, and manual-review states.", safetyBoundary: "A matched fixture is not a processor receipt, supplier receipt, proof of payment, or settlement evidence." },
];

export type CarRentalPaymentRiskGate = {
  id:
    | "contract_approved"
    | "payment_timing_reviewed"
    | "deposit_reviewed"
    | "authorization_hold_reviewed"
    | "fraud_reviewed"
    | "chargeback_reviewed"
    | "refund_reviewed"
    | "currency_and_tax_reviewed"
    | "receipt_reconciliation_reviewed"
    | "field_minimization_reviewed"
    | "fixtures_and_rejections_approved"
    | "live_money_movement_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalPaymentRiskGates: readonly CarRentalPaymentRiskGate[] = [
  { id: "contract_approved", label: "Payment and risk contract approved", owner: "Engineering + Product", detail: "Approve the provider-neutral record shape, controlled states, integer-minor-unit rules, and non-transactional wording." },
  { id: "payment_timing_reviewed", label: "Payment timing reviewed", owner: "Product + Finance", detail: "Verify pay-now and pay-at-counter semantics, exact total allocation, and no collection or capture authority." },
  { id: "deposit_reviewed", label: "Deposit behavior reviewed", owner: "Finance + Legal", detail: "Preserve disclosed, not-required, and unknown states without claiming a supplier requirement or collecting money." },
  { id: "authorization_hold_reviewed", label: "Authorization-hold behavior reviewed", owner: "Finance + Risk", detail: "Verify amount-state consistency without card data, issuer traffic, funds checks, hold placement, or release." },
  { id: "fraud_reviewed", label: "Fraud boundary reviewed", owner: "Risk + Privacy", detail: "Preserve clear, blocked, and manual-review outcomes without identity evidence, profiling, or an operational fraud decision." },
  { id: "chargeback_reviewed", label: "Chargeback boundary reviewed", owner: "Finance + Legal", detail: "Verify controlled states and pay-at-counter rejection without filing, contesting, settling, or accepting disputes." },
  { id: "refund_reviewed", label: "Refund reconciliation reviewed", owner: "Finance + Support", detail: "Verify refundable bounds and explicit unresolved outcomes while keeping refund execution and money movement disabled." },
  { id: "currency_and_tax_reviewed", label: "Currency and tax reviewed", owner: "Finance + Legal", detail: "Require one uppercase currency, safe integer arithmetic, explicit tax disclosure, and no tax-advice claim." },
  { id: "receipt_reconciliation_reviewed", label: "Receipt reconciliation reviewed", owner: "Finance + Audit", detail: "Verify exact quote and tax reconciliation or preserve unavailable, pending, mismatched, and manual-review states." },
  { id: "field_minimization_reviewed", label: "Payment-data minimization reviewed", owner: "Security + Privacy", detail: "Confirm the exact allowlist and reject card, bank, token, billing, identity, raw reference, and credential data." },
  { id: "fixtures_and_rejections_approved", label: "Sanitized fixtures and rejections approved", owner: "Engineering + Security", detail: "Review only synthetic pay-now, pay-at-counter, and refund-reconciliation fixtures plus fail-closed cases." },
  { id: "live_money_movement_authorized", label: "Live money movement separately authorized", owner: "Release approvers", detail: "Require provider rights, payment and legal approval, security review, sandbox certification, monitoring, support, and a separate Production decision." },
];

export type CarRentalPaymentRiskEvidence = Partial<Record<CarRentalPaymentRiskGate["id"], boolean>>;

export function buildCarRentalPaymentRiskPlan(evidence: CarRentalPaymentRiskEvidence = {}) {
  const gates = carRentalPaymentRiskGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_PAYMENT_RISK_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    contractReviewComplete: completedCount === gates.length,
    supplierContactAuthorized: false,
    providerMappingCreated: false,
    credentialAcceptanceAuthorized: false,
    externalTrafficAuthorized: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    reservationAuthorized: false,
    paymentCollectionAuthorized: false,
    paymentCaptureAuthorized: false,
    authorizationHoldAuthorized: false,
    depositCollectionAuthorized: false,
    refundExecutionAuthorized: false,
    chargebackActionAuthorized: false,
  } as const;
}

export type CarRentalCanonicalPaymentRiskRecord = {
  paymentRiskId: string;
  lifecycleId: string;
  quoteId: string;
  policyFingerprint: string;
  collectionModel: CarRentalPaymentCollectionModel;
  currency: string;
  quotedTotalMinor: number;
  payableNowMinor: number;
  payableAtCounterMinor: number;
  depositState: CarRentalDepositState;
  depositMinor: number | null;
  authorizationHoldState: CarRentalAuthorizationHoldState;
  authorizationHoldMinor: number | null;
  fraudReviewState: CarRentalFraudReviewState;
  chargebackState: CarRentalChargebackState;
  refundableTotalMinor: number;
  refundEvidenceState: CarRentalRefundEvidenceState;
  refundEvidenceMinor: number;
  taxDisclosureState: CarRentalTaxDisclosureState;
  taxesMinor: number | null;
  receiptReconciliationState: CarRentalReceiptReconciliationState;
  receiptTotalMinor: number | null;
  receiptTaxesMinor: number | null;
  recordedFields: readonly string[];
  prohibitedDataDetected: boolean;
};

function isStableToken(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function isSha256Digest(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

function isNonNegativeMinor(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isOptionalNonNegativeMinor(value: number | null) {
  return value === null || isNonNegativeMinor(value);
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function validateDisclosureAmount(label: string, state: CarRentalDepositState | CarRentalAuthorizationHoldState, amount: number | null, errors: string[]) {
  if (!isOptionalNonNegativeMinor(amount)) errors.push(`${label} must be null or a non-negative integer in minor units.`);
  if (state === "not_required" && amount !== 0) errors.push(`${label} must be zero when the disclosure state is not required.`);
  if (state === "disclosed" && !isNonNegativeMinor(amount as number)) errors.push(`${label} must be a non-negative integer when disclosed.`);
  if (state === "unknown" && amount !== null) errors.push(`${label} must be null when the disclosure state is unknown.`);
}

export function validateCarRentalPaymentRiskRecord(record: CarRentalCanonicalPaymentRiskRecord) {
  const errors: string[] = [];

  if (!isStableToken(record.paymentRiskId)) errors.push("Payment-risk ID must be a stable opaque token.");
  if (!isStableToken(record.lifecycleId)) errors.push("Lifecycle ID must be a stable opaque token.");
  if (!isStableToken(record.quoteId)) errors.push("Quote ID must be a stable opaque token.");
  if (!isSha256Digest(record.policyFingerprint)) errors.push("Policy fingerprint must be a lowercase 64-character digest.");
  if (!carRentalPaymentCollectionModels.includes(record.collectionModel)) errors.push("Payment collection model is not supported.");
  if (!/^[A-Z]{3}$/.test(record.currency)) errors.push("Currency must be a three-letter uppercase code.");

  for (const [label, value] of [
    ["Quoted total", record.quotedTotalMinor],
    ["Payable-now total", record.payableNowMinor],
    ["Payable-at-counter total", record.payableAtCounterMinor],
    ["Refundable total", record.refundableTotalMinor],
    ["Refund evidence total", record.refundEvidenceMinor],
  ] as const) {
    if (!isNonNegativeMinor(value)) errors.push(`${label} must be a non-negative integer in minor units.`);
  }

  if (isNonNegativeMinor(record.quotedTotalMinor) && isNonNegativeMinor(record.payableNowMinor) && isNonNegativeMinor(record.payableAtCounterMinor) && record.payableNowMinor + record.payableAtCounterMinor !== record.quotedTotalMinor) {
    errors.push("Payable-now and payable-at-counter totals must exactly reconcile to the quoted total.");
  }
  if (record.collectionModel === "pay_now" && (record.payableNowMinor !== record.quotedTotalMinor || record.payableAtCounterMinor !== 0)) errors.push("Pay-now records must allocate the full quoted total to payable now.");
  if (record.collectionModel === "pay_at_counter" && (record.payableNowMinor !== 0 || record.payableAtCounterMinor !== record.quotedTotalMinor)) errors.push("Pay-at-counter records must allocate the full quoted total to the counter.");

  if (!carRentalDepositStates.includes(record.depositState)) errors.push("Deposit disclosure state is not supported.");
  if (!carRentalAuthorizationHoldStates.includes(record.authorizationHoldState)) errors.push("Authorization-hold disclosure state is not supported.");
  validateDisclosureAmount("Deposit amount", record.depositState, record.depositMinor, errors);
  validateDisclosureAmount("Authorization-hold amount", record.authorizationHoldState, record.authorizationHoldMinor, errors);

  if (!carRentalFraudReviewStates.includes(record.fraudReviewState)) errors.push("Fraud-review state is not supported.");
  if (!carRentalChargebackStates.includes(record.chargebackState)) errors.push("Chargeback state is not supported.");
  if (record.collectionModel === "pay_at_counter" && record.chargebackState !== "not_applicable") errors.push("Pay-at-counter records cannot claim a platform chargeback state.");

  if (isNonNegativeMinor(record.refundableTotalMinor) && isNonNegativeMinor(record.quotedTotalMinor) && record.refundableTotalMinor > record.quotedTotalMinor) errors.push("Refundable total cannot exceed the quoted total.");
  if (!carRentalRefundEvidenceStates.includes(record.refundEvidenceState)) errors.push("Refund evidence state is not supported.");
  if (record.refundEvidenceState === "recorded") {
    if (!Number.isSafeInteger(record.refundEvidenceMinor) || record.refundEvidenceMinor <= 0) errors.push("Recorded refund evidence must be a positive integer in minor units.");
    if (isNonNegativeMinor(record.refundableTotalMinor) && record.refundEvidenceMinor > record.refundableTotalMinor) errors.push("Recorded refund evidence cannot exceed the refundable total.");
  } else if (record.refundEvidenceMinor !== 0) {
    errors.push("Only a recorded refund state can contain a refund evidence amount.");
  }

  if (!carRentalTaxDisclosureStates.includes(record.taxDisclosureState)) errors.push("Tax disclosure state is not supported.");
  if (!isOptionalNonNegativeMinor(record.taxesMinor)) errors.push("Taxes must be null or a non-negative integer in minor units.");
  if (record.taxDisclosureState === "itemized" && !isNonNegativeMinor(record.taxesMinor as number)) errors.push("Itemized taxes must be a non-negative integer in minor units.");
  if (record.taxDisclosureState !== "itemized" && record.taxesMinor !== null) errors.push("Only itemized tax disclosure can contain a tax amount.");
  if (record.taxesMinor !== null && isNonNegativeMinor(record.quotedTotalMinor) && record.taxesMinor > record.quotedTotalMinor) errors.push("Itemized taxes cannot exceed the quoted total.");

  if (!carRentalReceiptReconciliationStates.includes(record.receiptReconciliationState)) errors.push("Receipt reconciliation state is not supported.");
  if (!isOptionalNonNegativeMinor(record.receiptTotalMinor)) errors.push("Receipt total must be null or a non-negative integer in minor units.");
  if (!isOptionalNonNegativeMinor(record.receiptTaxesMinor)) errors.push("Receipt taxes must be null or a non-negative integer in minor units.");
  const receiptHasAmounts = record.receiptTotalMinor !== null || record.receiptTaxesMinor !== null;
  if (["not_available", "pending"].includes(record.receiptReconciliationState) && receiptHasAmounts) errors.push("Unavailable or pending receipt evidence cannot contain reconciled amounts.");
  if (record.receiptReconciliationState === "matched") {
    if (record.receiptTotalMinor === null || record.receiptTaxesMinor === null) errors.push("Matched receipt evidence requires total and tax amounts.");
    if (record.receiptTotalMinor !== record.quotedTotalMinor) errors.push("Matched receipt total must equal the quoted total.");
    if (record.taxDisclosureState !== "itemized" || record.receiptTaxesMinor !== record.taxesMinor) errors.push("Matched receipt taxes require the same itemized tax amount as the quote.");
  }
  if (record.receiptReconciliationState === "mismatched" && record.receiptTotalMinor === record.quotedTotalMinor && record.receiptTaxesMinor === record.taxesMinor) errors.push("Mismatched receipt evidence must contain an actual total or tax mismatch.");

  if (record.prohibitedDataDetected) errors.push("Payment-card, bank, token, billing, identity, raw-reference, or credential data blocks payment-risk readiness.");
  if (hasDuplicates(record.recordedFields)) errors.push("Recorded-field inventory cannot contain duplicates.");
  const unsupportedFields = record.recordedFields.filter((field) => !carRentalPaymentRiskRecordedFields.includes(field as CarRentalPaymentRiskRecordedField));
  if (unsupportedFields.length > 0) errors.push("Recorded-field inventory contains unsupported or prohibited fields.");
  if (!sameValues(record.recordedFields, carRentalPaymentRiskRecordedFields)) errors.push("Recorded-field inventory must exactly match the minimized payment-risk allowlist.");

  const contractChecksSatisfied = errors.length === 0
    && record.depositState !== "unknown"
    && record.authorizationHoldState !== "unknown"
    && record.fraudReviewState === "clear"
    && !["open", "manual_review"].includes(record.chargebackState)
    && !["pending", "manual_review"].includes(record.refundEvidenceState)
    && record.taxDisclosureState === "itemized"
    && record.receiptReconciliationState === "matched";

  return {
    valid: errors.length === 0,
    contractChecksSatisfied,
    errors,
    supplierContactAuthorized: false,
    providerMappingCreated: false,
    credentialAcceptanceAuthorized: false,
    externalTrafficAuthorized: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    reservationAuthorized: false,
    paymentCollectionAuthorized: false,
    paymentCaptureAuthorized: false,
    authorizationHoldAuthorized: false,
    depositCollectionAuthorized: false,
    refundExecutionAuthorized: false,
    chargebackActionAuthorized: false,
  } as const;
}

const recordedFields = [...carRentalPaymentRiskRecordedFields];

export const carRentalPaymentRiskFixtures: readonly CarRentalCanonicalPaymentRiskRecord[] = [
  {
    paymentRiskId: "payment_risk_pay_now_demo_0001",
    lifecycleId: "lifecycle_payment_demo_0001",
    quoteId: "quote_payment_demo_0001",
    policyFingerprint: "1".repeat(64),
    collectionModel: "pay_now",
    currency: "USD",
    quotedTotalMinor: 48350,
    payableNowMinor: 48350,
    payableAtCounterMinor: 0,
    depositState: "not_required",
    depositMinor: 0,
    authorizationHoldState: "not_required",
    authorizationHoldMinor: 0,
    fraudReviewState: "clear",
    chargebackState: "not_applicable",
    refundableTotalMinor: 44000,
    refundEvidenceState: "not_applicable",
    refundEvidenceMinor: 0,
    taxDisclosureState: "itemized",
    taxesMinor: 4350,
    receiptReconciliationState: "matched",
    receiptTotalMinor: 48350,
    receiptTaxesMinor: 4350,
    recordedFields,
    prohibitedDataDetected: false,
  },
  {
    paymentRiskId: "payment_risk_counter_demo_0002",
    lifecycleId: "lifecycle_payment_demo_0002",
    quoteId: "quote_payment_demo_0002",
    policyFingerprint: "2".repeat(64),
    collectionModel: "pay_at_counter",
    currency: "USD",
    quotedTotalMinor: 72100,
    payableNowMinor: 0,
    payableAtCounterMinor: 72100,
    depositState: "disclosed",
    depositMinor: 25000,
    authorizationHoldState: "disclosed",
    authorizationHoldMinor: 50000,
    fraudReviewState: "clear",
    chargebackState: "not_applicable",
    refundableTotalMinor: 60000,
    refundEvidenceState: "not_applicable",
    refundEvidenceMinor: 0,
    taxDisclosureState: "itemized",
    taxesMinor: 6100,
    receiptReconciliationState: "matched",
    receiptTotalMinor: 72100,
    receiptTaxesMinor: 6100,
    recordedFields,
    prohibitedDataDetected: false,
  },
  {
    paymentRiskId: "payment_risk_refund_demo_0003",
    lifecycleId: "lifecycle_payment_demo_0003",
    quoteId: "quote_payment_demo_0003",
    policyFingerprint: "3".repeat(64),
    collectionModel: "pay_now",
    currency: "USD",
    quotedTotalMinor: 50000,
    payableNowMinor: 50000,
    payableAtCounterMinor: 0,
    depositState: "not_required",
    depositMinor: 0,
    authorizationHoldState: "not_required",
    authorizationHoldMinor: 0,
    fraudReviewState: "clear",
    chargebackState: "not_applicable",
    refundableTotalMinor: 50000,
    refundEvidenceState: "recorded",
    refundEvidenceMinor: 25000,
    taxDisclosureState: "itemized",
    taxesMinor: 4000,
    receiptReconciliationState: "matched",
    receiptTotalMinor: 50000,
    receiptTaxesMinor: 4000,
    recordedFields,
    prohibitedDataDetected: false,
  },
];
