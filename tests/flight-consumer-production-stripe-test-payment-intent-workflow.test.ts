import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildFlightConsumerProductionStripeTestWorkflowFoundation,
  classifyFlightConsumerProductionStripeTestFailureRecovery,
  createFlightConsumerProductionStripeTestWorkflowAuthority,
  deriveFlightConsumerProductionStripeTestAccountSha256,
  deriveFlightConsumerProductionStripeTestCredentialSha256,
  deriveFlightConsumerProductionStripeTestWebhookSecretSha256,
  evaluateFlightConsumerProductionStripeTestObservation,
  FlightConsumerProductionStripeTestWorkflowError,
} from "../lib/flights/consumer-production/stripe-test-payment-intent-workflow.server";

const digest = (value: string) => value.repeat(64).slice(0, 64);
const restrictedTestKey = `rk_test_${"T".repeat(32)}`;
const stripeAccountId = "acct_1234567890abcdef";
const webhookTestSecret = `whsec_${"W".repeat(32)}`;

function authorityInput() {
  return {
    restrictedTestKey,
    stripeAccountId,
    webhookTestSecret,
    approvedCredentialSha256:
      deriveFlightConsumerProductionStripeTestCredentialSha256(
        restrictedTestKey,
      ),
    approvedAccountSha256:
      deriveFlightConsumerProductionStripeTestAccountSha256(stripeAccountId),
    approvedWebhookSecretSha256:
      deriveFlightConsumerProductionStripeTestWebhookSecretSha256(
        webhookTestSecret,
      ),
    scopeNonceSha256: digest("1"),
    paymentBinding: {
      processorId: "stripe_test" as const,
      adapterVersion: "22.4.0",
      adapterSourceDigest: digest("2"),
      accountScopeReceiptDigest: digest("3"),
      environmentScopeReceiptDigest: digest("4"),
    },
    contractPlanningEnabled: true as const,
    providerDispatchEnabled: false as const,
    liveModeEnabled: false as const,
    productionPaymentEnabled: false as const,
    captureEnabled: false as const,
    orderEnabled: false as const,
    ticketingEnabled: false as const,
    consumerReleaseEnabled: false as const,
    transactionKillSwitchEngaged: true as const,
  };
}

function foundationInput() {
  return {
    orderId: "00000000-0000-4000-8000-000000000001",
    customerId: "00000000-0000-4000-8000-000000000002",
    paymentAttemptId: "00000000-0000-4000-8000-000000000003",
    authoritativeAmountCents: 25_000,
    paymentAmountCents: 25_000,
    currency: "USD" as const,
    offerEvidenceSha256: digest("5"),
    repriceEvidenceSha256: digest("6"),
    orderPlanSha256: digest("7"),
    orderRequestEnvelopeSha256: digest("8"),
  };
}

function buildFoundation(input = foundationInput()) {
  const authority = createFlightConsumerProductionStripeTestWorkflowAuthority(
    authorityInput(),
  );
  const foundation =
    buildFlightConsumerProductionStripeTestWorkflowFoundation(
      authority,
      input,
    );
  return { authority, foundation };
}

type Foundation = ReturnType<
  typeof buildFlightConsumerProductionStripeTestWorkflowFoundation
>;

function retrieveCandidate(
  foundation: Foundation,
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "requires_capture"
    | "canceled"
    | "succeeded" = "requires_capture",
) {
  const authorized = status === "requires_capture";
  const captured = status === "succeeded";
  return {
    source: "stripe_retrieve" as const,
    callerClaimsWebhookSignatureVerified: false,
    webhookEventIdSha256: null,
    webhookEventType: null,
    paymentIntentReferenceSha256: digest("9"),
    livemode: false,
    amountCents: foundation.amountCents,
    amountCapturableCents: authorized ? foundation.amountCents : 0,
    amountReceivedCents: captured ? foundation.amountCents : 0,
    amountRefundedCents: 0,
    currency: "usd",
    captureMethod: "manual" as const,
    confirmationMethod: "automatic" as const,
    status,
    metadataSha256: foundation.metadataSha256,
    callerClaimsLatestChargeMatches: authorized || captured,
    disputed: false,
  };
}

function recoveryInput(
  foundation: Foundation,
  changes: Readonly<Record<string, unknown>> = {},
) {
  return {
    operation: "create_payment_intent",
    paymentAttemptReferenceSha256: foundation.paymentAttemptReferenceSha256,
    plannedIdempotencyRequestSha256:
      foundation.plannedIdempotencyRequestSha256,
    plannedIdempotencyKeySha256: foundation.plannedIdempotencyKeySha256,
    dispatchState: "not_started",
    providerOutcome: "not_observed",
    journalState: "absent",
    leaseState: "not_applicable",
    reconciliationState: "not_run",
    reconciliationEvidenceSha256: null,
    ...changes,
  };
}

describe("Flight Consumer Production Stripe TEST PaymentIntent workflow foundation", () => {
  it("issues only self-consistent local contract authority", () => {
    const first = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );
    const second = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      version: "flight-consumer-production-stripe-test-workflow-authority-v2",
      mode: "test_contract_only",
      processorCode: "stripe",
      processorEnvironment: "test",
      executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      paymentBindingSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      accountSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      credentialInputsSelfConsistent: true,
      webhookSecretInputsSelfConsistent: true,
      providerVerificationPerformed: false,
      allowedOperations: [
        "plan_payment_intent",
        "classify_webhook_candidate",
        "classify_retrieve_candidate",
        "describe_refund_requirements",
        "classify_payment_intent_recovery",
      ],
      providerDispatchEnabled: false,
      liveModeEnabled: false,
      productionPaymentEnabled: false,
      captureEnabled: false,
      orderEnabled: false,
      ticketingEnabled: false,
      consumerReleaseEnabled: false,
      transactionKillSwitchEngaged: true,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.allowedOperations)).toBe(true);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain(restrictedTestKey);
    expect(serialized).not.toContain(stripeAccountId);
    expect(serialized).not.toContain(webhookTestSecret);
  });

  it("binds local authority evidence to every supplied scope input", () => {
    const base = authorityInput();
    const expected = createFlightConsumerProductionStripeTestWorkflowAuthority(
      base,
    ).executionScopeSha256;
    const changed = [
      { ...base, scopeNonceSha256: digest("a") },
      {
        ...base,
        restrictedTestKey: `rk_test_${"R".repeat(32)}`,
        approvedCredentialSha256:
          deriveFlightConsumerProductionStripeTestCredentialSha256(
            `rk_test_${"R".repeat(32)}`,
          ),
      },
      {
        ...base,
        stripeAccountId: "acct_fedcba0987654321",
        approvedAccountSha256:
          deriveFlightConsumerProductionStripeTestAccountSha256(
            "acct_fedcba0987654321",
          ),
      },
      {
        ...base,
        webhookTestSecret: `whsec_${"V".repeat(32)}`,
        approvedWebhookSecretSha256:
          deriveFlightConsumerProductionStripeTestWebhookSecretSha256(
            `whsec_${"V".repeat(32)}`,
          ),
      },
      {
        ...base,
        paymentBinding: {
          ...base.paymentBinding,
          adapterSourceDigest: digest("b"),
        },
      },
    ];
    for (const input of changed) {
      expect(
        createFlightConsumerProductionStripeTestWorkflowAuthority(input)
          .executionScopeSha256,
      ).not.toBe(expected);
    }
  });

  it("fails closed for live, generic, mismatched, operational, and forged authority", () => {
    const base = authorityInput();
    const refused = [
      { ...base, restrictedTestKey: `rk_live_${"L".repeat(32)}` },
      { ...base, restrictedTestKey: `sk_test_${"S".repeat(32)}` },
      { ...base, webhookTestSecret: "not-a-webhook-secret" },
      { ...base, approvedCredentialSha256: digest("0") },
      { ...base, approvedAccountSha256: digest("0") },
      { ...base, approvedWebhookSecretSha256: digest("0") },
      {
        ...base,
        paymentBinding: { ...base.paymentBinding, processorId: "stripe_live" },
      },
      {
        ...base,
        paymentBinding: { ...base.paymentBinding, rawCredential: "not_allowed" },
      },
      { ...base, providerDispatchEnabled: true },
      { ...base, liveModeEnabled: true },
      { ...base, productionPaymentEnabled: true },
      { ...base, captureEnabled: true },
      { ...base, orderEnabled: true },
      { ...base, ticketingEnabled: true },
      { ...base, consumerReleaseEnabled: true },
      { ...base, transactionKillSwitchEngaged: false },
    ];
    for (const input of refused) {
      expect(() =>
        createFlightConsumerProductionStripeTestWorkflowAuthority(input)
      ).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    }

    const issued = createFlightConsumerProductionStripeTestWorkflowAuthority(base);
    expect(() => buildFlightConsumerProductionStripeTestWorkflowFoundation(
      { ...issued } as typeof issued,
      foundationInput(),
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
  });

  it("builds deterministic request evidence without persistence or capability", () => {
    const { authority, foundation } = buildFoundation();
    const repeated = buildFlightConsumerProductionStripeTestWorkflowFoundation(
      authority,
      foundationInput(),
    );

    expect(repeated).toEqual(foundation);
    expect(foundation).toMatchObject({
      version: "flight-consumer-production-stripe-test-workflow-foundation-v2",
      mode: "test_contract_only",
      amountCents: 25_000,
      currency: "usd",
      captureMethod: "manual",
      confirmationMethod: "automatic",
      paymentMethodTypes: ["card"],
      plannedIdempotencyRequestSha256:
        expect.stringMatching(/^[0-9a-f]{64}$/),
      plannedIdempotencyKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      webhook: {
        futureRawBodyVerificationRequired: true,
        callerSignatureClaimIsAuthentication: false,
        trustedSignatureVerifierAvailable: false,
        livemodeRequired: false,
        futureDurableEventDeduplicationRequired: true,
        durableEventDeduplicationAvailable: false,
        candidateOnly: true,
      },
      reconciliation: {
        futureSourceOfTruth: "trusted_stripe_retrieve_adapter",
        trustedAdapterAvailable: false,
        callerProjectionCanAuthorize: false,
        paymentIntentReferenceBindingAvailable: false,
        latestChargeRequiredForCapture: true,
        refundAndDisputeInspectionRequired: true,
        mismatchDisposition: "manual_review",
      },
      refund: {
        planningAvailable: false,
        unavailableReason: "trusted_adapter_and_persistence_not_implemented",
        futureCapturedPaymentAttestationRequired: true,
        futureExactAmountRequired: true,
        futureDistinctIdempotencyKeyRequired: true,
        dispatchEnabled: false,
      },
      recovery: {
        classificationOnly: true,
        paymentAttemptBindingRequired: true,
        plannedIdempotencyBindingRequired: true,
        inProgressRetryRequiresExpiredLeaseAndProviderAbsence: true,
        blindRetryEnabled: false,
        refundRecoveryAvailable: false,
      },
      persistence: {
        target: "none",
        durableAttemptStateAvailable: false,
        migration103CompatibilityImplemented: false,
        migration103JournalWriteAvailable: false,
      },
      providerRequestCount: 0,
      stripeRequestCount: 0,
      stripeMutationCount: 0,
      paymentIntentCount: 0,
      chargeCount: 0,
      refundCount: 0,
      externalRequestMade: false,
      rawPaymentMethodAccepted: false,
      clientSecretExposed: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      orderAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
    });
    expect(new Set(foundation.webhook.allowedEvents).size).toBe(6);
    expect(Object.isFrozen(foundation.webhook.allowedEvents)).toBe(true);
  });

  it("changes workflow evidence for every authoritative input", () => {
    const authority = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );
    const base = foundationInput();
    const expected = buildFlightConsumerProductionStripeTestWorkflowFoundation(
      authority,
      base,
    ).workflowSha256;
    const changed = [
      { ...base, orderId: "00000000-0000-4000-8000-000000000011" },
      { ...base, customerId: "00000000-0000-4000-8000-000000000012" },
      { ...base, paymentAttemptId: "00000000-0000-4000-8000-000000000013" },
      { ...base, authoritativeAmountCents: 26_000, paymentAmountCents: 26_000 },
      { ...base, offerEvidenceSha256: digest("a") },
      { ...base, repriceEvidenceSha256: digest("b") },
      { ...base, orderPlanSha256: digest("c") },
      { ...base, orderRequestEnvelopeSha256: digest("d") },
    ];
    for (const input of changed) {
      expect(buildFlightConsumerProductionStripeTestWorkflowFoundation(
        authority,
        input,
      ).workflowSha256).not.toBe(expected);
    }
  });

  it("rejects amount drift, duplicate identities, sensitive fields, and malformed evidence", () => {
    const authority = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );
    const base = foundationInput();
    const refused = [
      { ...base, paymentAmountCents: 24_999 },
      { ...base, currency: "EUR" },
      { ...base, customerId: base.orderId },
      { ...base, offerEvidenceSha256: "bad" },
      { ...base, paymentMethodId: "pm_not_allowed" },
      { ...base, paymentIntentId: "pi_not_allowed" },
      { ...base, clientSecret: "pi_not_allowed_secret_value" },
      { ...base, cardNumber: "4242424242424242" },
    ];
    for (const input of refused) {
      expect(() => buildFlightConsumerProductionStripeTestWorkflowFoundation(
        authority,
        input,
      )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    }
  });

  it.each([
    ["requires_payment_method", "awaiting_payment_method"],
    ["requires_confirmation", "awaiting_confirmation"],
    ["requires_action", "action_required"],
    ["processing", "processing"],
    ["requires_capture", "authorization_candidate"],
    ["canceled", "canceled"],
    ["succeeded", "capture_candidate"],
  ] as const)("keeps Stripe state %s explicit as %s", (status, state) => {
    const { authority, foundation } = buildFoundation();
    const result = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      retrieveCandidate(foundation, status),
    );
    expect(result).toMatchObject({
      state,
      disposition: "candidate_only",
      reason: "caller_asserted_untrusted_evidence",
      trustedAdapterEvidence: false,
      webhookAuthenticated: false,
      paymentIntentReferenceBound: false,
      refundPlanningAvailable: false,
      providerMutationAuthorized: false,
      orderAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
    });
  });

  it.each(["requires_capture", "succeeded"] as const)(
    "quarantines %s without latest-charge attestation",
    (status) => {
      const { authority, foundation } = buildFoundation();
      const candidate = retrieveCandidate(foundation, status);
      expect(evaluateFlightConsumerProductionStripeTestObservation(
        authority,
        foundation,
        { ...candidate, callerClaimsLatestChargeMatches: false },
      )).toMatchObject({
        disposition: "quarantined",
        reason: "latest_charge_attestation_missing",
        refundPlanningAvailable: false,
      });
    },
  );

  it("classifies caller-asserted webhook candidates without authenticating them", () => {
    const { authority, foundation } = buildFoundation();
    const webhook = {
      ...retrieveCandidate(foundation, "requires_payment_method"),
      source: "stripe_webhook",
      callerClaimsWebhookSignatureVerified: true,
      webhookEventIdSha256: digest("a"),
      webhookEventType: "payment_intent.payment_failed",
    };
    const claimed = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      webhook,
    );
    const unclaimed = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      { ...webhook, callerClaimsWebhookSignatureVerified: false },
    );

    expect(claimed).toMatchObject({
      state: "payment_failed",
      disposition: "candidate_only",
      reason: "caller_asserted_untrusted_evidence",
      webhookAuthenticated: false,
      trustedAdapterEvidence: false,
      paymentIntentReferenceBound: false,
      refundPlanningAvailable: false,
    });
    expect(unclaimed).toMatchObject({
      disposition: "quarantined",
      reason: "webhook_signature_untrusted",
      webhookAuthenticated: false,
    });
  });

  it("never binds a caller-projected PaymentIntent reference", () => {
    const { authority, foundation } = buildFoundation();
    const first = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      retrieveCandidate(foundation, "succeeded"),
    );
    const second = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      {
        ...retrieveCandidate(foundation, "succeeded"),
        paymentIntentReferenceSha256: digest("a"),
      },
    );
    for (const result of [first, second]) {
      expect(result).toMatchObject({
        state: "capture_candidate",
        disposition: "candidate_only",
        paymentIntentReferenceBound: false,
        trustedAdapterEvidence: false,
        refundPlanningAvailable: false,
      });
    }
    expect(second.evidenceSha256).not.toBe(first.evidenceSha256);
  });

  it.each([
    ["live mode", { livemode: true }, "live_mode_refused"],
    ["amount drift", { amountCents: 24_999 }, "binding_mismatch"],
    ["currency drift", { currency: "eur" }, "binding_mismatch"],
    ["metadata drift", { metadataSha256: digest("f") }, "binding_mismatch"],
    ["automatic capture", { captureMethod: "automatic" }, "binding_mismatch"],
    ["refund observed", { amountRefundedCents: 1 }, "refund_or_dispute_observed"],
    ["dispute observed", { disputed: true }, "refund_or_dispute_observed"],
    ["capturable drift", { amountCapturableCents: 1 }, "capture_state_mismatch"],
  ])("quarantines %s candidates", (_label, change, reason) => {
    const { authority, foundation } = buildFoundation();
    expect(evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      { ...retrieveCandidate(foundation), ...change },
    )).toMatchObject({ disposition: "quarantined", reason });
  });

  it("quarantines webhook event/status conflicts and refund events", () => {
    const { authority, foundation } = buildFoundation();
    const base = {
      ...retrieveCandidate(foundation),
      source: "stripe_webhook",
      callerClaimsWebhookSignatureVerified: true,
      webhookEventIdSha256: digest("a"),
    };
    expect(evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      { ...base, webhookEventType: "payment_intent.succeeded" },
    )).toMatchObject({
      disposition: "quarantined",
      reason: "webhook_event_mismatch",
    });
    expect(evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      { ...base, webhookEventType: "charge.refunded" },
    )).toMatchObject({
      disposition: "quarantined",
      reason: "refund_or_dispute_observed",
    });
  });

  it("rejects malformed candidate projections and extra provider data", () => {
    const { authority, foundation } = buildFoundation();
    const base = retrieveCandidate(foundation);
    const refused = [
      { ...base, callerClaimsWebhookSignatureVerified: true },
      { ...base, paymentIntentId: "pi_raw_not_allowed" },
      { ...base, latestChargeId: "ch_raw_not_allowed" },
      { ...base, clientSecret: "pi_secret_not_allowed" },
      {
        ...base,
        source: "stripe_webhook",
        webhookEventIdSha256: null,
        webhookEventType: null,
      },
    ];
    for (const candidate of refused) {
      expect(() => evaluateFlightConsumerProductionStripeTestObservation(
        authority,
        foundation,
        candidate,
      )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    }
  });

  it("keeps refund planning unavailable until trusted adapter and persistence exist", () => {
    const { authority, foundation } = buildFoundation();
    const captureCandidate = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      retrieveCandidate(foundation, "succeeded"),
    );
    expect(captureCandidate).toMatchObject({
      state: "capture_candidate",
      disposition: "candidate_only",
      trustedAdapterEvidence: false,
      paymentIntentReferenceBound: false,
      refundPlanningAvailable: false,
    });
    expect(foundation.refund).toMatchObject({
      planningAvailable: false,
      dispatchEnabled: false,
    });
  });

  it("classifies a never-started attempt as same-key retry evidence only", () => {
    const { authority, foundation } = buildFoundation();
    expect(classifyFlightConsumerProductionStripeTestFailureRecovery(
      authority,
      foundation,
      recoveryInput(foundation),
    )).toMatchObject({
      version: "flight-consumer-production-stripe-test-failure-recovery-v2",
      nextStep: "retry_same_idempotency_key",
      sameIdempotencyKeyRequired: true,
      blindRetryAuthorized: false,
      providerDispatchAuthorized: false,
      classificationOnly: true,
      persistenceAvailable: false,
      paymentAttemptReferenceSha256: foundation.paymentAttemptReferenceSha256,
      plannedIdempotencyRequestSha256:
        foundation.plannedIdempotencyRequestSha256,
      plannedIdempotencyKeySha256: foundation.plannedIdempotencyKeySha256,
      evidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("never retries an in-progress attempt without expired-lease and absence evidence", () => {
    const { authority, foundation } = buildFoundation();
    const active = classifyFlightConsumerProductionStripeTestFailureRecovery(
      authority,
      foundation,
      recoveryInput(foundation, {
        journalState: "in_progress",
        leaseState: "active",
      }),
    );
    const expiredUnreconciled =
      classifyFlightConsumerProductionStripeTestFailureRecovery(
        authority,
        foundation,
        recoveryInput(foundation, {
          journalState: "in_progress",
          leaseState: "expired_attested",
        }),
      );
    const expiredAndAbsent =
      classifyFlightConsumerProductionStripeTestFailureRecovery(
        authority,
        foundation,
        recoveryInput(foundation, {
          journalState: "in_progress",
          leaseState: "expired_attested",
          reconciliationState: "provider_absence_attested",
          reconciliationEvidenceSha256: digest("a"),
        }),
      );

    expect(active.nextStep).toBe("reconcile_before_retry");
    expect(expiredUnreconciled.nextStep).toBe("reconcile_before_retry");
    expect(expiredAndAbsent.nextStep).toBe("retry_same_idempotency_key");
    for (const result of [active, expiredUnreconciled, expiredAndAbsent]) {
      expect(result.providerDispatchAuthorized).toBe(false);
      expect(result.blindRetryAuthorized).toBe(false);
      expect(result.persistenceAvailable).toBe(false);
    }
  });

  it.each([
    [
      {
        dispatchState: "started",
        journalState: "ambiguous",
      },
      "reconcile_before_retry",
    ],
    [
      {
        dispatchState: "response_received",
        providerOutcome: "pending",
        journalState: "ambiguous",
      },
      "reconcile_before_retry",
    ],
    [
      {
        dispatchState: "response_received",
        providerOutcome: "success",
        journalState: "succeeded",
      },
      "return_recorded_success",
    ],
    [
      {
        dispatchState: "response_received",
        providerOutcome: "definitive_failure",
        journalState: "failed",
      },
      "return_recorded_failure",
    ],
    [
      {
        dispatchState: "response_received",
        providerOutcome: "definitive_failure",
        journalState: "in_progress",
        leaseState: "active",
      },
      "manual_review",
    ],
  ])("classifies bound recovery evidence %#", (change, nextStep) => {
    const { authority, foundation } = buildFoundation();
    expect(classifyFlightConsumerProductionStripeTestFailureRecovery(
      authority,
      foundation,
      recoveryInput(foundation, change),
    ).nextStep).toBe(nextStep);
  });

  it("rejects wrong attempt/idempotency/foundation bindings", () => {
    const first = buildFoundation();
    const second = buildFoundation({
      ...foundationInput(),
      orderId: "00000000-0000-4000-8000-000000000011",
    });
    const refused = [
      recoveryInput(first.foundation, {
        paymentAttemptReferenceSha256: digest("a"),
      }),
      recoveryInput(first.foundation, {
        plannedIdempotencyRequestSha256: digest("b"),
      }),
      recoveryInput(first.foundation, {
        plannedIdempotencyKeySha256: digest("c"),
      }),
    ];
    for (const input of refused) {
      expect(() => classifyFlightConsumerProductionStripeTestFailureRecovery(
        first.authority,
        first.foundation,
        input,
      )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    }
    expect(() => classifyFlightConsumerProductionStripeTestFailureRecovery(
      second.authority,
      second.foundation,
      recoveryInput(first.foundation),
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
  });

  it.each([
    { dispatchState: "not_started", providerOutcome: "success" },
    { dispatchState: "started", providerOutcome: "pending" },
    { dispatchState: "response_received", providerOutcome: "not_observed" },
    { journalState: "succeeded", providerOutcome: "pending" },
    { journalState: "failed", providerOutcome: "success" },
    { journalState: "in_progress", leaseState: "not_applicable" },
    { journalState: "absent", leaseState: "active" },
    { reconciliationState: "not_run", reconciliationEvidenceSha256: digest("a") },
    {
      providerOutcome: "success",
      dispatchState: "response_received",
      reconciliationState: "provider_absence_attested",
      reconciliationEvidenceSha256: digest("b"),
    },
    { extraRetryFlag: true },
  ])("rejects impossible or over-specified recovery evidence %#", (change) => {
    const { authority, foundation } = buildFoundation();
    expect(() => classifyFlightConsumerProductionStripeTestFailureRecovery(
      authority,
      foundation,
      recoveryInput(foundation, change),
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
  });

  it("keeps every output digest-only", () => {
    const { authority, foundation } = buildFoundation();
    const candidate = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      retrieveCandidate(foundation, "succeeded"),
    );
    const recovery = classifyFlightConsumerProductionStripeTestFailureRecovery(
      authority,
      foundation,
      recoveryInput(foundation),
    );
    const serialized = JSON.stringify({
      authority,
      foundation,
      candidate,
      recovery,
    });
    for (const raw of [
      restrictedTestKey,
      stripeAccountId,
      webhookTestSecret,
      foundationInput().orderId,
      foundationInput().customerId,
      foundationInput().paymentAttemptId,
    ]) expect(serialized).not.toContain(raw);
    expect(serialized).not.toMatch(/:"(?:pi|pm|ch|re|evt)_[A-Za-z0-9_]+/);
    expect(serialized).not.toMatch(/(?:sk|rk)_(?:live|test)_/);
    expect(serialized).not.toMatch(/whsec_|_secret_/);
    expect(serialized).not.toContain("4242424242424242");
  });

  it("has no SDK, transport, env, route, persistence, refund plan, or release path", () => {
    const source = readFileSync(
      new URL(
        "../lib/flights/consumer-production/stripe-test-payment-intent-workflow.server.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*(?:supabase|preview)[^"']*["']/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bprocess\.env\b/);
    expect(source).not.toMatch(/\bpaymentIntents\.(?:create|capture|cancel|retrieve)\b/);
    expect(source).not.toMatch(/\brefunds\.create\b|\bcreateAdminClient\b/);
    expect(source).not.toMatch(/NextResponse|NextRequest|redirect\s*\(/);
    expect(source).not.toContain("buildFlightConsumerProductionStripeTestRefundPlan");
    expect(source).not.toContain('path: "/v1/refunds"');
    expect(source).toContain('path: "/v1/payment_intents"');
    expect(source).toContain('capture_method: "manual"');
    expect(source).toContain('migration103CompatibilityImplemented: false');
    expect(source).toContain('target: "none"');
  });
});
