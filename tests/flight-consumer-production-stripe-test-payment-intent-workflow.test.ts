import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildFlightConsumerProductionStripeTestRefundPlan,
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

function buildFoundation() {
  const authority = createFlightConsumerProductionStripeTestWorkflowAuthority(
    authorityInput(),
  );
  const foundation =
    buildFlightConsumerProductionStripeTestWorkflowFoundation(
      authority,
      foundationInput(),
    );
  return { authority, foundation };
}

function retrieveObservation(
  foundation: ReturnType<
    typeof buildFlightConsumerProductionStripeTestWorkflowFoundation
  >,
) {
  return {
    source: "stripe_retrieve" as const,
    webhookSignatureVerified: false,
    webhookEventIdSha256: null,
    webhookEventType: null,
    paymentIntentReferenceSha256: digest("9"),
    livemode: false,
    amountCents: foundation.amountCents,
    amountCapturableCents: foundation.amountCents,
    amountReceivedCents: 0,
    amountRefundedCents: 0,
    currency: "usd",
    captureMethod: "manual" as const,
    confirmationMethod: "automatic" as const,
    status: "requires_capture" as const,
    metadataSha256: foundation.metadataSha256,
    latestChargeMatches: false,
    disputed: false,
  };
}

describe("Flight Consumer Production Stripe TEST PaymentIntent workflow foundation", () => {
  it("issues a test-only, contract-only authority without exposing credentials", () => {
    const first = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );
    const second = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      version: "flight-consumer-production-stripe-test-workflow-authority-v1",
      mode: "test_contract_only",
      processorCode: "stripe",
      processorEnvironment: "test",
      executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      paymentBindingSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      accountSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      credentialBindingMatched: true,
      webhookSecretBindingMatched: true,
      allowedOperations: [
        "plan_payment_intent",
        "evaluate_test_webhook",
        "reconcile_test_payment",
        "plan_test_refund",
        "classify_test_failure",
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

  it("binds authority to exact credential, account, webhook, scope, and adapter evidence", () => {
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
      { ...base, providerDispatchEnabled: true },
      { ...base, liveModeEnabled: true },
      { ...base, productionPaymentEnabled: true },
      { ...base, captureEnabled: true },
      { ...base, orderEnabled: true },
      { ...base, ticketingEnabled: true },
      { ...base, consumerReleaseEnabled: true },
      { ...base, transactionKillSwitchEngaged: false },
      { ...base, secretKey: restrictedTestKey },
    ];

    for (const input of refused) {
      expect(() =>
        createFlightConsumerProductionStripeTestWorkflowAuthority(input)
      ).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    }

    const issued = createFlightConsumerProductionStripeTestWorkflowAuthority(base);
    const forged = { ...issued } as typeof issued;
    expect(() =>
      buildFlightConsumerProductionStripeTestWorkflowFoundation(
        forged,
        foundationInput(),
      )
    ).toThrow(FlightConsumerProductionStripeTestWorkflowError);
  });

  it("builds deterministic manual-capture TEST contracts with no execution authority", () => {
    const authority = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );
    const first = buildFlightConsumerProductionStripeTestWorkflowFoundation(
      authority,
      foundationInput(),
    );
    const second = buildFlightConsumerProductionStripeTestWorkflowFoundation(
      authority,
      foundationInput(),
    );

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      version: "flight-consumer-production-stripe-test-workflow-foundation-v1",
      mode: "test_contract_only",
      amountCents: 25_000,
      currency: "usd",
      captureMethod: "manual",
      confirmationMethod: "automatic",
      paymentMethodTypes: ["card"],
      executionScopeSha256: authority.executionScopeSha256,
      paymentBindingSha256: authority.paymentBindingSha256,
      workflowSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      webhook: {
        rawBodyRequired: true,
        stripeSignatureRequired: true,
        signatureToleranceSeconds: 300,
        livemodeRequired: false,
        eventIdIdempotencyRequired: true,
        outOfOrderStrategy: "retrieve_then_reconcile",
      },
      reconciliation: {
        sourceOfTruth: "stripe_retrieve_payment_intent",
        exactBindingRequired: true,
        latestChargeRequiredForCapture: true,
        refundAndDisputeInspectionRequired: true,
        mismatchDisposition: "manual_review",
      },
      refund: {
        capturedPaymentRequired: true,
        exactAmountRequired: true,
        distinctIdempotencyKeyRequired: true,
        pendingRequiresReconciliation: true,
        dispatchEnabled: false,
      },
      recovery: {
        sameIdempotencyKeyRequired: true,
        ambiguousDispatchRequiresReconciliation: true,
        blindRetryEnabled: false,
        journalFailureRequiresReconciliation: true,
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
    expect(new Set(first.webhook.allowedEvents).size).toBe(6);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.webhook.allowedEvents)).toBe(true);
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

  it("rejects amount drift, duplicate identities, prohibited fields, and malformed evidence", () => {
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
      { ...base, credential: restrictedTestKey },
    ];
    for (const input of refused) {
      expect(() =>
        buildFlightConsumerProductionStripeTestWorkflowFoundation(
          authority,
          input,
        )
      ).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    }
  });

  it("evaluates signed webhook and retrieve observations without granting mutations", () => {
    const { authority, foundation } = buildFoundation();
    const authorized = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      retrieveObservation(foundation),
    );
    const captured = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      {
        ...retrieveObservation(foundation),
        amountCapturableCents: 0,
        amountReceivedCents: foundation.amountCents,
        status: "succeeded",
        latestChargeMatches: true,
      },
    );
    const pending = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      {
        ...retrieveObservation(foundation),
        amountCapturableCents: 0,
        status: "processing",
      },
    );
    const webhook = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      {
        ...retrieveObservation(foundation),
        source: "stripe_webhook",
        webhookSignatureVerified: true,
        webhookEventIdSha256: digest("a"),
        webhookEventType: "payment_intent.amount_capturable_updated",
      },
    );
    const inconsistentWebhook =
      evaluateFlightConsumerProductionStripeTestObservation(
        authority,
        foundation,
        {
          ...retrieveObservation(foundation),
          source: "stripe_webhook",
          webhookSignatureVerified: true,
          webhookEventIdSha256: digest("b"),
          webhookEventType: "payment_intent.succeeded",
        },
      );
    const refundWebhook = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      {
        ...retrieveObservation(foundation),
        source: "stripe_webhook",
        webhookSignatureVerified: true,
        webhookEventIdSha256: digest("c"),
        webhookEventType: "charge.refunded",
      },
    );

    expect(authorized).toMatchObject({
      decision: "authorized",
      reason: "matched_authorized",
      providerMutationAuthorized: false,
      orderAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
    });
    expect(captured).toMatchObject({
      decision: "captured",
      reason: "matched_captured",
    });
    expect(pending).toMatchObject({
      decision: "pending",
      reason: "matched_pending",
    });
    expect(webhook).toMatchObject({
      source: "stripe_webhook",
      decision: "authorized",
    });
    expect(inconsistentWebhook).toMatchObject({
      decision: "quarantined",
      reason: "webhook_event_mismatch",
    });
    expect(refundWebhook).toMatchObject({
      decision: "quarantined",
      reason: "refund_or_dispute_observed",
    });
    expect(Object.isFrozen(captured)).toBe(true);
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
  ])("quarantines %s observations", (_label, change, reason) => {
    const { authority, foundation } = buildFoundation();
    expect(evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      { ...retrieveObservation(foundation), ...change },
    )).toMatchObject({ decision: "quarantined", reason });
  });

  it("rejects unsigned webhooks, webhook fields on retrieves, and extra provider data", () => {
    const { authority, foundation } = buildFoundation();
    const base = retrieveObservation(foundation);
    const refused = [
      {
        ...base,
        source: "stripe_webhook",
        webhookEventIdSha256: digest("a"),
        webhookEventType: "payment_intent.amount_capturable_updated",
      },
      {
        ...base,
        webhookSignatureVerified: true,
        webhookEventIdSha256: digest("a"),
        webhookEventType: "payment_intent.succeeded",
      },
      { ...base, paymentIntentId: "pi_raw_not_allowed" },
      { ...base, latestChargeId: "ch_raw_not_allowed" },
      { ...base, clientSecret: "pi_secret_not_allowed" },
    ];
    for (const observation of refused) {
      expect(() => evaluateFlightConsumerProductionStripeTestObservation(
        authority,
        foundation,
        observation,
      )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    }
  });

  it("plans an exact full TEST refund only from a matched captured observation", () => {
    const { authority, foundation } = buildFoundation();
    const captured = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      {
        ...retrieveObservation(foundation),
        amountCapturableCents: 0,
        amountReceivedCents: foundation.amountCents,
        status: "succeeded",
        latestChargeMatches: true,
      },
    );
    const refund = buildFlightConsumerProductionStripeTestRefundPlan(
      authority,
      foundation,
      captured,
      {
        refundAttemptId: "00000000-0000-4000-8000-000000000004",
        refundAmountCents: foundation.amountCents,
        reason: "requested_by_customer",
      },
    );

    expect(refund).toMatchObject({
      version: "flight-consumer-production-stripe-test-refund-plan-v1",
      mode: "test_contract_only",
      amountCents: 25_000,
      currency: "usd",
      paymentIntentReferenceSha256: captured.paymentIntentReferenceSha256,
      refundAttemptReferenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      requestBodySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      requestEnvelopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      idempotencyRequestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      idempotencyKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      refundPlanSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      dispatchEnabled: false,
      refundAuthorized: false,
      providerRequestCount: 0,
      refundCount: 0,
      externalRequestMade: false,
      consumerReleaseEnabled: false,
    });
    expect(refund.idempotencyKeySha256)
      .not.toBe(foundation.idempotencyKeySha256);
    expect(Object.isFrozen(refund)).toBe(true);
  });

  it("refuses partial refunds, non-captured evidence, cross-workflow evidence, and extra fields", () => {
    const first = buildFoundation();
    const second = buildFoundation();
    const authorized = evaluateFlightConsumerProductionStripeTestObservation(
      first.authority,
      first.foundation,
      retrieveObservation(first.foundation),
    );
    const captured = evaluateFlightConsumerProductionStripeTestObservation(
      first.authority,
      first.foundation,
      {
        ...retrieveObservation(first.foundation),
        amountCapturableCents: 0,
        amountReceivedCents: first.foundation.amountCents,
        status: "succeeded",
        latestChargeMatches: true,
      },
    );
    const valid = {
      refundAttemptId: "00000000-0000-4000-8000-000000000004",
      refundAmountCents: first.foundation.amountCents,
      reason: "duplicate" as const,
    };

    expect(() => buildFlightConsumerProductionStripeTestRefundPlan(
      first.authority,
      first.foundation,
      authorized,
      valid,
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    expect(() => buildFlightConsumerProductionStripeTestRefundPlan(
      second.authority,
      second.foundation,
      captured,
      valid,
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    expect(() => buildFlightConsumerProductionStripeTestRefundPlan(
      first.authority,
      first.foundation,
      captured,
      { ...valid, refundAmountCents: 10_000 },
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    expect(() => buildFlightConsumerProductionStripeTestRefundPlan(
      first.authority,
      first.foundation,
      captured,
      { ...valid, refundId: "re_not_allowed" },
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
  });

  it.each([
    [
      { operation: "create_payment_intent", dispatchState: "not_started", providerOutcome: "not_observed", journalState: "absent" },
      "retry_same_idempotency_key",
    ],
    [
      { operation: "create_payment_intent", dispatchState: "started", providerOutcome: "not_observed", journalState: "ambiguous" },
      "reconcile_before_retry",
    ],
    [
      { operation: "refund_payment", dispatchState: "response_received", providerOutcome: "pending", journalState: "in_progress" },
      "reconcile_before_retry",
    ],
    [
      { operation: "create_payment_intent", dispatchState: "response_received", providerOutcome: "success", journalState: "succeeded" },
      "return_recorded_success",
    ],
    [
      { operation: "refund_payment", dispatchState: "response_received", providerOutcome: "definitive_failure", journalState: "failed" },
      "return_recorded_failure",
    ],
    [
      { operation: "create_payment_intent", dispatchState: "response_received", providerOutcome: "definitive_failure", journalState: "in_progress" },
      "manual_review",
    ],
  ])("classifies failure recovery without authorizing blind retry %#", (input, nextStep) => {
    const authority = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );
    expect(classifyFlightConsumerProductionStripeTestFailureRecovery(
      authority,
      input,
    )).toMatchObject({
      nextStep,
      sameIdempotencyKeyRequired: true,
      blindRetryAuthorized: false,
      providerDispatchAuthorized: false,
      evidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("refuses inconsistent recovery evidence and forged authority", () => {
    const authority = createFlightConsumerProductionStripeTestWorkflowAuthority(
      authorityInput(),
    );
    const forged = { ...authority } as typeof authority;
    const valid = {
      operation: "create_payment_intent",
      dispatchState: "not_started",
      providerOutcome: "not_observed",
      journalState: "absent",
    };
    expect(() => classifyFlightConsumerProductionStripeTestFailureRecovery(
      forged,
      valid,
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    expect(() => classifyFlightConsumerProductionStripeTestFailureRecovery(
      authority,
      {
        operation: "create_payment_intent",
        dispatchState: "not_started",
        providerOutcome: "success",
        journalState: "absent",
      },
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
    expect(() => classifyFlightConsumerProductionStripeTestFailureRecovery(
      authority,
      { ...valid, retryWithNewKey: true },
    )).toThrow(FlightConsumerProductionStripeTestWorkflowError);
  });

  it("keeps all outputs digest-only and free of raw identities, references, and secrets", () => {
    const { authority, foundation } = buildFoundation();
    const captured = evaluateFlightConsumerProductionStripeTestObservation(
      authority,
      foundation,
      {
        ...retrieveObservation(foundation),
        amountCapturableCents: 0,
        amountReceivedCents: foundation.amountCents,
        status: "succeeded",
        latestChargeMatches: true,
      },
    );
    const serialized = JSON.stringify({ authority, foundation, captured });
    for (const raw of [
      restrictedTestKey,
      stripeAccountId,
      webhookTestSecret,
      ...Object.values(foundationInput()).filter((value) =>
        typeof value === "string" && value.includes("-")),
    ]) expect(serialized).not.toContain(raw);
    expect(serialized).not.toMatch(/(?:pi|pm|ch|re|evt)_[A-Za-z0-9_]+/);
    expect(serialized).not.toMatch(/(?:sk|rk)_(?:live|test)_/);
    expect(serialized).not.toMatch(/whsec_|_secret_/);
    expect(serialized).not.toContain("4242424242424242");
  });

  it("has no Stripe SDK, transport, env, route, persistence, or release path", () => {
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
    expect(source).toContain('path: "/v1/payment_intents"');
    expect(source).toContain('path: "/v1/refunds"');
    expect(source).toContain('capture_method: "manual"');
    expect(source).toContain('expectedLivemode: false');
  });
});
