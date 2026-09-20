import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildFlightIdempotencyIntent,
  buildFlightWebhookSigningPayload,
  canonicalFlightJson,
  digestFlightRuntimePaymentBinding,
  digestFlightRuntimeProviderBinding,
  digestFlightRuntimeSettlementBinding,
  evaluateFlightIdempotency,
  evaluateFlightRuntimeAuthorization,
  evaluateFlightWebhookReplay,
  resolveFlightRuntimePolicy,
  sha256FlightEvidence,
  verifyFlightWebhookHmac,
  FLIGHT_PRODUCTION_ACTION_AUTHORIZATION_VERSION,
  type FlightCanonicalJsonValue,
  type FlightProductionActionAuthorization,
  type FlightProductionAuthorizationVerifier,
  type FlightRuntimeProviderBinding,
  type FlightRuntimePaymentBinding,
  type FlightRuntimeSettlementBinding,
} from "../lib/flights/runtime-safety";

const syntheticEnabled = {
  FLIGHT_RUNTIME_MODE: "synthetic",
  FLIGHT_RUNTIME_ENVIRONMENT: "test",
  FLIGHT_RUNTIME_ENABLED: "true",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "true",
} as const;

const providerBinding = {
  providerId: "provider_test_0001",
  adapterVersion: "1.2.3",
  adapterSourceDigest: "a".repeat(64),
  accountScopeReceiptDigest: "b".repeat(64),
  pointOfSaleScopeReceiptDigest: "c".repeat(64),
  contentScopeReceiptDigest: "d".repeat(64),
} satisfies FlightRuntimeProviderBinding;

const providerBindingSettings = {
  FLIGHT_PROVIDER_ID: providerBinding.providerId,
  FLIGHT_PROVIDER_ADAPTER_VERSION: providerBinding.adapterVersion,
  FLIGHT_PROVIDER_ADAPTER_SOURCE_SHA256: providerBinding.adapterSourceDigest,
  FLIGHT_PROVIDER_ACCOUNT_SCOPE_SHA256: providerBinding.accountScopeReceiptDigest,
  FLIGHT_PROVIDER_POS_SCOPE_SHA256: providerBinding.pointOfSaleScopeReceiptDigest,
  FLIGHT_PROVIDER_CONTENT_SCOPE_SHA256: providerBinding.contentScopeReceiptDigest,
} as const;

const paymentBinding = {
  processorId: "processor_test_0001",
  adapterVersion: "2.3.4",
  adapterSourceDigest: "1".repeat(64),
  accountScopeReceiptDigest: "2".repeat(64),
  environmentScopeReceiptDigest: "3".repeat(64),
} satisfies FlightRuntimePaymentBinding;

const paymentBindingSettings = {
  FLIGHT_PAYMENT_PROCESSOR_ID: paymentBinding.processorId,
  FLIGHT_PAYMENT_ADAPTER_VERSION: paymentBinding.adapterVersion,
  FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256: paymentBinding.adapterSourceDigest,
  FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256: paymentBinding.accountScopeReceiptDigest,
  FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256: paymentBinding.environmentScopeReceiptDigest,
} as const;

const settlementBinding = {
  providerId: providerBinding.providerId,
  method: "provider_balance",
  accountScopeReceiptDigest: "6".repeat(64),
  environmentScopeReceiptDigest: "7".repeat(64),
  currency: "USD",
} satisfies FlightRuntimeSettlementBinding;

const settlementBindingSettings = {
  FLIGHT_SETTLEMENT_PROVIDER_ID: settlementBinding.providerId,
  FLIGHT_SETTLEMENT_METHOD: settlementBinding.method,
  FLIGHT_SETTLEMENT_ACCOUNT_SCOPE_SHA256: settlementBinding.accountScopeReceiptDigest,
  FLIGHT_SETTLEMENT_ENVIRONMENT_SCOPE_SHA256: settlementBinding.environmentScopeReceiptDigest,
  FLIGHT_SETTLEMENT_CURRENCY: settlementBinding.currency,
} as const;

const productionRequestDigest = "4".repeat(64);
const productionIdempotencyRequestDigest = "5".repeat(64);
const idempotentOperations = new Set<FlightProductionActionAuthorization["operation"]>([
  "create_order", "change_order", "cancel_order", "authorize_payment", "capture_payment", "refund_payment",
  "void_payment", "issue_ticket", "void_ticket", "exchange_ticket",
]);
const paymentOperations = new Set<FlightProductionActionAuthorization["operation"]>([
  "authorize_payment", "capture_payment", "refund_payment", "void_payment", "reconcile_payment",
]);
const settlementOperations = new Set<FlightProductionActionAuthorization["operation"]>(["create_order"]);

const testProductionAuthorizationSecret = "test-only-production-authorization-secret-32-bytes";

function signedProductionAuthorization(input: {
  authorizationId: string;
  operation: FlightProductionActionAuthorization["operation"];
  scopeId: string;
  nonce: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
  requestDigest?: string;
  idempotencyRequestDigest?: string | null;
  providerBindingDigest?: string;
  paymentBindingDigest?: string | null;
  settlementBindingDigest?: string | null;
}): FlightProductionActionAuthorization {
  const evidence = {
    version: FLIGHT_PRODUCTION_ACTION_AUTHORIZATION_VERSION,
    authorizationId: input.authorizationId,
    operation: input.operation,
    provider: "provider_production" as const,
    scopeId: input.scopeId,
    requestDigest: input.requestDigest ?? productionRequestDigest,
    idempotencyRequestDigest: input.idempotencyRequestDigest === undefined
      ? idempotentOperations.has(input.operation) ? productionIdempotencyRequestDigest : null
      : input.idempotencyRequestDigest,
    providerBindingDigest: input.providerBindingDigest ?? digestFlightRuntimeProviderBinding(providerBinding),
    paymentBindingDigest: input.paymentBindingDigest === undefined
      ? paymentOperations.has(input.operation) ? digestFlightRuntimePaymentBinding(paymentBinding) : null
      : input.paymentBindingDigest,
    settlementBindingDigest: input.settlementBindingDigest === undefined
      ? settlementOperations.has(input.operation) ? digestFlightRuntimeSettlementBinding(settlementBinding) : null
      : input.settlementBindingDigest,
    nonce: input.nonce,
    issuedAtSeconds: input.issuedAtSeconds,
    expiresAtSeconds: input.expiresAtSeconds,
  };
  return {
    ...evidence,
    signatureHex: createHmac("sha256", testProductionAuthorizationSecret)
      .update(canonicalFlightJson(evidence))
      .digest("hex"),
  };
}

function productionAuthorizationVerifier(
  trustedNowSeconds: number,
  consumedNonces = new Set<string>(),
): FlightProductionAuthorizationVerifier {
  return {
    readTrustedTimeSeconds: () => trustedNowSeconds,
    verifyHmacSha256: ({ signingPayload, signatureHex }) => (
      createHmac("sha256", testProductionAuthorizationSecret).update(signingPayload).digest("hex") === signatureHex
    ),
    consumeNonce: async ({ nonce }) => {
      if (consumedNonces.has(nonce)) return "replayed";
      consumedNonces.add(nonce);
      return "consumed";
    },
  };
}

describe("flight runtime authorization", () => {
  it("defaults every authority off with the transaction kill switch engaged", async () => {
    expect(resolveFlightRuntimePolicy()).toMatchObject({
      mode: "disabled",
      environment: "unbound",
      runtimeEnabled: false,
      syntheticAdapterEnabled: false,
      providerTrafficEnabled: false,
      bookingEnabled: false,
      paymentEnabled: false,
      settlementEnabled: false,
      ticketingEnabled: false,
      servicingEnabled: false,
      webhookEnabled: false,
      productionTrafficEnabled: false,
      transactionKillSwitchEngaged: true,
      expectedProductionAuthorizationId: null,
      providerBinding: null,
      paymentBinding: null,
      settlementBinding: null,
      invalidSettings: [],
    });
    expect((await evaluateFlightRuntimeAuthorization(resolveFlightRuntimePolicy(), "search", "synthetic")).authorized).toBe(false);
  });

  it("allows explicitly enabled local synthetic reads but keeps mutations separately locked", async () => {
    const readsOnly = resolveFlightRuntimePolicy(syntheticEnabled);
    expect(await evaluateFlightRuntimeAuthorization(readsOnly, "search", "synthetic")).toMatchObject({ authorized: true, reasons: [] });
    expect(await evaluateFlightRuntimeAuthorization(readsOnly, "create_order", "synthetic")).toMatchObject({
      authorized: false,
      reasons: expect.arrayContaining(["Flight transaction kill switch is engaged.", "Flight booking operations are disabled."]),
    });

    const booking = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_BOOKING_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    });
    expect(await evaluateFlightRuntimeAuthorization(booking, "create_order", "synthetic")).toMatchObject({ authorized: true, reasons: [] });
    expect((await evaluateFlightRuntimeAuthorization(booking, "issue_ticket", "synthetic")).authorized).toBe(false);
    expect(await evaluateFlightRuntimeAuthorization(readsOnly, "search", "synthetic", {
      unexpectedAuthority: true,
    } as never)).toMatchObject({
      authorized: false,
      reasons: ["Flight action context is malformed."],
    });
  });

  it("keeps webhook processing and order reconciliation behind the transaction kill switch", async () => {
    const policy = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_BOOKING_ENABLED: "true",
      FLIGHT_SERVICING_ENABLED: "true",
      FLIGHT_WEBHOOKS_ENABLED: "true",
    });

    for (const operation of ["process_webhook", "reconcile_order"] as const) {
      expect(await evaluateFlightRuntimeAuthorization(policy, operation, "synthetic")).toMatchObject({
        authorized: false,
        reasons: operation === "reconcile_order"
          ? ["Flight transaction kill switch is engaged.", "Flight ticketing operations are disabled."]
          : ["Flight transaction kill switch is engaged."],
      });
    }
  });

  it("requires lifecycle authority as well as servicing authority for every reconciliation seam", async () => {
    const servicingOnly = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_SERVICING_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    });
    expect(await evaluateFlightRuntimeAuthorization(servicingOnly, "reconcile_order", "synthetic")).toMatchObject({
      authorized: false,
      reasons: ["Flight booking operations are disabled.", "Flight ticketing operations are disabled."],
    });
    expect(await evaluateFlightRuntimeAuthorization(servicingOnly, "reconcile_payment", "synthetic")).toMatchObject({
      authorized: false,
      reasons: ["Flight payment operations are disabled."],
    });
    expect(await evaluateFlightRuntimeAuthorization(servicingOnly, "reconcile_tickets", "synthetic")).toMatchObject({
      authorized: false,
      reasons: ["Flight ticketing operations are disabled."],
    });
    const orderWithoutTicketing = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_BOOKING_ENABLED: "true",
      FLIGHT_SERVICING_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    });
    expect(await evaluateFlightRuntimeAuthorization(orderWithoutTicketing, "reconcile_order", "synthetic")).toMatchObject({
      authorized: false,
      reasons: ["Flight ticketing operations are disabled."],
    });
    const reconciliationsEnabled = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_BOOKING_ENABLED: "true",
      FLIGHT_PAYMENT_ENABLED: "true",
      FLIGHT_TICKETING_ENABLED: "true",
      FLIGHT_SERVICING_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    });
    for (const operation of ["reconcile_order", "reconcile_payment", "reconcile_tickets"] as const) {
      expect(await evaluateFlightRuntimeAuthorization(reconciliationsEnabled, operation, "synthetic"))
        .toMatchObject({ authorized: true, reasons: [] });
    }
  });

  it("requires servicing authority in addition to ticketing authority for voids and exchanges", async () => {
    const ticketingOnly = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_TICKETING_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    });

    expect(await evaluateFlightRuntimeAuthorization(ticketingOnly, "issue_ticket", "synthetic")).toMatchObject({ authorized: true, reasons: [] });
    for (const operation of ["void_ticket", "exchange_ticket"] as const) {
      expect(await evaluateFlightRuntimeAuthorization(ticketingOnly, operation, "synthetic")).toMatchObject({
        authorized: false,
        reasons: ["Flight servicing operations are disabled."],
      });
    }

    const ticketingAndServicing = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_TICKETING_ENABLED: "true",
      FLIGHT_SERVICING_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    });
    for (const operation of ["void_ticket", "exchange_ticket"] as const) {
      expect(await evaluateFlightRuntimeAuthorization(ticketingAndServicing, operation, "synthetic")).toMatchObject({ authorized: true, reasons: [] });
    }
  });

  it("requires servicing authority in addition to payment authority for refunds", async () => {
    const paymentOnly = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_PAYMENT_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    });
    expect(await evaluateFlightRuntimeAuthorization(paymentOnly, "refund_payment", "synthetic")).toMatchObject({
      authorized: false,
      reasons: ["Flight servicing operations are disabled."],
    });

    const paymentAndServicing = resolveFlightRuntimePolicy({
      ...syntheticEnabled,
      FLIGHT_PAYMENT_ENABLED: "true",
      FLIGHT_SERVICING_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    });
    expect(await evaluateFlightRuntimeAuthorization(paymentAndServicing, "refund_payment", "synthetic"))
      .toMatchObject({ authorized: true, reasons: [] });
  });

  it("separates sandbox and Production identity, traffic, and action-time authority", async () => {
    const sandbox = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "sandbox",
      FLIGHT_RUNTIME_ENVIRONMENT: "preview",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      ...providerBindingSettings,
    });
    expect((await evaluateFlightRuntimeAuthorization(sandbox, "search", "provider_sandbox", { executionBinding: providerBinding })).authorized).toBe(true);
    expect((await evaluateFlightRuntimeAuthorization(sandbox, "search", "provider_production", { executionBinding: providerBinding })).authorized).toBe(false);

    const production = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "production",
      FLIGHT_RUNTIME_ENVIRONMENT: "production",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "true",
      FLIGHT_PRODUCTION_AUTHORIZATION_ID: "flight-launch-approval-0001",
      ...providerBindingSettings,
    });
    const evaluatedAtSeconds = 1_800_000_000;
    const scopeId = "search_scope_0001";
    const productionAuthorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "search",
      scopeId,
      nonce: "1".repeat(32),
      issuedAtSeconds: evaluatedAtSeconds - 10,
      expiresAtSeconds: evaluatedAtSeconds + 60,
    });
    expect(await evaluateFlightRuntimeAuthorization(production, "search", "provider_production", {
      executionBinding: providerBinding,
      productionAuthorization,
      productionAuthorizationVerifier: productionAuthorizationVerifier(evaluatedAtSeconds),
      scopeId,
      requestDigest: productionRequestDigest,
    })).toMatchObject({ authorized: true, reasons: [] });
    expect((await evaluateFlightRuntimeAuthorization(production, "search", "provider_sandbox", { executionBinding: providerBinding })).authorized).toBe(false);
  });

  it("requires fresh per-call Production evidence bound to the exact request, adapter, ID, operation, and scope", async () => {
    const policy = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "production",
      FLIGHT_RUNTIME_ENVIRONMENT: "production",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "true",
      FLIGHT_PRODUCTION_AUTHORIZATION_ID: "flight-launch-approval-0001",
      ...providerBindingSettings,
    });
    const evaluatedAtSeconds = 1_800_000_000;
    const scopeId = "search_scope_0001";
    const authorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "search",
      scopeId,
      nonce: "2".repeat(32),
      issuedAtSeconds: evaluatedAtSeconds - 10,
      expiresAtSeconds: evaluatedAtSeconds + 60,
    });
    const replayVerifier = productionAuthorizationVerifier(evaluatedAtSeconds);
    const replayContext = {
      executionBinding: providerBinding,
      productionAuthorization: authorization,
      productionAuthorizationVerifier: replayVerifier,
      scopeId,
      requestDigest: productionRequestDigest,
    };
    const contextFor = (
      productionAuthorization: FlightProductionActionAuthorization,
      actionScopeId = scopeId,
      trustedNowSeconds = evaluatedAtSeconds,
    ) => ({
      executionBinding: providerBinding,
      productionAuthorization,
      productionAuthorizationVerifier: productionAuthorizationVerifier(trustedNowSeconds),
      scopeId: actionScopeId,
      requestDigest: productionRequestDigest,
      idempotencyRequestDigest: productionAuthorization.idempotencyRequestDigest,
    });

    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", {
      executionBinding: providerBinding,
    })).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production action authorization is missing."],
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", replayContext))
      .toMatchObject({ authorized: true, reasons: [] });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", replayContext)).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization nonce has already been consumed."],
    });
    expect(await evaluateFlightRuntimeAuthorization(
      policy,
      "search",
      "provider_production",
      contextFor(authorization, scopeId, authorization.expiresAtSeconds),
    )).toMatchObject({ authorized: false, reasons: ["Per-call Production authorization is not currently valid."] });
    expect(await evaluateFlightRuntimeAuthorization(policy, "reprice", "provider_production", contextFor(authorization))).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization is bound to another operation or provider."],
    });
    expect(await evaluateFlightRuntimeAuthorization(
      policy,
      "search",
      "provider_production",
      contextFor(authorization, "search_scope_0002"),
    )).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization is bound to another execution scope."],
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", contextFor(
      signedProductionAuthorization({
        authorizationId: "flight-launch-approval-0002",
        operation: "search",
        scopeId,
        nonce: "3".repeat(32),
        issuedAtSeconds: evaluatedAtSeconds - 10,
        expiresAtSeconds: evaluatedAtSeconds + 60,
      }),
    ))).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization ID does not match the expected binding."],
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", contextFor({
      ...authorization,
      signatureHex: "f".repeat(64),
    }))).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization signature is invalid."],
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", contextFor(
      {
        ...authorization,
        unexpectedStandingAuthority: true,
      } as typeof authorization,
    ))).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization evidence is malformed."],
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", contextFor(
      {
        ...authorization,
        provider: "provider_sandbox",
      } as unknown as typeof authorization,
    ))).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization evidence is malformed."],
    });
    const overlong = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "search",
      scopeId,
      nonce: "4".repeat(32),
      issuedAtSeconds: evaluatedAtSeconds,
      expiresAtSeconds: evaluatedAtSeconds + 301,
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", contextFor(overlong))).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization evidence is malformed."],
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", {
      executionBinding: providerBinding,
      productionAuthorization: authorization,
      scopeId,
      requestDigest: productionRequestDigest,
    })).toMatchObject({
      authorized: false,
      reasons: ["Trusted Production authorization verification is unavailable."],
    });
    const nonceUnavailableAuthorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "search",
      scopeId,
      nonce: "5".repeat(32),
      issuedAtSeconds: evaluatedAtSeconds - 10,
      expiresAtSeconds: evaluatedAtSeconds + 60,
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", {
      ...contextFor(nonceUnavailableAuthorization),
      productionAuthorizationVerifier: {
        ...productionAuthorizationVerifier(evaluatedAtSeconds),
        consumeNonce: async () => "unavailable",
      },
    })).toMatchObject({
      authorized: false,
      reasons: ["Production authorization nonce consumption is unavailable."],
    });
    const malformedVerifierAuthorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "search",
      scopeId,
      nonce: "7".repeat(32),
      issuedAtSeconds: evaluatedAtSeconds - 10,
      expiresAtSeconds: evaluatedAtSeconds + 60,
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", {
      ...contextFor(malformedVerifierAuthorization),
      productionAuthorizationVerifier: {
        ...productionAuthorizationVerifier(evaluatedAtSeconds),
        consumeNonce: async () => "unexpected" as never,
      },
    })).toMatchObject({
      authorized: false,
      reasons: ["Production authorization nonce consumption is unavailable."],
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "search", "provider_production", {
      ...contextFor({ ...malformedVerifierAuthorization, nonce: "8".repeat(32) }),
      productionAuthorization: { ...malformedVerifierAuthorization, nonce: "8".repeat(32) },
      productionAuthorizationVerifier: {
        ...productionAuthorizationVerifier(evaluatedAtSeconds),
        verifyHmacSha256: () => "truthy-but-not-boolean" as never,
      },
    })).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization signature is invalid."],
    });

    const gatedNonceSet = new Set<string>();
    const gatedAuthorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "create_order",
      scopeId: "order_scope_0001",
      nonce: "6".repeat(32),
      issuedAtSeconds: evaluatedAtSeconds - 10,
      expiresAtSeconds: evaluatedAtSeconds + 60,
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "create_order", "provider_production", {
      executionBinding: providerBinding,
      productionAuthorization: gatedAuthorization,
      productionAuthorizationVerifier: productionAuthorizationVerifier(evaluatedAtSeconds, gatedNonceSet),
      scopeId: gatedAuthorization.scopeId,
      requestDigest: productionRequestDigest,
      idempotencyRequestDigest: productionIdempotencyRequestDigest,
    })).toMatchObject({
      authorized: false,
      reasons: expect.arrayContaining(["Flight transaction kill switch is engaged.", "Flight booking operations are disabled."]),
    });
    expect(gatedNonceSet.size).toBe(0);
  });

  it("keeps live provider authority blocked until every exact adapter and scope receipt matches", async () => {
    const base = {
      FLIGHT_RUNTIME_MODE: "sandbox",
      FLIGHT_RUNTIME_ENVIRONMENT: "preview",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
    } as const;
    expect(await evaluateFlightRuntimeAuthorization(resolveFlightRuntimePolicy(base), "search", "provider_sandbox")).toMatchObject({
      authorized: false,
      reasons: expect.arrayContaining([
        "Exact provider execution binding is not configured.",
        "Action-time provider execution binding is missing.",
      ]),
    });

    const configured = resolveFlightRuntimePolicy({ ...base, ...providerBindingSettings });
    expect(await evaluateFlightRuntimeAuthorization(configured, "search", "provider_sandbox")).toMatchObject({
      authorized: false,
      reasons: ["Action-time provider execution binding is missing."],
    });
    expect(await evaluateFlightRuntimeAuthorization(configured, "search", "provider_sandbox", {
      executionBinding: {
        ...providerBinding,
        contentScopeReceiptDigest: "e".repeat(64),
      },
    })).toMatchObject({
      authorized: false,
      reasons: ["Action-time provider execution binding does not match configured provider scope evidence."],
    });
    expect(resolveFlightRuntimePolicy({ ...base, FLIGHT_PROVIDER_ID: providerBinding.providerId })).toMatchObject({
      providerBinding: null,
      invalidSettings: ["Exact flight provider execution binding is incomplete."],
    });
  });

  it("keeps provider-balance settlement immutable, default-off, and scoped only to create_order", async () => {
    const base = {
      FLIGHT_RUNTIME_MODE: "sandbox",
      FLIGHT_RUNTIME_ENVIRONMENT: "preview",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      FLIGHT_BOOKING_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
      ...providerBindingSettings,
    } as const;
    const absent = resolveFlightRuntimePolicy(base);
    expect(await evaluateFlightRuntimeAuthorization(absent, "create_order", "provider_sandbox", {
      executionBinding: providerBinding,
    })).toMatchObject({
      authorized: false,
      reasons: [
        "Exact settlement execution binding is not configured.",
        "Action-time settlement execution binding is missing.",
        "Flight settlement operations are disabled.",
      ],
    });

    const configuredButOff = resolveFlightRuntimePolicy({ ...base, ...settlementBindingSettings });
    expect(Object.isFrozen(configuredButOff.settlementBinding)).toBe(true);
    expect(await evaluateFlightRuntimeAuthorization(configuredButOff, "create_order", "provider_sandbox", {
      executionBinding: providerBinding,
      settlementExecutionBinding: settlementBinding,
    })).toMatchObject({ authorized: false, reasons: ["Flight settlement operations are disabled."] });

    const enabled = resolveFlightRuntimePolicy({
      ...base,
      FLIGHT_SETTLEMENT_ENABLED: "true",
      ...settlementBindingSettings,
    });
    expect(await evaluateFlightRuntimeAuthorization(enabled, "create_order", "provider_sandbox", {
      executionBinding: providerBinding,
      settlementExecutionBinding: settlementBinding,
    })).toMatchObject({ authorized: true, reasons: [] });
    expect(await evaluateFlightRuntimeAuthorization(enabled, "create_order", "provider_sandbox", {
      executionBinding: providerBinding,
      settlementExecutionBinding: { ...settlementBinding, environmentScopeReceiptDigest: "8".repeat(64) },
    })).toMatchObject({
      authorized: false,
      reasons: ["Action-time settlement execution binding does not match configured settlement scope evidence."],
    });
    expect(await evaluateFlightRuntimeAuthorization(enabled, "search", "provider_sandbox", {
      executionBinding: providerBinding,
    })).toMatchObject({ authorized: true, reasons: [] });
    expect(await evaluateFlightRuntimeAuthorization(enabled, "search", "provider_sandbox", {
      executionBinding: providerBinding,
      settlementExecutionBinding: settlementBinding,
    })).toMatchObject({
      authorized: false,
      reasons: ["Settlement execution binding is not valid for this non-settlement operation."],
    });
    expect(resolveFlightRuntimePolicy({ ...base, FLIGHT_SETTLEMENT_PROVIDER_ID: settlementBinding.providerId })).toMatchObject({
      settlementBinding: null,
      invalidSettings: ["Exact flight settlement execution binding is incomplete."],
    });
    expect(resolveFlightRuntimePolicy({
      ...base,
      ...settlementBindingSettings,
      FLIGHT_SETTLEMENT_PROVIDER_ID: "provider_other_0001",
    })).toMatchObject({
      settlementBinding: null,
      invalidSettings: ["Flight settlement binding provider does not match the exact provider execution binding."],
    });
    let getterCalls = 0;
    const hostileSettlementBinding = Object.defineProperty({
      ...settlementBinding,
    }, "currency", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "USD";
      },
    });
    expect(await evaluateFlightRuntimeAuthorization(enabled, "create_order", "provider_sandbox", {
      executionBinding: providerBinding,
      settlementExecutionBinding: hostileSettlementBinding,
    })).toMatchObject({ authorized: false, reasons: ["Flight action context is malformed."] });
    expect(getterCalls).toBe(0);
  });

  it("binds Production create_order authorization and nonce consumption to exact settlement authority", async () => {
    const policy = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "production",
      FLIGHT_RUNTIME_ENVIRONMENT: "production",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "true",
      FLIGHT_BOOKING_ENABLED: "true",
      FLIGHT_SETTLEMENT_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
      FLIGHT_PRODUCTION_AUTHORIZATION_ID: "flight-launch-approval-0001",
      ...providerBindingSettings,
      ...settlementBindingSettings,
    });
    const now = 1_800_000_000;
    const scopeId = "order_scope_0001";
    const authorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "create_order",
      scopeId,
      nonce: "e".repeat(32),
      issuedAtSeconds: now - 10,
      expiresAtSeconds: now + 60,
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "create_order", "provider_production", {
      executionBinding: providerBinding,
      settlementExecutionBinding: settlementBinding,
      productionAuthorization: authorization,
      productionAuthorizationVerifier: productionAuthorizationVerifier(now),
      scopeId,
      requestDigest: productionRequestDigest,
      idempotencyRequestDigest: productionIdempotencyRequestDigest,
    })).toMatchObject({ authorized: true, reasons: [] });

    const consumed = new Set<string>();
    const wrongBindingAuthorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "create_order",
      scopeId,
      nonce: "f".repeat(32),
      issuedAtSeconds: now - 10,
      expiresAtSeconds: now + 60,
      settlementBindingDigest: "9".repeat(64),
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "create_order", "provider_production", {
      executionBinding: providerBinding,
      settlementExecutionBinding: settlementBinding,
      productionAuthorization: wrongBindingAuthorization,
      productionAuthorizationVerifier: productionAuthorizationVerifier(now, consumed),
      scopeId,
      requestDigest: productionRequestDigest,
      idempotencyRequestDigest: productionIdempotencyRequestDigest,
    })).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization is bound to another settlement execution binding."],
    });
    expect(consumed.size).toBe(0);

    const missingBindingAuthorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "create_order",
      scopeId,
      nonce: "1".repeat(32),
      issuedAtSeconds: now - 10,
      expiresAtSeconds: now + 60,
      settlementBindingDigest: null,
    });
    expect(await evaluateFlightRuntimeAuthorization(policy, "create_order", "provider_production", {
      executionBinding: providerBinding,
      settlementExecutionBinding: settlementBinding,
      productionAuthorization: missingBindingAuthorization,
      productionAuthorizationVerifier: productionAuthorizationVerifier(now),
      scopeId,
      requestDigest: productionRequestDigest,
      idempotencyRequestDigest: productionIdempotencyRequestDigest,
    })).toMatchObject({
      authorized: false,
      reasons: ["Per-call Production authorization evidence is malformed."],
    });
  });

  it("binds Production payment authority to exact request, idempotency, provider, processor, account, and environment evidence", async () => {
    const policy = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "production",
      FLIGHT_RUNTIME_ENVIRONMENT: "production",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "true",
      FLIGHT_PAYMENT_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
      FLIGHT_PRODUCTION_AUTHORIZATION_ID: "flight-launch-approval-0001",
      ...providerBindingSettings,
      ...paymentBindingSettings,
    });
    const now = 1_800_000_000;
    const scopeId = "payment_scope_0001";
    const authorization = signedProductionAuthorization({
      authorizationId: "flight-launch-approval-0001",
      operation: "authorize_payment",
      scopeId,
      nonce: "7".repeat(32),
      issuedAtSeconds: now - 10,
      expiresAtSeconds: now + 60,
    });
    const context = {
      executionBinding: providerBinding,
      paymentExecutionBinding: paymentBinding,
      productionAuthorization: authorization,
      productionAuthorizationVerifier: productionAuthorizationVerifier(now),
      scopeId,
      requestDigest: productionRequestDigest,
      idempotencyRequestDigest: productionIdempotencyRequestDigest,
    };
    expect(await evaluateFlightRuntimeAuthorization(policy, "authorize_payment", "provider_production", context))
      .toMatchObject({ authorized: true, reasons: [] });

    const adversarialCases = [
      {
        authorization: signedProductionAuthorization({
          authorizationId: "flight-launch-approval-0001",
          operation: "authorize_payment",
          scopeId,
          nonce: "8".repeat(32),
          issuedAtSeconds: now - 10,
          expiresAtSeconds: now + 60,
        }),
        override: { requestDigest: "9".repeat(64) },
        reason: "Per-call Production authorization is bound to another canonical request.",
      },
      {
        authorization: signedProductionAuthorization({
          authorizationId: "flight-launch-approval-0001",
          operation: "authorize_payment",
          scopeId,
          nonce: "a".repeat(32),
          issuedAtSeconds: now - 10,
          expiresAtSeconds: now + 60,
        }),
        override: { idempotencyRequestDigest: "9".repeat(64) },
        reason: "Per-call Production authorization is bound to another idempotency request.",
      },
      {
        authorization: signedProductionAuthorization({
          authorizationId: "flight-launch-approval-0001",
          operation: "authorize_payment",
          scopeId,
          nonce: "b".repeat(32),
          issuedAtSeconds: now - 10,
          expiresAtSeconds: now + 60,
          providerBindingDigest: "9".repeat(64),
        }),
        override: {},
        reason: "Per-call Production authorization is bound to another provider execution binding.",
      },
      {
        authorization: signedProductionAuthorization({
          authorizationId: "flight-launch-approval-0001",
          operation: "authorize_payment",
          scopeId,
          nonce: "c".repeat(32),
          issuedAtSeconds: now - 10,
          expiresAtSeconds: now + 60,
          paymentBindingDigest: "9".repeat(64),
        }),
        override: {},
        reason: "Per-call Production authorization is bound to another payment execution binding.",
      },
    ] as const;
    for (const adversarial of adversarialCases) {
      const consumed = new Set<string>();
      expect(await evaluateFlightRuntimeAuthorization(policy, "authorize_payment", "provider_production", {
        ...context,
        ...adversarial.override,
        productionAuthorization: adversarial.authorization,
        productionAuthorizationVerifier: productionAuthorizationVerifier(now, consumed),
      })).toMatchObject({ authorized: false, reasons: [adversarial.reason] });
      expect(consumed.size).toBe(0);
    }

    expect(await evaluateFlightRuntimeAuthorization(policy, "authorize_payment", "provider_production", {
      ...context,
      productionAuthorization: signedProductionAuthorization({
        authorizationId: "flight-launch-approval-0001",
        operation: "authorize_payment",
        scopeId,
        nonce: "d".repeat(32),
        issuedAtSeconds: now - 10,
        expiresAtSeconds: now + 60,
      }),
      productionAuthorizationVerifier: productionAuthorizationVerifier(now),
      paymentExecutionBinding: { ...paymentBinding, environmentScopeReceiptDigest: "9".repeat(64) },
    })).toMatchObject({
      authorized: false,
      reasons: ["Action-time payment execution binding does not match configured payment scope evidence."],
    });
    expect(resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "sandbox",
      FLIGHT_RUNTIME_ENVIRONMENT: "preview",
      FLIGHT_PAYMENT_PROCESSOR_ID: paymentBinding.processorId,
    })).toMatchObject({
      paymentBinding: null,
      invalidSettings: ["Exact flight payment execution binding is incomplete."],
    });
  });

  it("fails closed on mistyped flags, modes, environments, kill-switch values, and authorization IDs", async () => {
    const policy = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "live",
      FLIGHT_RUNTIME_ENVIRONMENT: "prod",
      FLIGHT_RUNTIME_ENABLED: "TRUE",
      FLIGHT_TRANSACTION_KILL_SWITCH: "off",
      FLIGHT_PRODUCTION_AUTHORIZATION_ID: "short",
    });
    expect(policy.invalidSettings).toHaveLength(5);
    expect(policy).toMatchObject({ mode: "disabled", environment: "unbound", runtimeEnabled: false, transactionKillSwitchEngaged: true });
    expect((await evaluateFlightRuntimeAuthorization(policy, "search", "synthetic")).authorized).toBe(false);
  });

  it("rejects unknown runtime operations and providers before context or nonce evaluation", async () => {
    let verifierCalls = 0;
    const hostileContext = Object.defineProperty({}, "productionAuthorizationVerifier", {
      enumerable: true,
      get() {
        verifierCalls += 1;
        throw new Error("Unknown runtime values must fail before reading context.");
      },
    });
    await expect(evaluateFlightRuntimeAuthorization(
      resolveFlightRuntimePolicy(syntheticEnabled),
      "totally_unknown" as never,
      "synthetic",
      hostileContext,
    )).resolves.toMatchObject({ authorized: false, reasons: ["Flight runtime operation is not recognized."] });
    await expect(evaluateFlightRuntimeAuthorization(
      resolveFlightRuntimePolicy(syntheticEnabled),
      "search",
      "attacker_provider" as never,
      hostileContext,
    )).resolves.toMatchObject({ authorized: false, reasons: ["Flight runtime provider is not recognized."] });
    expect(verifierCalls).toBe(0);
  });
});

describe("flight canonical evidence and idempotency", () => {
  it("sorts object keys while distinguishing null, empty, order, separators, quotes, and newlines", () => {
    expect(canonicalFlightJson({ z: null, a: "", nested: { b: 2, a: 1 } })).toBe('{"a":"","nested":{"a":1,"b":2},"z":null}');
    expect(sha256FlightEvidence({ a: 1, b: 2 })).toBe(sha256FlightEvidence({ b: 2, a: 1 }));
    expect(sha256FlightEvidence(["a", "b"])).not.toBe(sha256FlightEvidence(["b", "a"]));
    const adversarial = [null, "", "|", '"', "line\nbreak"].map((value) => sha256FlightEvidence({ value }));
    expect(new Set(adversarial).size).toBe(adversarial.length);
  });

  it("rejects undefined, unsafe numbers, class instances, and cyclic evidence", () => {
    expect(() => canonicalFlightJson({ value: undefined } as unknown as FlightCanonicalJsonValue)).toThrow("undefined");
    expect(() => canonicalFlightJson({ value: 0.1 } as FlightCanonicalJsonValue)).toThrow("safe integers");
    expect(() => canonicalFlightJson(new Date() as unknown as FlightCanonicalJsonValue)).toThrow("plain objects");
    const cyclic: Record<string, FlightCanonicalJsonValue> = {};
    cyclic.self = cyclic;
    expect(() => canonicalFlightJson(cyclic)).toThrow("cyclic");
    const sparse = new Array<FlightCanonicalJsonValue>(1);
    expect(() => canonicalFlightJson(sparse)).toThrow("cannot be sparse");
    const symbolic = { value: 1 } as Record<PropertyKey, FlightCanonicalJsonValue>;
    symbolic[Symbol("hidden")] = 2;
    expect(() => canonicalFlightJson(symbolic as FlightCanonicalJsonValue)).toThrow("symbol properties");
  });

  it("binds idempotency to operation, scope, request, and canonical payload", () => {
    const base = {
      operation: "create_order" as const,
      scopeId: "account_scope_0001",
      requestId: "request_order_0001",
      payload: { offerId: "offer_fixture_0001", travelerRefs: ["traveler_fixture_0001"] },
    };
    const intent = buildFlightIdempotencyIntent(base);
    expect(intent.idempotencyKey).toMatch(/^flt_v1_[0-9a-f]{64}$/);
    expect(buildFlightIdempotencyIntent({ ...base, payload: { travelerRefs: ["traveler_fixture_0001"], offerId: "offer_fixture_0001" } })).toEqual(intent);
    expect(buildFlightIdempotencyIntent({ ...base, operation: "cancel_order" }).idempotencyKey).not.toBe(intent.idempotencyKey);
    expect(buildFlightIdempotencyIntent({ ...base, scopeId: "account_scope_0002" }).idempotencyKey).not.toBe(intent.idempotencyKey);
  });

  it("distinguishes new, in-flight, terminal replay, and conflicting idempotency evidence", () => {
    const intent = buildFlightIdempotencyIntent({
      operation: "issue_ticket",
      scopeId: "account_scope_0001",
      requestId: "request_ticket_0001",
      payload: { orderId: "order_fixture_0001" },
    });
    expect(evaluateFlightIdempotency(intent, null).decision).toBe("proceed");
    expect(evaluateFlightIdempotency(intent, {
      idempotencyKey: intent.idempotencyKey,
      requestDigest: intent.requestDigest,
      status: "in_progress",
      outcomeDigest: null,
    }).decision).toBe("in_progress");
    expect(evaluateFlightIdempotency(intent, {
      idempotencyKey: intent.idempotencyKey,
      requestDigest: intent.requestDigest,
      status: "succeeded",
      outcomeDigest: "a".repeat(64),
    }).decision).toBe("replay_succeeded");
    expect(evaluateFlightIdempotency(intent, {
      idempotencyKey: intent.idempotencyKey,
      requestDigest: "b".repeat(64),
      status: "failed",
      outcomeDigest: "c".repeat(64),
    }).decision).toBe("conflict");
    for (const outcomeDigest of [null, "d".repeat(64)]) {
      expect(evaluateFlightIdempotency(intent, {
        idempotencyKey: intent.idempotencyKey,
        requestDigest: intent.requestDigest,
        status: "ambiguous",
        outcomeDigest,
      })).toMatchObject({ decision: "blocked_ambiguous" });
    }
    expect(evaluateFlightIdempotency(intent, {
      idempotencyKey: intent.idempotencyKey,
      requestDigest: intent.requestDigest,
      status: "failed",
      outcomeDigest: null,
    }).decision).toBe("replay_failed");
    expect(evaluateFlightIdempotency({ ...intent, idempotencyKey: `flt_v1_${"0".repeat(64)}` }, null).decision).toBe("conflict");
  });
});

describe("flight webhook integrity and replay", () => {
  const secret = "synthetic-webhook-secret-that-is-at-least-32-bytes";
  const rawBody = new TextEncoder().encode('{"event_id":"event_fixture_0001","type":"order.confirmed"}');
  const timestampSeconds = 1_800_000_000;
  const signatureHex = createHmac("sha256", secret)
    .update(buildFlightWebhookSigningPayload(timestampSeconds, rawBody))
    .digest("hex");

  it("verifies exact raw bytes with a bounded timestamp and returns digest-only evidence", () => {
    expect(verifyFlightWebhookHmac({
      rawBody,
      signatureHex,
      timestampSeconds,
      secret,
      nowSeconds: timestampSeconds + 60,
    })).toMatchObject({ verified: true, reason: "verified", bodyDigest: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("rejects altered bytes, stale timestamps, malformed signatures, weak secrets, and oversized bodies", () => {
    const altered = new TextEncoder().encode('{"event_id":"event_fixture_0002","type":"order.confirmed"}');
    expect(verifyFlightWebhookHmac({ rawBody: altered, signatureHex, timestampSeconds, secret, nowSeconds: timestampSeconds }).reason).toBe("invalid_signature");
    expect(verifyFlightWebhookHmac({ rawBody, signatureHex, timestampSeconds, secret, nowSeconds: timestampSeconds + 301 }).reason).toBe("timestamp_outside_tolerance");
    expect(verifyFlightWebhookHmac({ rawBody, signatureHex: "bad", timestampSeconds, secret, nowSeconds: timestampSeconds }).reason).toBe("malformed_signature");
    expect(verifyFlightWebhookHmac({ rawBody, signatureHex, timestampSeconds, secret: "short", nowSeconds: timestampSeconds }).reason).toBe("missing_secret");
    expect(verifyFlightWebhookHmac({ rawBody: new Uint8Array(1_048_577), signatureHex, timestampSeconds, secret, nowSeconds: timestampSeconds }).reason).toBe("payload_rejected");
  });

  it("accepts one new event, suppresses exact duplicates, and quarantines identity collisions", () => {
    const incoming = { providerId: "provider_fixture_0001", eventId: "event_fixture_0001", bodyDigest: "a".repeat(64) };
    expect(evaluateFlightWebhookReplay(incoming, null).decision).toBe("accept");
    for (const status of ["received", "verified"] as const) {
      expect(evaluateFlightWebhookReplay(incoming, { ...incoming, status }).decision).toBe("in_progress");
    }
    for (const status of ["processed", "duplicate"] as const) {
      expect(evaluateFlightWebhookReplay(incoming, { ...incoming, status }).decision).toBe("duplicate");
    }
    for (const status of ["blocked", "failed"] as const) {
      expect(evaluateFlightWebhookReplay(incoming, { ...incoming, status }).decision).toBe("blocked");
    }
    expect(evaluateFlightWebhookReplay({ ...incoming, bodyDigest: "b".repeat(64) }, { ...incoming, status: "processed" }).decision).toBe("conflict");
  });
});
