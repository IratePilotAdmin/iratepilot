import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertFlightProviderOperationAuthorized,
  buildFlightProviderOperationRequestBinding,
  createGuardedFlightProviderAdapter,
  disabledSyntheticFlightProviderAdapter,
  FlightProviderAdapterDisabledError,
  parseVerifiedSyntheticFlightWebhook,
  SyntheticFlightProviderAdapter,
  syntheticFlightOfferFixture,
  syntheticFlightSearchRequest,
  syntheticFlightWebhookEvent,
  syntheticFlightWebhookFixture,
  type FlightProviderCancellationResult,
  type FlightProviderAdapter,
  type FlightProviderCreateOrderInput,
  type FlightProviderAdapterConfiguration,
  type FlightProviderExecutionRequest,
  type FlightProviderExecutionResult,
  type FlightProviderExecutor,
  type FlightProviderOperation,
  type FlightProviderOperationInputMap,
  type FlightProviderOrderResult,
  type FlightProviderTicketingResult,
} from "../lib/flights/provider-adapter";
import {
  buildFlightIdempotencyIntent,
  buildFlightWebhookSigningPayload,
  digestFlightRuntimeSettlementBinding,
  resolveFlightRuntimePolicy,
  verifyFlightWebhookHmac,
  type FlightRuntimeActionContext,
} from "../lib/flights/runtime-safety";

const liveProviderBinding = {
  providerId: "provider_contract_0001",
  adapterVersion: "1.0.0",
  adapterSourceDigest: "1".repeat(64),
  accountScopeReceiptDigest: "2".repeat(64),
  pointOfSaleScopeReceiptDigest: "3".repeat(64),
  contentScopeReceiptDigest: "4".repeat(64),
} as const;

const livePaymentBinding = {
  processorId: "processor_contract_0001",
  adapterVersion: "1.0.0",
  adapterSourceDigest: "5".repeat(64),
  accountScopeReceiptDigest: "6".repeat(64),
  environmentScopeReceiptDigest: "7".repeat(64),
} as const;

const liveSettlementBinding = {
  providerId: liveProviderBinding.providerId,
  method: "provider_balance",
  accountScopeReceiptDigest: "8".repeat(64),
  environmentScopeReceiptDigest: "9".repeat(64),
  currency: "USD",
} as const;

const liveProviderBindingSettings = {
  FLIGHT_PROVIDER_ID: liveProviderBinding.providerId,
  FLIGHT_PROVIDER_ADAPTER_VERSION: liveProviderBinding.adapterVersion,
  FLIGHT_PROVIDER_ADAPTER_SOURCE_SHA256: liveProviderBinding.adapterSourceDigest,
  FLIGHT_PROVIDER_ACCOUNT_SCOPE_SHA256: liveProviderBinding.accountScopeReceiptDigest,
  FLIGHT_PROVIDER_POS_SCOPE_SHA256: liveProviderBinding.pointOfSaleScopeReceiptDigest,
  FLIGHT_PROVIDER_CONTENT_SCOPE_SHA256: liveProviderBinding.contentScopeReceiptDigest,
} as const;

const livePaymentBindingSettings = {
  FLIGHT_PAYMENT_PROCESSOR_ID: livePaymentBinding.processorId,
  FLIGHT_PAYMENT_ADAPTER_VERSION: livePaymentBinding.adapterVersion,
  FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256: livePaymentBinding.adapterSourceDigest,
  FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256: livePaymentBinding.accountScopeReceiptDigest,
  FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256: livePaymentBinding.environmentScopeReceiptDigest,
} as const;

const liveSettlementBindingSettings = {
  FLIGHT_SETTLEMENT_PROVIDER_ID: liveSettlementBinding.providerId,
  FLIGHT_SETTLEMENT_METHOD: liveSettlementBinding.method,
  FLIGHT_SETTLEMENT_ACCOUNT_SCOPE_SHA256: liveSettlementBinding.accountScopeReceiptDigest,
  FLIGHT_SETTLEMENT_ENVIRONMENT_SCOPE_SHA256: liveSettlementBinding.environmentScopeReceiptDigest,
  FLIGHT_SETTLEMENT_CURRENCY: liveSettlementBinding.currency,
} as const;

function createOrderInput(
  offerId: string,
  requestId: string,
  options: {
    acceptedTermsDigest?: string;
    offerRefreshReceiptDigest?: string;
    total?: Readonly<{ currency: string; amountMinor: number }>;
    travelerRef?: string;
  } = {},
): FlightProviderCreateOrderInput {
  const payload = {
    offerId,
    acceptedTermsDigest: options.acceptedTermsDigest ?? "a".repeat(64),
    offerRefreshReceiptDigest: options.offerRefreshReceiptDigest ?? "b".repeat(64),
    total: options.total ?? { currency: "USD", amountMinor: 42_500 },
    travelers: [{ travelerRef: options.travelerRef ?? "traveler_provider_0001", piiRecordDigest: "c".repeat(64) }],
    settlementIntent: {
      method: "provider_balance" as const,
      amount: options.total ?? { currency: "USD", amountMinor: 42_500 },
      settlementBindingDigest: digestFlightRuntimeSettlementBinding(liveSettlementBinding),
    },
  };
  return {
    ...payload,
    idempotency: buildFlightIdempotencyIntent({
      operation: "create_order",
      scopeId: "account_provider_orders_0001",
      requestId,
      payload,
    }),
  };
}

const syntheticReadPolicy = resolveFlightRuntimePolicy({
  FLIGHT_RUNTIME_MODE: "synthetic",
  FLIGHT_RUNTIME_ENVIRONMENT: "test",
  FLIGHT_RUNTIME_ENABLED: "true",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "true",
});

const syntheticCommercePolicy = resolveFlightRuntimePolicy({
  FLIGHT_RUNTIME_MODE: "synthetic",
  FLIGHT_RUNTIME_ENVIRONMENT: "test",
  FLIGHT_RUNTIME_ENABLED: "true",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "true",
  FLIGHT_BOOKING_ENABLED: "true",
  FLIGHT_TICKETING_ENABLED: "true",
  FLIGHT_SERVICING_ENABLED: "true",
  FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
});

const syntheticAllOperationsPolicy = resolveFlightRuntimePolicy({
  FLIGHT_RUNTIME_MODE: "synthetic",
  FLIGHT_RUNTIME_ENVIRONMENT: "test",
  FLIGHT_RUNTIME_ENABLED: "true",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "true",
  FLIGHT_BOOKING_ENABLED: "true",
  FLIGHT_PAYMENT_ENABLED: "true",
  FLIGHT_SETTLEMENT_ENABLED: "true",
  FLIGHT_TICKETING_ENABLED: "true",
  FLIGHT_SERVICING_ENABLED: "true",
  FLIGHT_WEBHOOKS_ENABLED: "true",
  FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
});

const sandboxAllOperationsPolicy = resolveFlightRuntimePolicy({
  FLIGHT_RUNTIME_MODE: "sandbox",
  FLIGHT_RUNTIME_ENVIRONMENT: "preview",
  FLIGHT_RUNTIME_ENABLED: "true",
  FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
  FLIGHT_BOOKING_ENABLED: "true",
  FLIGHT_PAYMENT_ENABLED: "true",
  FLIGHT_SETTLEMENT_ENABLED: "true",
  FLIGHT_TICKETING_ENABLED: "true",
  FLIGHT_SERVICING_ENABLED: "true",
  FLIGHT_WEBHOOKS_ENABLED: "true",
  FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
  ...liveProviderBindingSettings,
  ...livePaymentBindingSettings,
  ...liveSettlementBindingSettings,
});

const paymentProviderOperations = new Set<keyof FlightProviderOperationInputMap>([
  "authorize_payment",
  "capture_payment",
  "refund_payment",
  "void_payment",
  "reconcile_payment",
]);

function sandboxContextFor<K extends keyof FlightProviderOperationInputMap>(
  adapter: FlightProviderAdapter,
  operation: K,
  input: FlightProviderOperationInputMap[K],
): FlightRuntimeActionContext {
  const binding = buildFlightProviderOperationRequestBinding(adapter, operation, input);
  return {
    executionBinding: liveProviderBinding,
    ...(paymentProviderOperations.has(operation) ? { paymentExecutionBinding: livePaymentBinding } : {}),
    ...(operation === "create_order" ? { settlementExecutionBinding: liveSettlementBinding } : {}),
    requestDigest: binding.requestDigest,
    idempotencyRequestDigest: binding.idempotencyRequestDigest,
  };
}

function adapterReturning(rawResult: Readonly<Record<string, unknown>>) {
  return createGuardedFlightProviderAdapter({
    providerId: liveProviderBinding.providerId,
    mode: "provider_sandbox",
    executionBinding: liveProviderBinding,
    paymentExecutionBinding: livePaymentBinding,
    settlementExecutionBinding: liveSettlementBinding,
    execute: async () => rawResult as never,
  });
}

describe("disabled deterministic synthetic flight provider adapter", () => {
  it("exposes provider-neutral result and adapter contracts without enabling a live implementation", () => {
    const orderResult = {
      providerId: "provider_contract_0001",
      source: "provider_production",
      orderId: "order_provider_pending_0001",
      offerId: "offer_provider_0001",
      orderState: "order_pending",
      ticketState: "not_started",
      providerReferenceDigest: "a".repeat(64),
      externalSideEffect: true,
    } satisfies FlightProviderOrderResult;
    const ticketingResult = {
      providerId: "provider_contract_0001",
      source: "provider_sandbox",
      orderId: "order_provider_pending_0001",
      ticketState: "issuance_pending",
      ticketReferenceDigests: [],
      providerReferenceDigest: "b".repeat(64),
      externalSideEffect: true,
    } satisfies FlightProviderTicketingResult;
    const cancellationResult = {
      providerId: "provider_contract_0001",
      source: "provider_sandbox",
      orderId: "order_provider_pending_0001",
      cancellationState: "cancellation_pending",
      refundableAmount: null,
      providerReferenceDigest: "c".repeat(64),
      externalSideEffect: true,
    } satisfies FlightProviderCancellationResult;
    const contractOnly = async (): Promise<never> => {
      throw new Error("Provider contract has no implementation.");
    };
    const liveCapableAdapterContract = createGuardedFlightProviderAdapter({
      providerId: liveProviderBinding.providerId,
      mode: "provider_sandbox",
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: livePaymentBinding,
      settlementExecutionBinding: null,
      execute: contractOnly,
    });

    expect(orderResult).toMatchObject({ source: "provider_production", orderState: "order_pending", externalSideEffect: true });
    expect(ticketingResult).toMatchObject({ source: "provider_sandbox", ticketState: "issuance_pending", externalSideEffect: true });
    expect(cancellationResult).toMatchObject({ source: "provider_sandbox", cancellationState: "cancellation_pending", refundableAmount: null });
    expect(liveCapableAdapterContract).toMatchObject({
      mode: "provider_sandbox",
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: livePaymentBinding,
      externalNetworkAccess: true,
      supportsLiveTraffic: true,
    });
    expect(disabledSyntheticFlightProviderAdapter).toMatchObject({ executionBinding: null, externalNetworkAccess: false, supportsLiveTraffic: false });
  });

  it("publishes a correlated executor port while search and reprice require no payment or settlement adapter", async () => {
    const liveOffer = {
      ...syntheticFlightOfferFixture,
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox" as const,
    };
    const operations: string[] = [];
    const execute: FlightProviderExecutor = async <K extends FlightProviderOperation>(
      request: FlightProviderExecutionRequest<K>,
    ) => {
      operations.push(request.operation);
      if (request.operation === "search") {
        return {
          providerId: liveProviderBinding.providerId,
          source: "provider_sandbox",
          requestDigest: request.requestBinding.requestDigest,
          offers: [],
          retrievedAt: "2027-02-01T00:00:00.000Z",
          externalSideEffect: false,
        } as unknown as FlightProviderExecutionResult<K>;
      }
      if (request.operation === "reprice") {
        return {
          providerId: liveProviderBinding.providerId,
          source: "provider_sandbox",
          originalOfferId: liveOffer.offerId,
          repricedOffer: liveOffer,
          priceChanged: false,
          repricedAt: "2027-02-01T00:00:00.000Z",
          externalSideEffect: false,
        } as unknown as FlightProviderExecutionResult<K>;
      }
      throw new Error("A payment executor must never be reached by this read-only adapter.");
    };
    const configuration = {
      providerId: liveProviderBinding.providerId,
      mode: "provider_sandbox",
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: null,
      settlementExecutionBinding: null,
      execute,
    } satisfies FlightProviderAdapterConfiguration;
    const adapter = createGuardedFlightProviderAdapter(configuration);
    const readsPolicy = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "sandbox",
      FLIGHT_RUNTIME_ENVIRONMENT: "preview",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      ...liveProviderBindingSettings,
    });
    await expect(adapter.search(
      syntheticFlightSearchRequest,
      readsPolicy,
      sandboxContextFor(adapter, "search", syntheticFlightSearchRequest),
    )).resolves.toMatchObject({ offers: [] });
    await expect(adapter.reprice(liveOffer, readsPolicy, sandboxContextFor(adapter, "reprice", liveOffer)))
      .resolves.toMatchObject({ priceChanged: false, repricedOffer: liveOffer });

    const paymentInput = {
      orderId: "order_payment_contract_0001",
      amount: { currency: "USD", amountMinor: 42_500 },
      idempotency: buildFlightIdempotencyIntent({
        operation: "authorize_payment",
        scopeId: "account_payment_contract_0001",
        requestId: "request_payment_port_0001",
        payload: { orderId: "order_payment_contract_0001", amount: { currency: "USD", amountMinor: 42_500 } },
      }),
    };
    await expect(adapter.authorizePayment(
      paymentInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(adapter, "authorize_payment", paymentInput),
    )).rejects.toThrow(/another payment adapter/i);
    expect(operations).toEqual(["search", "reprice"]);
  });

  it("is disabled by construction even when runtime flags would allow synthetic reads", async () => {
    expect(disabledSyntheticFlightProviderAdapter).toMatchObject({
      providerId: "synthetic_flight_fixture_v1",
      mode: "synthetic_fixture",
      externalNetworkAccess: false,
      supportsLiveTraffic: false,
    });
    await expect(disabledSyntheticFlightProviderAdapter.search(syntheticFlightSearchRequest, syntheticReadPolicy, {}))
      .rejects.toBeInstanceOf(FlightProviderAdapterDisabledError);
  });

  it("returns pinned, repeatable search and reprice fixtures with no external side effect", async () => {
    const adapter = new SyntheticFlightProviderAdapter({
      enabled: true,
      now: () => new Date("2027-02-01T00:00:00.000Z"),
    });
    const first = await adapter.search(syntheticFlightSearchRequest, syntheticReadPolicy, {});
    const second = await adapter.search(syntheticFlightSearchRequest, syntheticReadPolicy, {});
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      providerId: "synthetic_flight_fixture_v1",
      source: "synthetic_fixture",
      externalSideEffect: false,
    });
    expect(first.offers).toHaveLength(3);
    expect(first.offers[0]).toEqual(syntheticFlightOfferFixture);
    expect(Object.isFrozen(syntheticFlightOfferFixture)).toBe(true);
    expect(Object.isFrozen(syntheticFlightOfferFixture.segments)).toBe(true);
    expect(Object.isFrozen(syntheticFlightOfferFixture.total)).toBe(true);
    expect(await adapter.reprice(syntheticFlightOfferFixture, syntheticReadPolicy, {})).toMatchObject({
      originalOfferId: syntheticFlightOfferFixture.offerId,
      repricedOffer: syntheticFlightOfferFixture,
      priceChanged: false,
      externalSideEffect: false,
    });
  });

  it("generates deterministic provider-neutral offers for arbitrary valid routes and rejects invalid requests", async () => {
    const adapter = new SyntheticFlightProviderAdapter({
      enabled: true,
      now: () => new Date("2027-02-01T00:00:00.000Z"),
    });
    const arbitrary = await adapter.search({ ...syntheticFlightSearchRequest, destination: "SFO" }, syntheticReadPolicy, {});
    expect(arbitrary.offers).toHaveLength(3);
    expect(arbitrary.offers.every((offer) => offer.segments[0]?.destination === "SFO")).toBe(true);
    expect(arbitrary.offers[0]?.offerId).not.toBe(syntheticFlightOfferFixture.offerId);
    await expect(adapter.search({ ...syntheticFlightSearchRequest, destination: "ORD" }, syntheticReadPolicy, {}))
      .rejects.toThrow(/origin and destination must differ/i);
  });

  it("requires the transaction gate and exact payload-bound idempotency before a fixture order", async () => {
    const adapter = new SyntheticFlightProviderAdapter({ enabled: true });
    const input = createOrderInput(syntheticFlightOfferFixture.offerId, "request_order_0001", {
      acceptedTermsDigest: syntheticFlightOfferFixture.termsDigest,
      total: syntheticFlightOfferFixture.total,
      travelerRef: "traveler_fixture_0001",
    });
    await expect(adapter.createOrder(input, syntheticReadPolicy, {})).rejects.toThrow("kill switch is engaged");
    await expect(adapter.createOrder(input, syntheticCommercePolicy, {})).resolves.toMatchObject({
      orderId: "order_synthetic_confirmed_0001",
      orderState: "order_confirmed",
      ticketState: "not_started",
      externalSideEffect: false,
    });

    const tampered = {
      ...input,
      travelers: [{ ...input.travelers[0]!, travelerRef: "traveler_fixture_0002" }],
    };
    await expect(adapter.createOrder(tampered, syntheticCommercePolicy, {})).rejects.toThrow(/another exact operation request/i);
  });

  it("keeps synthetic ticketing and cancellation deterministic, separately authorized, and non-live", async () => {
    const adapter = new SyntheticFlightProviderAdapter({ enabled: true });
    const orderId = "order_synthetic_confirmed_0001";
    const issueIntent = buildFlightIdempotencyIntent({
      operation: "issue_ticket",
      scopeId: "account_fixture_0001",
      requestId: "request_ticket_0001",
      payload: { orderId },
    });
    expect(await adapter.issueTickets({ orderId, idempotency: issueIntent }, syntheticCommercePolicy, {})).toMatchObject({
      ticketState: "issued",
      ticketReferenceDigests: [expect.stringMatching(/^[0-9a-f]{64}$/)],
      externalSideEffect: false,
    });

    const cancelIntent = buildFlightIdempotencyIntent({
      operation: "cancel_order",
      scopeId: "account_fixture_0001",
      requestId: "request_cancel_0001",
      payload: { orderId },
    });
    expect(await adapter.cancelOrder({ orderId, idempotency: cancelIntent }, syntheticCommercePolicy, {})).toEqual({
      providerId: "synthetic_flight_fixture_v1",
      source: "synthetic_fixture",
      orderId,
      cancellationState: "cancelled",
      refundableAmount: syntheticFlightOfferFixture.total,
      providerReferenceDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      externalSideEffect: false,
    });
  });

  it("exposes every live-operation seam with per-call context while synthetic mode stays side-effect free", async () => {
    const adapter = new SyntheticFlightProviderAdapter({ enabled: true });
    const unsupportedCalls = [
      () => adapter.changeOrder({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.authorizePayment({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.capturePayment({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.refundPayment({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.voidPayment({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.voidTickets({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.exchangeTickets({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.processWebhook({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.reconcileOrder({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.reconcilePayment({} as never, syntheticAllOperationsPolicy, {}),
      () => adapter.reconcileTickets({} as never, syntheticAllOperationsPolicy, {}),
    ];
    for (const call of unsupportedCalls) {
      await expect(call()).rejects.toThrow(/malformed or unreviewed|intentionally not implemented/i);
    }
    expect(adapter).toMatchObject({
      executionBinding: null,
      paymentExecutionBinding: null,
      externalNetworkAccess: false,
      supportsLiveTraffic: false,
    });

    await expect(adapter.search(syntheticFlightSearchRequest, syntheticReadPolicy, {
      executionBinding: {
        providerId: "provider_live_0001",
        adapterVersion: "1.0.0",
        adapterSourceDigest: "1".repeat(64),
        accountScopeReceiptDigest: "2".repeat(64),
        pointOfSaleScopeReceiptDigest: "3".repeat(64),
        contentScopeReceiptDigest: "4".repeat(64),
      },
    })).rejects.toThrow(/reject live execution/i);
  });

  it("binds create_order to immutable provider-balance authority without requiring a customer payment processor", async () => {
    const input = createOrderInput("offer_provider_balance_0001", "request_provider_balance_0001");
    let executions = 0;
    const execute: FlightProviderExecutor = async <K extends FlightProviderOperation>(
      request: FlightProviderExecutionRequest<K>,
    ) => {
      executions += 1;
      if (request.operation !== "create_order") throw new Error("Unexpected operation.");
      const createInput = request.input as FlightProviderCreateOrderInput;
      return {
        providerId: liveProviderBinding.providerId,
        source: "provider_sandbox",
        orderId: "order_provider_balance_0001",
        offerId: createInput.offerId,
        acceptedTermsDigest: createInput.acceptedTermsDigest,
        offerRefreshReceiptDigest: createInput.offerRefreshReceiptDigest,
        total: createInput.total,
        orderState: "order_confirmed",
        ticketState: "issued",
        ticketReferenceDigests: ["d".repeat(64)],
        providerReferenceDigest: "e".repeat(64),
        externalSideEffect: true,
      } as unknown as FlightProviderExecutionResult<K>;
    };
    const adapter = createGuardedFlightProviderAdapter({
      providerId: liveProviderBinding.providerId,
      mode: "provider_sandbox",
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: null,
      settlementExecutionBinding: liveSettlementBinding,
      execute,
    });
    expect(Object.isFrozen(adapter.settlementExecutionBinding)).toBe(true);
    const binding = buildFlightProviderOperationRequestBinding(adapter, "create_order", input);
    expect(binding.settlementBindingDigest).toBe(digestFlightRuntimeSettlementBinding(liveSettlementBinding));
    await expect(adapter.createOrder(input, sandboxAllOperationsPolicy, sandboxContextFor(adapter, "create_order", input)))
      .resolves.toMatchObject({
        acceptedTermsDigest: input.acceptedTermsDigest,
        offerRefreshReceiptDigest: input.offerRefreshReceiptDigest,
        total: input.total,
        ticketState: "issued",
        ticketReferenceDigests: ["d".repeat(64)],
      });
    expect(executions).toBe(1);

    const noSettlementAdapter = createGuardedFlightProviderAdapter({
      providerId: liveProviderBinding.providerId,
      mode: "provider_sandbox",
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: null,
      settlementExecutionBinding: null,
      execute,
    });
    expect(() => buildFlightProviderOperationRequestBinding(noSettlementAdapter, "create_order", input))
      .toThrow(/requires an exact settlement execution binding/i);

    const wrongSettlement = { ...liveSettlementBinding, environmentScopeReceiptDigest: "f".repeat(64) };
    await expect(adapter.createOrder(input, sandboxAllOperationsPolicy, {
      ...sandboxContextFor(adapter, "create_order", input),
      settlementExecutionBinding: wrongSettlement,
    })).rejects.toThrow(/another settlement authority/i);
    expect(executions).toBe(1);

    expect(() => buildFlightProviderOperationRequestBinding(adapter, "create_order", {
      ...input,
      travelers: [{ ...input.travelers[0]!, email: "must-not-cross-provider-boundary@example.test" }],
    } as never)).toThrow(/traveler binding.*unreviewed fields/i);
    expect(() => buildFlightProviderOperationRequestBinding(adapter, "create_order", {
      ...input,
      settlementIntent: { ...input.settlementIntent, amount: { currency: "USD", amountMinor: input.total.amountMinor + 1 } },
    })).toThrow(/does not match the exact order total/i);
    expect(() => buildFlightProviderOperationRequestBinding(adapter, "create_order", {
      ...input,
      acceptedTermsDigest: "f".repeat(64),
    })).toThrow(/idempotency evidence is bound to another exact operation request/i);
  });

  it("enforces the exact atomic create-order ticket/document and reviewed-receipt result matrix", async () => {
    const input = createOrderInput("offer_atomic_order_0001", "request_atomic_order_0001");
    const result = {
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      orderId: "order_atomic_order_0001",
      offerId: input.offerId,
      acceptedTermsDigest: input.acceptedTermsDigest,
      offerRefreshReceiptDigest: input.offerRefreshReceiptDigest,
      total: input.total,
      orderState: "order_confirmed",
      ticketState: "issued",
      ticketReferenceDigests: ["d".repeat(64)],
      providerReferenceDigest: "e".repeat(64),
      externalSideEffect: true,
    } as const;
    const valid = adapterReturning(result);
    await expect(valid.createOrder(input, sandboxAllOperationsPolicy, sandboxContextFor(valid, "create_order", input)))
      .resolves.toMatchObject({ ticketState: "issued", ticketReferenceDigests: result.ticketReferenceDigests });

    for (const invalidResult of [
      { ...result, ticketReferenceDigests: [] },
      { ...result, ticketState: "issuance_pending", ticketReferenceDigests: ["d".repeat(64)] },
      { ...result, ticketReferenceDigests: ["e".repeat(64), "d".repeat(64)] },
      { ...result, acceptedTermsDigest: "f".repeat(64) },
      { ...result, offerRefreshReceiptDigest: "f".repeat(64) },
      { ...result, total: { ...input.total, amountMinor: input.total.amountMinor + 1 } },
    ]) {
      const adversarial = adapterReturning(invalidResult);
      await expect(adversarial.createOrder(
        input,
        sandboxAllOperationsPolicy,
        sandboxContextFor(adversarial, "create_order", input),
      )).rejects.toThrow(/document state|malformed|another exact request/i);
    }
  });

  it("derives authorization digests from the actual adapter input before any Production verifier can run", async () => {
    const adapterIdentity = createGuardedFlightProviderAdapter({
      providerId: liveProviderBinding.providerId,
      mode: "provider_production" as const,
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: livePaymentBinding,
      settlementExecutionBinding: liveSettlementBinding,
      execute: async () => {
        throw new Error("Raw provider executor must not run for mismatched authority.");
      },
    });
    const inputFor = (offerId: string, requestId: string) => createOrderInput(offerId, requestId, {
      travelerRef: "traveler_fixture_0001",
    });
    const authorizedInput = inputFor("offer_fixture_authorized_0001", "request_order_authorized_0001");
    const differentInput = inputFor("offer_fixture_different_0002", "request_order_different_0002");
    const authorizedBinding = buildFlightProviderOperationRequestBinding(adapterIdentity, "create_order", authorizedInput);
    const differentBinding = buildFlightProviderOperationRequestBinding(adapterIdentity, "create_order", differentInput);
    expect(differentBinding).not.toEqual(authorizedBinding);
    let verifierCalls = 0;
    await expect(assertFlightProviderOperationAuthorized(
      adapterIdentity,
      "create_order",
      differentInput,
      resolveFlightRuntimePolicy(),
      {
        executionBinding: liveProviderBinding,
        settlementExecutionBinding: liveSettlementBinding,
        requestDigest: authorizedBinding.requestDigest,
        idempotencyRequestDigest: authorizedBinding.idempotencyRequestDigest,
        productionAuthorizationVerifier: {
          readTrustedTimeSeconds: () => {
            verifierCalls += 1;
            return 0;
          },
          verifyHmacSha256: () => {
            verifierCalls += 1;
            return false;
          },
          consumeNonce: async () => {
            verifierCalls += 1;
            return "unavailable";
          },
        },
      },
    )).rejects.toThrow(/request digest is bound to another exact provider input/i);
    expect(verifierCalls).toBe(0);
  });

  it("rejects an unregistered implementation before it can bypass the shared authorization gate", async () => {
    const unguarded = {
      providerId: liveProviderBinding.providerId,
      mode: "provider_sandbox",
      externalNetworkAccess: true,
      supportsLiveTraffic: true,
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: livePaymentBinding,
    };
    await expect(assertFlightProviderOperationAuthorized(
      unguarded as never,
      "search",
      syntheticFlightSearchRequest,
      syntheticReadPolicy,
      {},
    )).rejects.toThrow(/not a guarded implementation/i);
  });

  it("dispatches only the deeply frozen reviewed request even if the caller mutates input while authorization awaits", async () => {
    let rawInput: unknown = null;
    const adapter = createGuardedFlightProviderAdapter({
      providerId: liveProviderBinding.providerId,
      mode: "provider_sandbox",
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: livePaymentBinding,
      settlementExecutionBinding: null,
      execute: async <K extends FlightProviderOperation>(request: FlightProviderExecutionRequest<K>) => {
        if (request.operation !== "search") throw new Error("Unexpected operation.");
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.requestBinding)).toBe(true);
        expect(() => {
          (request.requestBinding as { requestDigest: string }).requestDigest = "9".repeat(64);
        }).toThrow();
        rawInput = request.input;
        return {
          providerId: liveProviderBinding.providerId,
          source: "provider_sandbox",
          requestDigest: request.requestBinding.requestDigest,
          offers: [],
          retrievedAt: "2027-02-01T00:00:00.000Z",
          externalSideEffect: false,
        } as unknown as FlightProviderExecutionResult<K>;
      },
    });
    const policy = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "sandbox",
      FLIGHT_RUNTIME_ENVIRONMENT: "preview",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      ...liveProviderBindingSettings,
    });
    const mutableRequest = {
      ...syntheticFlightSearchRequest,
      passengers: { ...syntheticFlightSearchRequest.passengers },
    };
    const binding = buildFlightProviderOperationRequestBinding(adapter, "search", mutableRequest);
    const pending = adapter.search(mutableRequest, policy, {
      executionBinding: liveProviderBinding,
      requestDigest: binding.requestDigest,
    });
    mutableRequest.destination = "SFO";
    mutableRequest.passengers.adults = 2;
    await expect(pending).resolves.toMatchObject({ requestDigest: binding.requestDigest, offers: [] });
    expect(rawInput).toMatchObject({ destination: "LAX", passengers: { adults: 1 } });
    expect(Object.isFrozen(rawInput)).toBe(true);
    expect(Object.isFrozen((rawInput as { passengers: object }).passengers)).toBe(true);
  });

  it("rejects transport results that are bound to another provider before returning them", async () => {
    const adapter = createGuardedFlightProviderAdapter({
      providerId: liveProviderBinding.providerId,
      mode: "provider_sandbox",
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: livePaymentBinding,
      settlementExecutionBinding: null,
      execute: async <K extends FlightProviderOperation>(request: FlightProviderExecutionRequest<K>) => {
        if (request.operation !== "search") throw new Error("Unexpected operation.");
        return {
          providerId: "provider_attacker_0001",
          source: "provider_sandbox",
          requestDigest: request.requestBinding.requestDigest,
          offers: [],
          retrievedAt: "2027-02-01T00:00:00.000Z",
          externalSideEffect: false,
        } as unknown as FlightProviderExecutionResult<K>;
      },
    });
    const policy = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "sandbox",
      FLIGHT_RUNTIME_ENVIRONMENT: "preview",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      ...liveProviderBindingSettings,
    });
    const binding = buildFlightProviderOperationRequestBinding(adapter, "search", syntheticFlightSearchRequest);
    await expect(adapter.search(syntheticFlightSearchRequest, policy, {
      executionBinding: liveProviderBinding,
      requestDigest: binding.requestDigest,
    })).rejects.toThrow(/another exact adapter identity/i);
  });

  it("rejects a processor result whose amount is not the exact authorized request amount", async () => {
    const orderId = "order_payment_contract_0001";
    const amount = { currency: "USD", amountMinor: 42_500 } as const;
    const input = {
      orderId,
      amount,
      idempotency: buildFlightIdempotencyIntent({
        operation: "authorize_payment",
        scopeId: "account_payment_contract_0001",
        requestId: "request_payment_contract_0001",
        payload: { orderId, amount },
      }),
    };
    const adapter = createGuardedFlightProviderAdapter({
      providerId: liveProviderBinding.providerId,
      mode: "provider_sandbox",
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: livePaymentBinding,
      settlementExecutionBinding: null,
      execute: async <K extends FlightProviderOperation>(request: FlightProviderExecutionRequest<K>) => {
        if (request.operation !== "authorize_payment") throw new Error("Unexpected operation.");
        const paymentInput = request.input as FlightProviderOperationInputMap["authorize_payment"];
        return {
          providerId: liveProviderBinding.providerId,
          source: "provider_sandbox",
          orderId: paymentInput.orderId,
          paymentState: "authorized",
          amount: { currency: "USD", amountMinor: 42_501 },
          processorReferenceDigest: "8".repeat(64),
          externalSideEffect: true,
        } as unknown as FlightProviderExecutionResult<K>;
      },
    });
    const policy = resolveFlightRuntimePolicy({
      FLIGHT_RUNTIME_MODE: "sandbox",
      FLIGHT_RUNTIME_ENVIRONMENT: "preview",
      FLIGHT_RUNTIME_ENABLED: "true",
      FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
      FLIGHT_PAYMENT_ENABLED: "true",
      FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
      ...liveProviderBindingSettings,
      ...livePaymentBindingSettings,
    });
    const binding = buildFlightProviderOperationRequestBinding(adapter, "authorize_payment", input);
    await expect(adapter.authorizePayment(input, policy, {
      executionBinding: liveProviderBinding,
      paymentExecutionBinding: livePaymentBinding,
      requestDigest: binding.requestDigest,
      idempotencyRequestDigest: binding.idempotencyRequestDigest,
    })).rejects.toThrow(/another exact amount/i);
  });

  it("rejects same-provider repricing that substitutes an itinerary or misstates an exact price change", async () => {
    const original = {
      ...syntheticFlightOfferFixture,
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox" as const,
      segments: syntheticFlightOfferFixture.segments.map((segment) => ({ ...segment })),
      total: { ...syntheticFlightOfferFixture.total },
    };
    const unrelated = {
      ...original,
      offerId: "offer_provider_reprice_0002",
      segments: original.segments.map((segment, index) => index === 0 ? { ...segment, marketingFlightNumber: "999" } : segment),
    };
    const unrelatedAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      originalOfferId: original.offerId,
      repricedOffer: unrelated,
      priceChanged: false,
      repricedAt: "2027-02-01T00:00:00.000Z",
      externalSideEffect: false,
    });
    await expect(unrelatedAdapter.reprice(
      original,
      sandboxAllOperationsPolicy,
      sandboxContextFor(unrelatedAdapter, "reprice", original),
    )).rejects.toThrow(/immutable itinerary/i);

    const changedPrice = { ...original, total: { ...original.total, amountMinor: original.total.amountMinor + 100 } };
    const falsePriceAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      originalOfferId: original.offerId,
      repricedOffer: changedPrice,
      priceChanged: false,
      repricedAt: "2027-02-01T00:00:00.000Z",
      externalSideEffect: false,
    });
    await expect(falsePriceAdapter.reprice(
      original,
      sandboxAllOperationsPolicy,
      sandboxContextFor(falsePriceAdapter, "reprice", original),
    )).rejects.toThrow(/exact old and new money/i);
  });

  it("rejects success states reported by the wrong provider operation", async () => {
    const orderInput = createOrderInput("offer_provider_order_0001", "request_provider_order_0001");
    const orderAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      orderId: "order_provider_states_0001",
      offerId: orderInput.offerId,
      acceptedTermsDigest: orderInput.acceptedTermsDigest,
      offerRefreshReceiptDigest: orderInput.offerRefreshReceiptDigest,
      total: orderInput.total,
      orderState: "order_confirmed",
      ticketState: "issued",
      ticketReferenceDigests: [],
      providerReferenceDigest: "8".repeat(64),
      externalSideEffect: true,
    });
    await expect(orderAdapter.createOrder(
      orderInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(orderAdapter, "create_order", orderInput),
    )).rejects.toThrow(/create_order|ticket|document state/i);

    const amount = { currency: "USD", amountMinor: 42_500 } as const;
    const paymentCases = [
      ["authorize_payment", "captured"],
      ["capture_payment", "refunded"],
      ["refund_payment", "authorized"],
    ] as const;
    for (const [operation, invalidState] of paymentCases) {
      const input = {
        orderId: "order_provider_states_0001",
        amount,
        idempotency: buildFlightIdempotencyIntent({
          operation,
          scopeId: "account_provider_states_0001",
          requestId: `request_${operation}_0001`,
          payload: { orderId: "order_provider_states_0001", amount },
        }),
      };
      const adapter = adapterReturning({
        providerId: liveProviderBinding.providerId,
        source: "provider_sandbox",
        orderId: input.orderId,
        paymentState: invalidState,
        amount,
        processorReferenceDigest: "9".repeat(64),
        externalSideEffect: true,
      });
      const context = sandboxContextFor(adapter, operation, input);
      const call = operation === "authorize_payment"
        ? adapter.authorizePayment(input, sandboxAllOperationsPolicy, context)
        : operation === "capture_payment"
          ? adapter.capturePayment(input, sandboxAllOperationsPolicy, context)
          : adapter.refundPayment(input, sandboxAllOperationsPolicy, context);
      await expect(call).rejects.toThrow(new RegExp(`Provider ${operation} payment state`, "i"));
    }

    const voidInput = {
      orderId: "order_provider_states_0001",
      authorizationReferenceDigest: "a".repeat(64),
      expectedAmount: amount,
      idempotency: buildFlightIdempotencyIntent({
        operation: "void_payment",
        scopeId: "account_provider_states_0001",
        requestId: "request_void_payment_0001",
        payload: {
          orderId: "order_provider_states_0001",
          authorizationReferenceDigest: "a".repeat(64),
          expectedAmount: amount,
        },
      }),
    };
    const voidAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      orderId: voidInput.orderId,
      paymentState: "captured",
      amount,
      processorReferenceDigest: "b".repeat(64),
      externalSideEffect: true,
    });
    await expect(voidAdapter.voidPayment(
      voidInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(voidAdapter, "void_payment", voidInput),
    )).rejects.toThrow(/void_payment payment state/i);

    const ticketCases = [
      ["issue_ticket", "voided"],
      ["void_ticket", "issued"],
      ["exchange_ticket", "voided"],
    ] as const;
    for (const [operation, invalidState] of ticketCases) {
      const ticketDigests = ["c".repeat(64)];
      const baseInput = {
        orderId: "order_provider_states_0001",
        ...(operation === "void_ticket" || operation === "exchange_ticket" ? { ticketReferenceDigests: ticketDigests } : {}),
        ...(operation === "exchange_ticket" ? { exchangeRequestDigest: "d".repeat(64) } : {}),
      };
      const idempotencyPayload = { ...baseInput };
      const input = {
        ...baseInput,
        idempotency: buildFlightIdempotencyIntent({
          operation,
          scopeId: "account_provider_states_0001",
          requestId: `request_${operation}_0001`,
          payload: idempotencyPayload,
        }),
      } as FlightProviderOperationInputMap[typeof operation];
      const adapter = adapterReturning({
        providerId: liveProviderBinding.providerId,
        source: "provider_sandbox",
        orderId: input.orderId,
        ticketState: invalidState,
        ticketReferenceDigests: ticketDigests,
        providerReferenceDigest: "e".repeat(64),
        externalSideEffect: true,
      });
      const context = sandboxContextFor(adapter, operation, input);
      const call = operation === "issue_ticket"
        ? adapter.issueTickets(input, sandboxAllOperationsPolicy, context)
        : operation === "void_ticket"
          ? adapter.voidTickets(input as FlightProviderOperationInputMap["void_ticket"], sandboxAllOperationsPolicy, context)
          : adapter.exchangeTickets(input as FlightProviderOperationInputMap["exchange_ticket"], sandboxAllOperationsPolicy, context);
      await expect(call).rejects.toThrow(new RegExp(`Provider ${operation} ticket state`, "i"));
    }
  });

  it("binds every reconciliation outcome to its exact ambiguous operation and ticket history", async () => {
    const amount = { currency: "USD", amountMinor: 42_500 } as const;
    const paymentInput = {
      orderId: "order_reconcile_contract_0001",
      operation: "authorize_payment" as const,
      originalOperationReceiptDigest: "1".repeat(64),
      paymentAttemptReceiptDigest: "2".repeat(64),
      processorOperationReferenceDigest: null,
      expectedAmount: amount,
      requestDigest: "3".repeat(64),
    };
    const wrongPaymentAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      orderId: paymentInput.orderId,
      operation: paymentInput.operation,
      originalOperationReceiptDigest: paymentInput.originalOperationReceiptDigest,
      paymentAttemptReceiptDigest: paymentInput.paymentAttemptReceiptDigest,
      processorOperationReferenceDigest: paymentInput.processorOperationReferenceDigest,
      expectedAmount: amount,
      providerStatusReceiptDigest: "4".repeat(64),
      resourceReceiptDigests: ["5".repeat(64)],
      outcome: "payment_captured",
      externalSideEffect: false,
    });
    await expect(wrongPaymentAdapter.reconcilePayment(
      paymentInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(wrongPaymentAdapter, "reconcile_payment", paymentInput),
    )).rejects.toThrow(/authorize_payment reconciliation outcome/i);

    const ticketInput = {
      orderId: "order_reconcile_contract_0001",
      operation: "issue_ticket" as const,
      originalOperationReceiptDigest: "6".repeat(64),
      originalTicketDocumentReceiptDigests: [],
      requestDigest: "7".repeat(64),
    };
    const wrongTicketAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      orderId: ticketInput.orderId,
      operation: ticketInput.operation,
      originalOperationReceiptDigest: ticketInput.originalOperationReceiptDigest,
      originalTicketDocumentReceiptDigests: ticketInput.originalTicketDocumentReceiptDigests,
      providerStatusReceiptDigest: "8".repeat(64),
      ticketReferenceDigests: ["9".repeat(64)],
      outcome: "tickets_voided",
      externalSideEffect: false,
    });
    await expect(wrongTicketAdapter.reconcileTickets(
      ticketInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(wrongTicketAdapter, "reconcile_tickets", ticketInput),
    )).rejects.toThrow(/issue_ticket reconciliation outcome/i);

    const createInput = {
      operation: "create_order" as const,
      offerId: "offer_reconcile_contract_0001",
      originalOperationReceiptDigest: "a".repeat(64),
      providerOperationRequestReceiptDigest: "b".repeat(64),
      requestDigest: "d".repeat(64),
    };
    const contradictoryCreateAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      offerId: createInput.offerId,
      orderId: null,
      operation: createInput.operation,
      originalOperationReceiptDigest: createInput.originalOperationReceiptDigest,
      providerOperationRequestReceiptDigest: createInput.providerOperationRequestReceiptDigest,
      providerStatusReceiptDigest: "e".repeat(64),
      resourceReceiptDigests: ["f".repeat(64)],
      outcome: "order_ticketed",
      ticketOutcome: "issued",
      externalSideEffect: false,
    });
    await expect(contradictoryCreateAdapter.reconcileOrder(
      createInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(contradictoryCreateAdapter, "reconcile_order", createInput),
    )).rejects.toThrow(/contradicts its exact ticket evidence/i);
    expect(() => buildFlightProviderOperationRequestBinding(contradictoryCreateAdapter, "reconcile_order", {
      ...createInput,
      orderId: "order_reconcile_contract_0001",
    } as never)).toThrow(/malformed or unreviewed fields/i);

    const absentCreateAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      offerId: createInput.offerId,
      orderId: null,
      operation: createInput.operation,
      originalOperationReceiptDigest: createInput.originalOperationReceiptDigest,
      providerOperationRequestReceiptDigest: createInput.providerOperationRequestReceiptDigest,
      providerStatusReceiptDigest: "e".repeat(64),
      resourceReceiptDigests: [],
      outcome: "order_absent",
      ticketOutcome: "no_active_ticket_documents",
      externalSideEffect: false,
    });
    await expect(absentCreateAdapter.reconcileOrder(
      createInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(absentCreateAdapter, "reconcile_order", createInput),
    )).resolves.toMatchObject({ offerId: createInput.offerId, orderId: null, outcome: "order_absent" });

    const cancelInput = {
      operation: "cancel_order" as const,
      orderId: "order_reconcile_contract_0001",
      originalOperationReceiptDigest: createInput.originalOperationReceiptDigest,
      providerOperationRequestReceiptDigest: createInput.providerOperationRequestReceiptDigest,
      originalTicketDocumentReceiptDigests: ["c".repeat(64)],
      requestDigest: createInput.requestDigest,
    };
    expect(() => buildFlightProviderOperationRequestBinding(absentCreateAdapter, "reconcile_order", {
      ...cancelInput,
      offerId: createInput.offerId,
    } as never)).toThrow(/malformed or unreviewed fields/i);
    const cancelledWithActiveTicketAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      orderId: cancelInput.orderId,
      operation: cancelInput.operation,
      originalOperationReceiptDigest: cancelInput.originalOperationReceiptDigest,
      providerOperationRequestReceiptDigest: cancelInput.providerOperationRequestReceiptDigest,
      originalTicketDocumentReceiptDigests: cancelInput.originalTicketDocumentReceiptDigests,
      providerStatusReceiptDigest: "e".repeat(64),
      resourceReceiptDigests: ["f".repeat(64)],
      outcome: "order_cancelled_ticket_active",
      ticketOutcome: "issued",
      externalSideEffect: false,
    });
    await expect(cancelledWithActiveTicketAdapter.reconcileOrder(
      cancelInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(cancelledWithActiveTicketAdapter, "reconcile_order", cancelInput),
    )).resolves.toMatchObject({ outcome: "order_cancelled_ticket_active", ticketOutcome: "issued" });

    const cancelWithoutPriorTickets = { ...cancelInput, originalTicketDocumentReceiptDigests: [] };
    const impossibleActiveTicketAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      orderId: cancelWithoutPriorTickets.orderId,
      operation: cancelWithoutPriorTickets.operation,
      originalOperationReceiptDigest: cancelWithoutPriorTickets.originalOperationReceiptDigest,
      providerOperationRequestReceiptDigest: cancelWithoutPriorTickets.providerOperationRequestReceiptDigest,
      originalTicketDocumentReceiptDigests: [],
      providerStatusReceiptDigest: "e".repeat(64),
      resourceReceiptDigests: ["f".repeat(64)],
      outcome: "order_cancelled_ticket_active",
      ticketOutcome: "issued",
      externalSideEffect: false,
    });
    await expect(impossibleActiveTicketAdapter.reconcileOrder(
      cancelWithoutPriorTickets,
      sandboxAllOperationsPolicy,
      sandboxContextFor(impossibleActiveTicketAdapter, "reconcile_order", cancelWithoutPriorTickets),
    )).rejects.toThrow(/contradicts its exact ticket evidence/i);

    const activeOrderWithVoidedTicketsAdapter = adapterReturning({
      providerId: liveProviderBinding.providerId,
      source: "provider_sandbox",
      orderId: cancelInput.orderId,
      operation: cancelInput.operation,
      originalOperationReceiptDigest: cancelInput.originalOperationReceiptDigest,
      providerOperationRequestReceiptDigest: cancelInput.providerOperationRequestReceiptDigest,
      originalTicketDocumentReceiptDigests: cancelInput.originalTicketDocumentReceiptDigests,
      providerStatusReceiptDigest: "e".repeat(64),
      resourceReceiptDigests: ["f".repeat(64)],
      outcome: "order_confirmed",
      ticketOutcome: "voided",
      externalSideEffect: false,
    });
    await expect(activeOrderWithVoidedTicketsAdapter.reconcileOrder(
      cancelInput,
      sandboxAllOperationsPolicy,
      sandboxContextFor(activeOrderWithVoidedTicketsAdapter, "reconcile_order", cancelInput),
    )).resolves.toMatchObject({ outcome: "order_confirmed", ticketOutcome: "voided" });
  });

  it("parses only the exact pinned synthetic webhook after raw-body verification", () => {
    const secret = "synthetic-webhook-secret-that-is-at-least-32-bytes";
    const signatureHex = createHmac("sha256", secret)
      .update(buildFlightWebhookSigningPayload(syntheticFlightWebhookFixture.timestampSeconds, syntheticFlightWebhookFixture.rawBody))
      .digest("hex");
    const verification = verifyFlightWebhookHmac({
      rawBody: syntheticFlightWebhookFixture.rawBody,
      signatureHex,
      timestampSeconds: syntheticFlightWebhookFixture.timestampSeconds,
      secret,
      nowSeconds: syntheticFlightWebhookFixture.timestampSeconds,
    });
    expect(parseVerifiedSyntheticFlightWebhook(syntheticFlightWebhookFixture.rawBody, verification)).toEqual(syntheticFlightWebhookEvent);
    expect(() => parseVerifiedSyntheticFlightWebhook(syntheticFlightWebhookFixture.rawBody, { ...verification, bodyDigest: "0".repeat(64) }))
      .toThrow("bound to a different payload");
    expect(() => parseVerifiedSyntheticFlightWebhook(syntheticFlightWebhookFixture.rawBody, { verified: false, reason: "invalid_signature", bodyDigest: null }))
      .toThrow("not cryptographically verified");
  });
});
