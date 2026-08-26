import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildFlightConsumerProductionStripePaymentIntentPlan,
  FlightConsumerProductionStripePaymentIntentPlanError,
} from "../lib/flights/consumer-production/stripe-payment-intent-plan.server";
import { resolveFlightRuntimePolicy } from "../lib/flights/runtime-safety";

const digest = (value: string) => value.repeat(64).slice(0, 64);

function input() {
  return {
    orderId: "00000000-0000-4000-8000-000000000001",
    customerId: "00000000-0000-4000-8000-000000000002",
    paymentAttemptId: "00000000-0000-4000-8000-000000000003",
    authoritativeAmountCents: 25_000,
    paymentAmountCents: 25_000,
    currency: "USD" as const,
    executionScopeSha256: digest("1"),
    offerEvidenceSha256: digest("2"),
    repriceEvidenceSha256: digest("3"),
    orderPlanSha256: digest("4"),
    orderRequestEnvelopeSha256: digest("5"),
    paymentBinding: {
      processorId: "stripe_live" as const,
      adapterVersion: "22.4.0",
      adapterSourceDigest: digest("6"),
      accountScopeReceiptDigest: digest("7"),
      environmentScopeReceiptDigest: digest("8"),
    },
  };
}

describe("Flight Consumer Production zero-dispatch Stripe PaymentIntent plan", () => {
  it("builds deterministic manual-capture evidence without granting authority", () => {
    const first = buildFlightConsumerProductionStripePaymentIntentPlan(input());
    const second = buildFlightConsumerProductionStripePaymentIntentPlan(input());

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      version: "flight-consumer-production-stripe-payment-intent-plan-v1",
      mode: "zero_dispatch",
      amountCents: 25_000,
      currency: "usd",
      captureMethod: "manual",
      confirmationMethod: "automatic",
      paymentMethodTypes: ["card"],
      paymentBindingSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      orderReferenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      customerReferenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      paymentAttemptReferenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      metadataSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      requestBodySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      requestEnvelopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      idempotencyRequestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      idempotencyKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      planSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
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
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.paymentMethodTypes)).toBe(true);
  });

  it("pins a processor identifier accepted by the canonical runtime binding parser", () => {
    const binding = input().paymentBinding;
    const policy = resolveFlightRuntimePolicy({
      FLIGHT_PAYMENT_PROCESSOR_ID: binding.processorId,
      FLIGHT_PAYMENT_ADAPTER_VERSION: binding.adapterVersion,
      FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256: binding.adapterSourceDigest,
      FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256: binding.accountScopeReceiptDigest,
      FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256:
        binding.environmentScopeReceiptDigest,
    });

    expect(policy.paymentBinding).toEqual(binding);
    expect(policy.invalidSettings).not.toContain(
      "FLIGHT_PAYMENT_PROCESSOR_ID is malformed.",
    );
  });

  it("changes the aggregate evidence for every bound input", () => {
    const base = input();
    const expected = buildFlightConsumerProductionStripePaymentIntentPlan(base).planSha256;
    const changes = [
      { ...base, orderId: "00000000-0000-4000-8000-000000000011" },
      { ...base, customerId: "00000000-0000-4000-8000-000000000012" },
      { ...base, paymentAttemptId: "00000000-0000-4000-8000-000000000013" },
      { ...base, authoritativeAmountCents: 26_000, paymentAmountCents: 26_000 },
      { ...base, executionScopeSha256: digest("9") },
      { ...base, offerEvidenceSha256: digest("a") },
      { ...base, repriceEvidenceSha256: digest("b") },
      { ...base, orderPlanSha256: digest("c") },
      { ...base, orderRequestEnvelopeSha256: digest("d") },
      { ...base, paymentBinding: { ...base.paymentBinding, adapterVersion: "22.4.1" } },
      { ...base, paymentBinding: { ...base.paymentBinding, adapterSourceDigest: digest("e") } },
      { ...base, paymentBinding: { ...base.paymentBinding, accountScopeReceiptDigest: digest("f") } },
      { ...base, paymentBinding: { ...base.paymentBinding, environmentScopeReceiptDigest: digest("0") } },
    ];

    for (const changed of changes) {
      expect(buildFlightConsumerProductionStripePaymentIntentPlan(changed).planSha256)
        .not.toBe(expected);
    }
  });

  it("rejects amount drift, non-USD input, malformed bindings, duplicate identities, and extra fields", () => {
    const base = input();
    const refused = [
      { ...base, paymentAmountCents: 24_999 },
      { ...base, currency: "EUR" },
      { ...base, paymentAmountCents: 49, authoritativeAmountCents: 49 },
      { ...base, customerId: base.orderId },
      { ...base, paymentBinding: { ...base.paymentBinding, processorId: "other" } },
      { ...base, paymentBinding: { ...base.paymentBinding, adapterVersion: "latest" } },
      { ...base, paymentBinding: { ...base.paymentBinding, accountScopeReceiptDigest: "bad" } },
      { ...base, cardNumber: "4242424242424242" },
      { ...base, paymentMethodId: "pm_not_allowed" },
      { ...base, clientSecret: "pi_not_allowed_secret_value" },
      { ...base, paymentIntentId: "pi_not_allowed" },
      { ...base, metadata: { caller: "supplied" } },
      { ...base, paymentBinding: { ...base.paymentBinding, secretKey: "sk_live_not_allowed" } },
    ];

    for (const value of refused) {
      expect(() => buildFlightConsumerProductionStripePaymentIntentPlan(value))
        .toThrow(FlightConsumerProductionStripePaymentIntentPlanError);
    }
  });

  it("returns hashes and audit posture without raw identifiers, provider references, or secrets", () => {
    const base = input();
    const serialized = JSON.stringify(
      buildFlightConsumerProductionStripePaymentIntentPlan(base),
    );

    expect(serialized).not.toContain(base.orderId);
    expect(serialized).not.toContain(base.customerId);
    expect(serialized).not.toContain(base.paymentAttemptId);
    expect(serialized).not.toMatch(/(?:pi|pm|ch|re)_[A-Za-z0-9_]+/);
    expect(serialized).not.toMatch(/(?:sk|rk)_(?:live|test)_/);
    expect(serialized).not.toMatch(/_secret_/);
    expect(serialized).not.toContain("flt_v1_");
    expect(serialized).not.toContain("4242424242424242");
  });

  it("keeps the source outside SDK, transport, environment, persistence, and Preview paths", () => {
    const source = readFileSync(
      new URL(
        "../lib/flights/consumer-production/stripe-payment-intent-plan.server.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*(?:supabase|preview)[^"']*["']/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bprocess\.env\b/);
    expect(source).not.toMatch(/\bpaymentIntents\.(?:create|capture|cancel|retrieve)\b/);
    expect(source).not.toMatch(/\brefunds\.create\b|\bcreateAdminClient\b/);
    expect(source).not.toMatch(/\bAuthorization\b|\bclient_secret\b|\bpayment_method\b/);
    expect(source).toContain('path: "/v1/payment_intents"');
    expect(source).toContain('capture_method: "manual"');
    expect(source).toContain('confirmation_method: "automatic"');
    expect(source).toContain('payment_method_types: ["card"]');
  });
});
