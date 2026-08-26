import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES,
  FlightConsumerPreviewStripeWebhookError,
  createInjectedFlightConsumerPreviewStripeWebhookWorkflow,
  type FlightConsumerPreviewStripeWebhookBinding,
  type FlightConsumerPreviewStripeWebhookConfiguration,
  type FlightConsumerPreviewStripeWebhookLedgerPort,
  type FlightConsumerPreviewStripeWebhookStripePort,
  type FlightConsumerStripeWebhookClaimParameters,
  type FlightConsumerStripeWebhookCompleteParameters,
  type FlightConsumerStripeWebhookEscalationParameters,
  type FlightConsumerStripeWebhookReclaimParameters,
  type FlightConsumerStripeWebhookRecordParameters,
} from "../lib/flights/consumer-preview/stripe-webhook.server";

const orderId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333";
const ledgerId = "44444444-4444-4444-8444-444444444444";
const reconciliationCaseId = "55555555-5555-4555-8555-555555555555";
const paymentIntentId = "pi_testpayment0001";
const chargeId = "ch_testcharge00001";
const eventId = "evt_testevent00001";
const accountId = "acct_testpreview0001";
const trustedTime = "2026-08-25T12:05:00.000Z";
const created = Math.floor(Date.parse("2026-08-25T12:00:00.000Z") / 1_000);
const rawPiiMarker = "traveler-secret@example.invalid";
const rawBody = JSON.stringify({ marker: rawPiiMarker, fixture: "signed Stripe test event" });
const signature = "t=1787659200,v1=test_signature_00000001";

const binding: FlightConsumerPreviewStripeWebhookBinding = Object.freeze({
  executionScopeSha256: "a".repeat(64),
  paymentProcessorCode: "stripe" as const,
  paymentEnvironment: "test" as const,
  paymentAccountSha256: "b".repeat(64),
  paymentSourceSha256: "c".repeat(64),
  paymentAdapterVersionSha256: "d".repeat(64),
});

const configuration: FlightConsumerPreviewStripeWebhookConfiguration = Object.freeze({
  stripeSecretKey: "sk_test_preview_secret_12345678",
  previewWebhookSecret: "whsec_flight_preview_only_12345678",
  genericWebhookSecret: "whsec_generic_hotel_webhook_12345678",
  previewStripeAccountSha256: binding.paymentAccountSha256,
  previewStripeAccountId: accountId,
});

const metadata = Object.freeze({
  integration: "flight_consumer_preview_v1",
  execution_mode: "test",
  order_id: orderId,
  customer_id: customerId,
  execution_scope_sha256: binding.executionScopeSha256,
  payment_account_sha256: binding.paymentAccountSha256,
  payment_source_sha256: binding.paymentSourceSha256,
  payment_adapter_version_sha256: binding.paymentAdapterVersionSha256,
});

type FakePaymentIntent = {
  id: string;
  object: string;
  livemode: boolean;
  amount: number;
  amountCapturable: number;
  amountReceived: number;
  currency: string;
  captureMethod: string;
  status: string;
  metadata: Record<string, string>;
};

function paymentIntent(status: string): FakePaymentIntent {
  return {
    id: paymentIntentId,
    object: "payment_intent",
    livemode: false,
    amount: 123_456,
    amountCapturable: status === "requires_capture" ? 123_456 : 0,
    amountReceived: status === "succeeded" ? 123_456 : 0,
    currency: "usd",
    captureMethod: "manual",
    status,
    metadata: { ...metadata },
  };
}

function stripeEvent(
  type = "payment_intent.amount_capturable_updated",
  dataObject: unknown = paymentIntent("requires_capture"),
) {
  return {
    id: eventId,
    type,
    livemode: false,
    account: accountId,
    created,
    requestIdempotencyKey: "stripe-request-idempotency-key-test-0001",
    dataObject,
  };
}

const paymentLink = Object.freeze({
  paymentId,
  orderId,
  customerId,
  paymentIntentId,
  amountCents: 123_456,
  currency: "USD" as const,
  executionMode: "test" as const,
  executionScopeSha256: binding.executionScopeSha256,
  processorCode: "stripe" as const,
});

class FakeStripeWebhookPort implements FlightConsumerPreviewStripeWebhookStripePort {
  event: unknown = stripeEvent();
  retrievedIntent: unknown = paymentIntent("succeeded");
  signatureFailure: Error | null = null;
  retrieveFailure: Error | null = null;
  readonly constructCalls: Array<{ rawBody: string; signature: string; webhookSecret: string }> = [];
  readonly retrieveCalls: string[] = [];

  constructEvent(body: string, header: string, secret: string) {
    this.constructCalls.push({ rawBody: body, signature: header, webhookSecret: secret });
    if (this.signatureFailure) throw this.signatureFailure;
    return structuredClone(this.event);
  }

  async retrievePaymentIntent(reference: string) {
    this.retrieveCalls.push(reference);
    if (this.retrieveFailure) throw this.retrieveFailure;
    return structuredClone(this.retrievedIntent);
  }
}

class FakeLedger implements FlightConsumerPreviewStripeWebhookLedgerPort {
  link: unknown = paymentLink;
  recordResults: unknown[] = [[{
    decision: "created",
    ledger_id: ledgerId,
    ledger_revision: 0,
    ledger_state: "verified",
  }]];
  claimResult: unknown | undefined;
  reclaimResult: unknown | null | undefined = null;
  completeResult: unknown | undefined;
  failure: Error | null = null;
  claimFailure: Error | null = null;
  readonly resolveCalls: unknown[] = [];
  readonly recordCalls: FlightConsumerStripeWebhookRecordParameters[] = [];
  readonly claimCalls: FlightConsumerStripeWebhookClaimParameters[] = [];
  readonly reclaimCalls: FlightConsumerStripeWebhookReclaimParameters[] = [];
  readonly escalationCalls: FlightConsumerStripeWebhookEscalationParameters[] = [];
  readonly completeCalls: FlightConsumerStripeWebhookCompleteParameters[] = [];

  async resolvePaymentLink(input: unknown) {
    this.resolveCalls.push(structuredClone(input));
    if (this.failure) throw this.failure;
    return structuredClone(this.link);
  }

  async record(parameters: FlightConsumerStripeWebhookRecordParameters) {
    this.recordCalls.push(structuredClone(parameters));
    if (this.failure) throw this.failure;
    return structuredClone(this.recordResults[Math.min(this.recordCalls.length - 1, this.recordResults.length - 1)]);
  }

  async claim(parameters: FlightConsumerStripeWebhookClaimParameters) {
    this.claimCalls.push(structuredClone(parameters));
    if (this.claimFailure) throw this.claimFailure;
    if (this.failure) throw this.failure;
    return structuredClone(this.claimResult ?? [{
      ledger_id: ledgerId,
      ledger_revision: 1,
      ledger_state: "processing",
      processing_lease_token_sha256: parameters.p_lease_token_sha256,
      processing_lease_expires_at: "2026-08-25T12:06:00.000Z",
      processing_attempt_count: 1,
    }]);
  }

  async reclaim(parameters: FlightConsumerStripeWebhookReclaimParameters) {
    this.reclaimCalls.push(structuredClone(parameters));
    if (this.failure) throw this.failure;
    if (this.reclaimResult === null) return null;
    return structuredClone(this.reclaimResult ?? [{
      ledger_id: ledgerId,
      ledger_revision: 1,
      ledger_state: "processing",
      processing_lease_token_sha256: parameters.p_lease_token_sha256,
      processing_lease_expires_at: "2026-08-25T12:06:00.000Z",
      processing_attempt_count: 2,
    }]);
  }

  async escalate(parameters: FlightConsumerStripeWebhookEscalationParameters) {
    this.escalationCalls.push(structuredClone(parameters));
    if (this.failure) throw this.failure;
    return [{
      decision: "created",
      reconciliation_case_id: reconciliationCaseId,
      order_id: orderId,
      event_type: parameters.p_expected_event_type,
      case_status: "open",
    }];
  }

  async complete(parameters: FlightConsumerStripeWebhookCompleteParameters) {
    this.completeCalls.push(structuredClone(parameters));
    if (this.failure) throw this.failure;
    return structuredClone(this.completeResult ?? [{
      ledger_id: ledgerId,
      ledger_revision: 2,
      ledger_state: parameters.p_outcome,
    }]);
  }
}

function createSubject(
  stripe = new FakeStripeWebhookPort(),
  ledger = new FakeLedger(),
  config = configuration,
) {
  const workflow = createInjectedFlightConsumerPreviewStripeWebhookWorkflow(binding, config, {
    stripe,
    ledger,
    readTrustedTime: () => trustedTime,
  });
  return { workflow, stripe, ledger };
}

describe("Flight Consumer Preview Stripe webhook ingestion", () => {
  it.each([
    ["payment_intent.amount_capturable_updated", paymentIntent("requires_capture")],
    ["payment_intent.succeeded", paymentIntent("succeeded")],
    ["payment_intent.payment_failed", paymentIntent("requires_payment_method")],
    ["charge.refunded", {
      id: chargeId,
      object: "charge",
      livemode: false,
      paymentIntentId,
      amount: 123_456,
      amountRefunded: 123_456,
      currency: "usd",
      captured: true,
      paid: true,
      status: "succeeded",
    }],
  ])("records, claims, and completes %s as a reconciliation-only signal", async (eventType, dataObject) => {
    const stripe = new FakeStripeWebhookPort();
    stripe.event = stripeEvent(eventType, dataObject);
    const { workflow, ledger } = createSubject(stripe);
    const adverse = eventType === "payment_intent.payment_failed"
      || eventType === "charge.refunded";
    await expect(workflow.ingest({ rawBody, signature })).resolves.toEqual({
      version: "flight-consumer-preview-stripe-webhook-result-v1",
      decision: adverse ? "blocked" : "processed",
      eventType,
      providerDispatchAuthorized: false,
    });
    expect(ledger.recordCalls).toHaveLength(1);
    expect(ledger.recordCalls[0]).toMatchObject({
      p_source: "stripe",
      p_event_type: eventType,
      p_event_id_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_idempotency_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_semantic_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_verification_receipt_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_occurred_at: "2026-08-25T12:00:00.000Z",
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_provider_attempt_id: null,
    });
    expect(ledger.claimCalls).toEqual([{
      p_ledger_id: ledgerId,
      p_expected_revision: 0,
      p_lease_token_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_lease_duration_seconds: 60,
    }]);
    expect(ledger.completeCalls[0]).toMatchObject({
      p_ledger_id: ledgerId,
      p_expected_revision: 1,
      p_lease_token_sha256: ledger.claimCalls[0]!.p_lease_token_sha256,
      p_outcome: adverse ? "blocked" : "processed",
      p_outcome_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(ledger.escalationCalls).toEqual(adverse ? [{
      p_ledger_id: ledgerId,
      p_expected_event_type: eventType,
      p_expected_semantic_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_expected_lease_token_sha256:
        ledger.claimCalls[0]!.p_lease_token_sha256,
    }] : []);
    const durablePayload = JSON.stringify({
      record: ledger.recordCalls,
      claim: ledger.claimCalls,
      complete: ledger.completeCalls,
      escalation: ledger.escalationCalls,
    });
    expect(durablePayload).not.toContain(rawPiiMarker);
    expect(durablePayload).not.toContain(signature);
    expect(durablePayload).not.toContain(eventId);
    expect(durablePayload).not.toContain(paymentIntentId);
    expect(stripe.retrieveCalls).toEqual(eventType === "charge.refunded" ? [paymentIntentId] : []);
  });

  it("passes the untouched body and signature only to the dedicated Preview verifier", async () => {
    const { workflow, stripe } = createSubject();
    await workflow.ingest({ rawBody, signature });
    expect(stripe.constructCalls).toEqual([{
      rawBody,
      signature,
      webhookSecret: configuration.previewWebhookSecret,
    }]);
  });

  it("deduplicates by Stripe Event identity when distinct events share one API-request key", async () => {
    const stripe = new FakeStripeWebhookPort();
    const ledger = new FakeLedger();
    const { workflow } = createSubject(stripe, ledger);
    const sharedRequestIdempotencyKey = "stripe-shared-request-idempotency-key-0001";

    stripe.event = {
      ...stripeEvent(),
      id: "evt_distinctevent00001",
      requestIdempotencyKey: sharedRequestIdempotencyKey,
    };
    await workflow.ingest({
      rawBody: JSON.stringify({ fixture: "first immutable Stripe Event" }),
      signature,
    });

    stripe.event = {
      ...stripeEvent(),
      id: "evt_distinctevent00002",
      requestIdempotencyKey: sharedRequestIdempotencyKey,
    };
    await workflow.ingest({
      rawBody: JSON.stringify({ fixture: "second immutable Stripe Event" }),
      signature,
    });

    expect(ledger.recordCalls).toHaveLength(2);
    expect(ledger.recordCalls[0]!.p_event_id_sha256)
      .not.toBe(ledger.recordCalls[1]!.p_event_id_sha256);
    expect(ledger.recordCalls[0]!.p_idempotency_sha256)
      .not.toBe(ledger.recordCalls[1]!.p_idempotency_sha256);
  });

  it("acknowledges terminal and in-progress replays without another mutation", async () => {
    const terminalLedger = new FakeLedger();
    terminalLedger.recordResults = [[{
      decision: "replay",
      ledger_id: ledgerId,
      ledger_revision: 2,
      ledger_state: "processed",
    }]];
    const terminal = createSubject(new FakeStripeWebhookPort(), terminalLedger);
    await expect(terminal.workflow.ingest({ rawBody, signature }))
      .resolves.toMatchObject({ decision: "replayed" });
    expect(terminalLedger.claimCalls).toHaveLength(0);
    expect(terminalLedger.completeCalls).toHaveLength(0);

    const processingLedger = new FakeLedger();
    processingLedger.recordResults = [[{
      decision: "replay",
      ledger_id: ledgerId,
      ledger_revision: 1,
      ledger_state: "processing",
    }]];
    const processing = createSubject(new FakeStripeWebhookPort(), processingLedger);
    await expect(processing.workflow.ingest({ rawBody, signature }))
      .resolves.toMatchObject({ decision: "processing" });
    expect(processingLedger.claimCalls).toHaveLength(0);
    expect(processingLedger.reclaimCalls).toEqual([expect.objectContaining({
      p_ledger_id: ledgerId,
      p_expected_revision: 1,
      p_stale_before: "2026-08-25T12:02:00.000Z",
      p_recovery_receipt_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_lease_token_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_lease_duration_seconds: 60,
    })]);
    expect(processingLedger.completeCalls).toHaveLength(0);
  });

  it("backfills an adverse operational case on terminal replay", async () => {
    const stripe = new FakeStripeWebhookPort();
    stripe.event = stripeEvent(
      "payment_intent.payment_failed",
      paymentIntent("requires_payment_method"),
    );
    const ledger = new FakeLedger();
    ledger.recordResults = [[{
      decision: "replay",
      ledger_id: ledgerId,
      ledger_revision: 2,
      ledger_state: "processed",
    }]];
    await expect(createSubject(stripe, ledger).workflow.ingest({ rawBody, signature }))
      .resolves.toMatchObject({ decision: "replayed" });
    expect(ledger.escalationCalls).toEqual([expect.objectContaining({
      p_ledger_id: ledgerId,
      p_expected_event_type: "payment_intent.payment_failed",
      p_expected_lease_token_sha256: null,
    })]);
    expect(ledger.claimCalls).toHaveLength(0);
    expect(ledger.completeCalls).toHaveLength(0);
  });

  it("reclaims an expired processing lease and token-fences terminal completion", async () => {
    const ledger = new FakeLedger();
    ledger.recordResults = [[{
      decision: "replay",
      ledger_id: ledgerId,
      ledger_revision: 1,
      ledger_state: "processing",
    }]];
    ledger.reclaimResult = undefined;
    const { workflow } = createSubject(new FakeStripeWebhookPort(), ledger);

    await expect(workflow.ingest({ rawBody, signature }))
      .resolves.toMatchObject({ decision: "processed" });
    expect(ledger.claimCalls).toHaveLength(0);
    expect(ledger.reclaimCalls).toHaveLength(1);
    expect(ledger.completeCalls[0]!.p_lease_token_sha256)
      .toBe(ledger.reclaimCalls[0]!.p_lease_token_sha256);
  });

  it("recovers a claim race by re-reading the durable ledger", async () => {
    const ledger = new FakeLedger();
    ledger.claimFailure = new Error("CAS race");
    ledger.recordResults = [
      [{ decision: "created", ledger_id: ledgerId, ledger_revision: 0, ledger_state: "verified" }],
      [{ decision: "replay", ledger_id: ledgerId, ledger_revision: 1, ledger_state: "processing" }],
    ];
    const { workflow } = createSubject(new FakeStripeWebhookPort(), ledger);
    await expect(workflow.ingest({ rawBody, signature }))
      .resolves.toMatchObject({ decision: "processing" });
    expect(ledger.recordCalls).toHaveLength(2);
    expect(ledger.completeCalls).toHaveLength(0);
  });

  it("rejects invalid signatures and unsupported event types before ledger access", async () => {
    const invalidStripe = new FakeStripeWebhookPort();
    invalidStripe.signatureFailure = new Error(`bad signature ${rawPiiMarker}`);
    const invalid = createSubject(invalidStripe);
    const signatureError = await invalid.workflow.ingest({ rawBody, signature }).catch((error: unknown) => error);
    expect(signatureError).toBeInstanceOf(FlightConsumerPreviewStripeWebhookError);
    expect((signatureError as FlightConsumerPreviewStripeWebhookError).httpStatus).toBe(400);
    expect(String(signatureError)).not.toContain(rawPiiMarker);
    expect(invalid.ledger.recordCalls).toHaveLength(0);

    const unsupportedStripe = new FakeStripeWebhookPort();
    unsupportedStripe.event = stripeEvent("checkout.session.completed", { object: "checkout.session" });
    const unsupported = createSubject(unsupportedStripe);
    await expect(unsupported.workflow.ingest({ rawBody, signature }))
      .rejects.toMatchObject({ httpStatus: 400 });
    expect(unsupported.ledger.recordCalls).toHaveLength(0);
  });

  it("rejects livemode, wrong-account, and cross-scope payment authority", async () => {
    const cases: Array<(event: ReturnType<typeof stripeEvent>) => void> = [
      (event) => { event.livemode = true; },
      (event) => { event.account = "acct_wrongaccount0001"; },
      (event) => { (event.dataObject as ReturnType<typeof paymentIntent>).livemode = true; },
      (event) => { (event.dataObject as ReturnType<typeof paymentIntent>).amount += 1; },
      (event) => { (event.dataObject as ReturnType<typeof paymentIntent>).captureMethod = "automatic"; },
      (event) => { (event.dataObject as ReturnType<typeof paymentIntent>).metadata.order_id = "99999999-9999-4999-8999-999999999999"; },
      (event) => { (event.dataObject as ReturnType<typeof paymentIntent>).metadata.customer_id = "99999999-9999-4999-8999-999999999999"; },
      (event) => { (event.dataObject as ReturnType<typeof paymentIntent>).metadata.execution_scope_sha256 = "e".repeat(64); },
      (event) => { (event.dataObject as ReturnType<typeof paymentIntent>).metadata.payment_account_sha256 = "e".repeat(64); },
    ];
    for (const mutate of cases) {
      const stripe = new FakeStripeWebhookPort();
      const event = stripeEvent();
      mutate(event);
      stripe.event = event;
      const subject = createSubject(stripe);
      await expect(subject.workflow.ingest({ rawBody, signature }))
        .rejects.toMatchObject({ httpStatus: 400 });
      expect(subject.ledger.recordCalls).toHaveLength(0);
    }
  });

  it("accepts direct-account events without event.account but rejects an unbound Connect account", async () => {
    const directStripe = new FakeStripeWebhookPort();
    directStripe.event = { ...stripeEvent(), account: null };
    await expect(createSubject(directStripe).workflow.ingest({ rawBody, signature }))
      .resolves.toMatchObject({ decision: "processed" });

    const connectStripe = new FakeStripeWebhookPort();
    connectStripe.event = stripeEvent();
    const withoutAccountId = {
      stripeSecretKey: configuration.stripeSecretKey,
      previewWebhookSecret: configuration.previewWebhookSecret,
      genericWebhookSecret: configuration.genericWebhookSecret,
      previewStripeAccountSha256: configuration.previewStripeAccountSha256,
    };
    await expect(createSubject(connectStripe, new FakeLedger(), withoutAccountId)
      .workflow.ingest({ rawBody, signature })).rejects.toMatchObject({ httpStatus: 400 });
  });

  it("requires an exact existing payment/order/amount link before recording", async () => {
    for (const link of [
      null,
      { ...paymentLink, orderId: "99999999-9999-4999-8999-999999999999" },
      { ...paymentLink, customerId: "99999999-9999-4999-8999-999999999999" },
      { ...paymentLink, paymentIntentId: "pi_anotherpayment01" },
      { ...paymentLink, amountCents: paymentLink.amountCents + 1 },
      { ...paymentLink, executionScopeSha256: "e".repeat(64) },
    ]) {
      const ledger = new FakeLedger();
      ledger.link = link;
      const { workflow } = createSubject(new FakeStripeWebhookPort(), ledger);
      await expect(workflow.ingest({ rawBody, signature }))
        .rejects.toMatchObject({ httpStatus: 400 });
      expect(ledger.recordCalls).toHaveLength(0);
    }
  });

  it("rejects a malformed charge and a live retrieved PaymentIntent", async () => {
    const malformedChargeStripe = new FakeStripeWebhookPort();
    malformedChargeStripe.event = stripeEvent("charge.refunded", {
      id: chargeId,
      object: "charge",
      livemode: false,
      paymentIntentId,
      amount: 123_456,
      amountRefunded: 123_457,
      currency: "usd",
      captured: true,
      paid: true,
      status: "succeeded",
    });
    await expect(createSubject(malformedChargeStripe).workflow.ingest({ rawBody, signature }))
      .rejects.toMatchObject({ httpStatus: 400 });

    const liveIntentStripe = new FakeStripeWebhookPort();
    liveIntentStripe.event = stripeEvent("charge.refunded", {
      id: chargeId,
      object: "charge",
      livemode: false,
      paymentIntentId,
      amount: 123_456,
      amountRefunded: 123_456,
      currency: "usd",
      captured: true,
      paid: true,
      status: "succeeded",
    });
    liveIntentStripe.retrievedIntent = { ...paymentIntent("succeeded"), livemode: true };
    await expect(createSubject(liveIntentStripe).workflow.ingest({ rawBody, signature }))
      .rejects.toMatchObject({ httpStatus: 400 });
  });

  it("fails closed when the dedicated endpoint configuration is not isolated", () => {
    expect(() => createSubject(new FakeStripeWebhookPort(), new FakeLedger(), {
      ...configuration,
      genericWebhookSecret: configuration.previewWebhookSecret,
    })).toThrow(FlightConsumerPreviewStripeWebhookError);
    expect(() => createSubject(new FakeStripeWebhookPort(), new FakeLedger(), {
      ...configuration,
      stripeSecretKey: "sk_live_not_allowed_12345678",
    })).toThrow(FlightConsumerPreviewStripeWebhookError);
    expect(() => createSubject(new FakeStripeWebhookPort(), new FakeLedger(), {
      ...configuration,
      previewStripeAccountSha256: "e".repeat(64),
    })).toThrow(FlightConsumerPreviewStripeWebhookError);
  });

  it("bounds raw input and normalizes ledger outages without leaking data", async () => {
    const subject = createSubject();
    await expect(subject.workflow.ingest({
      rawBody: "x".repeat(FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_MAX_BYTES + 1),
      signature,
    })).rejects.toMatchObject({ httpStatus: 400 });
    expect(subject.stripe.constructCalls).toHaveLength(0);

    const failedLedger = new FakeLedger();
    failedLedger.failure = new Error(`database failure ${rawPiiMarker}`);
    const failed = createSubject(new FakeStripeWebhookPort(), failedLedger);
    const error = await failed.workflow.ingest({ rawBody, signature }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(FlightConsumerPreviewStripeWebhookError);
    expect((error as FlightConsumerPreviewStripeWebhookError).httpStatus).toBe(503);
    expect(String(error)).not.toContain(rawPiiMarker);
  });
});
