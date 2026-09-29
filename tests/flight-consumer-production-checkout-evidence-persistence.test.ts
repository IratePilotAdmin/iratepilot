import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveCheckoutEvidencePersistence,
  FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_MIGRATION_VERSION,
  FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC,
  FlightConsumerLiveCheckoutEvidencePersistenceError,
  type FlightConsumerLiveCheckoutEvidenceRpcClient,
} from "../lib/flights/consumer-production/checkout-evidence-persistence.server";

const digest = (character: string) => character.repeat(64);
const customerId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const refreshId = "00000000-0000-4000-8000-000000000105";
const planId = "00000000-0000-4000-8000-000000000103";
const stripeExecutionId = "00000000-0000-4000-8000-000000000106";
const aggregateId = "00000000-0000-4000-8000-000000000107";
const ciphertext = (character: string) => `enc:v1:${character.repeat(32)}`;

const authorityReceipt = Object.freeze({
  provider_dispatch_authorized: false,
  stripe_dispatch_authorized: false,
  booking_authorized: false,
  order_authorized: false,
  payment_authorized: false,
  capture_authorized: false,
  refund_authorized: false,
  settlement_authorized: false,
  ticketing_authorized: false,
  servicing_authorized: false,
  consumer_release_enabled: false,
});

function prepareInput() {
  return {
    customerId,
    orderId,
    executionScopeSha256: digest("1"),
    idempotencySha256: digest("2"),
    checkoutBindingSha256: digest("3"),
    checkoutPrerequisiteSha256: digest("4"),
    offerRefreshAttemptId: refreshId,
    offerRefreshExecutionScopeSha256: digest("5"),
    offerBindingSha256: digest("6"),
    normalizedOfferSha256: digest("7"),
    offerTerminalResponseSha256: digest("8"),
    stripePlanId: planId,
    stripePlanSha256: digest("9"),
    stripeExecutionAttemptId: stripeExecutionId,
    stripeExecutionWorkflowSha256: digest("a"),
    stripeExecutionPrerequisiteSha256: digest("b"),
    stripeExecutionStateReceiptSha256: digest("c"),
    paymentBindingSha256: digest("d"),
    orderReferenceSha256: digest("e"),
    customerReferenceSha256: digest("f"),
    amountCents: 54_321,
    currency: "USD" as const,
    travelerPayloadCiphertext: ciphertext("A"),
    travelerEvidenceSha256: digest("0"),
    contactPayloadCiphertext: ciphertext("B"),
    contactEvidenceSha256: digest("1"),
    billingAddressPayloadCiphertext: ciphertext("C"),
    billingAddressEvidenceSha256: digest("2"),
    termsSnapshotSha256: digest("3"),
    termsAcceptanceSha256: digest("4"),
    termsAcceptedAt: "2026-08-27T12:00:00.000Z",
  };
}

function baseResult() {
  return {
    aggregate_id: aggregateId,
    amount_cents: 54_321,
    currency: "USD",
    state_receipt_sha256: digest("5"),
    ...authorityReceipt,
  };
}

function clientReturning(data: unknown) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  return {
    client: { rpc } as FlightConsumerLiveCheckoutEvidenceRpcClient,
    rpc,
  };
}

function appSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Flight Consumer Production checkout evidence persistence", () => {
  it("declares a frozen Production-local boundary with zero authority", () => {
    const persistence = createFlightConsumerLiveCheckoutEvidencePersistence(
      clientReturning(null).client,
    );
    expect(FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_MIGRATION_VERSION)
      .toBe("202608260107");
    expect(FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC).toEqual({
      prepare: "prepare_flight_consumer_live_checkout_evidence_v1",
      finalize: "finalize_flight_consumer_live_checkout_evidence_v1",
      abandon: "abandon_flight_consumer_live_checkout_evidence_v1",
    });
    expect(persistence).toMatchObject({
      version: "flight-consumer-live-checkout-evidence-persistence-v1",
      migrationVersion: "202608260107",
      productionLocal: true,
      routeExposed: false,
      duffelTransportImplemented: false,
      stripeTransportImplemented: false,
      databaseApplyAuthorized: false,
      providerDispatchAuthorized: false,
      stripeDispatchAuthorized: false,
      bookingAuthorized: false,
      orderAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      consumerReleaseEnabled: false,
    });
    expect(Object.isFrozen(persistence)).toBe(true);
  });

  it("maps the exact encrypted evidence and reviewed prerequisite to prepare", async () => {
    const result = {
      decision: "created",
      checkout_state: "prepared",
      checkout_revision: 0,
      ...baseResult(),
    };
    const { client, rpc } = clientReturning([result]);
    const persistence = createFlightConsumerLiveCheckoutEvidencePersistence(
      client,
    );
    await expect(persistence.prepare(prepareInput())).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC.prepare,
      {
        p_customer_id: customerId,
        p_order_id: orderId,
        p_execution_scope_sha256: digest("1"),
        p_idempotency_sha256: digest("2"),
        p_checkout_binding_sha256: digest("3"),
        p_checkout_prerequisite_sha256: digest("4"),
        p_offer_refresh_attempt_id: refreshId,
        p_offer_refresh_execution_scope_sha256: digest("5"),
        p_offer_binding_sha256: digest("6"),
        p_normalized_offer_sha256: digest("7"),
        p_offer_terminal_response_sha256: digest("8"),
        p_stripe_plan_id: planId,
        p_stripe_plan_sha256: digest("9"),
        p_stripe_execution_attempt_id: stripeExecutionId,
        p_stripe_execution_workflow_sha256: digest("a"),
        p_stripe_execution_prerequisite_sha256: digest("b"),
        p_stripe_execution_state_receipt_sha256: digest("c"),
        p_payment_binding_sha256: digest("d"),
        p_order_reference_sha256: digest("e"),
        p_customer_reference_sha256: digest("f"),
        p_amount_cents: 54_321,
        p_currency: "USD",
        p_traveler_payload_ciphertext: ciphertext("A"),
        p_traveler_evidence_sha256: digest("0"),
        p_contact_payload_ciphertext: ciphertext("B"),
        p_contact_evidence_sha256: digest("1"),
        p_billing_address_payload_ciphertext: ciphertext("C"),
        p_billing_address_evidence_sha256: digest("2"),
        p_terms_snapshot_sha256: digest("3"),
        p_terms_acceptance_sha256: digest("4"),
        p_terms_accepted_at: "2026-08-27T12:00:00.000Z",
      },
    );
    expect(JSON.stringify(result)).not.toContain(ciphertext("A"));
  });

  it("maps exact finalize and abandon CAS transitions", async () => {
    const finalized = {
      decision: "finalized",
      checkout_state: "finalized",
      checkout_revision: 1,
      ...baseResult(),
    };
    const first = clientReturning([finalized]);
    const finalizing = createFlightConsumerLiveCheckoutEvidencePersistence(
      first.client,
    );
    await expect(finalizing.finalize({
      aggregateId,
      expectedRevision: 0,
      executionScopeSha256: digest("1"),
      checkoutBindingSha256: digest("3"),
      finalizationEvidenceSha256: digest("6"),
    })).resolves.toEqual(finalized);
    expect(first.rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC.finalize,
      {
        p_aggregate_id: aggregateId,
        p_expected_revision: 0,
        p_execution_scope_sha256: digest("1"),
        p_checkout_binding_sha256: digest("3"),
        p_finalization_evidence_sha256: digest("6"),
      },
    );

    const abandoned = {
      decision: "abandoned",
      checkout_state: "abandoned",
      checkout_revision: 1,
      ...baseResult(),
    };
    const second = clientReturning([abandoned]);
    await expect(createFlightConsumerLiveCheckoutEvidencePersistence(
      second.client,
    ).abandon({
      aggregateId,
      expectedRevision: 0,
      executionScopeSha256: digest("1"),
      checkoutBindingSha256: digest("3"),
      abandonmentCode: "customer_cancelled",
      abandonmentEvidenceSha256: digest("7"),
    })).resolves.toEqual(abandoned);
    expect(second.rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_CHECKOUT_EVIDENCE_RPC.abandon,
      expect.objectContaining({
        p_expected_revision: 0,
        p_abandonment_code: "customer_cancelled",
        p_abandonment_evidence_sha256: digest("7"),
      }),
    );
  });

  it("rejects plaintext, digest reuse, reset, and extra secret fields before RPC", async () => {
    const { client, rpc } = clientReturning(null);
    const persistence = createFlightConsumerLiveCheckoutEvidencePersistence(
      client,
    );
    const invalid = [
      { ...prepareInput(), travelerPayloadCiphertext: "Jane Doe" },
      { ...prepareInput(), contactPayloadCiphertext: "ceo@example.com" },
      { ...prepareInput(), billingAddressPayloadCiphertext: "123 Main" },
      {
        ...prepareInput(),
        contactEvidenceSha256: prepareInput().travelerEvidenceSha256,
      },
      {
        ...prepareInput(),
        customerReferenceSha256: prepareInput().orderReferenceSha256,
      },
      { ...prepareInput(), providerOfferId: "off_plaintext" },
      { ...prepareInput(), paymentMethodId: "pm_plaintext" },
      { ...prepareInput(), clientSecret: "pi_secret_plaintext" },
    ];
    for (const input of invalid) {
      await expect(persistence.prepare(input as never)).rejects
        .toMatchObject({ reason: "invalid_input" });
    }
    await expect(persistence.finalize({
      aggregateId,
      expectedRevision: 1,
      executionScopeSha256: digest("1"),
      checkoutBindingSha256: digest("3"),
      finalizationEvidenceSha256: digest("6"),
    } as never)).rejects.toMatchObject({ reason: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects authority-bearing, ciphertext-bearing, and malformed receipts", async () => {
    const unsafe = {
      decision: "created",
      checkout_state: "prepared",
      checkout_revision: 0,
      ...baseResult(),
      payment_authorized: true,
    };
    await expect(createFlightConsumerLiveCheckoutEvidencePersistence(
      clientReturning([unsafe]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });

    const ciphertextBearing = {
      ...unsafe,
      payment_authorized: false,
      traveler_payload_ciphertext: ciphertext("A"),
    };
    await expect(createFlightConsumerLiveCheckoutEvidencePersistence(
      clientReturning([ciphertextBearing]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
  });

  it("normalizes RPC exceptions, database errors, and cardinality drift", async () => {
    const throwingClient: FlightConsumerLiveCheckoutEvidenceRpcClient = {
      async rpc() {
        throw new Error("private database detail");
      },
    };
    await expect(createFlightConsumerLiveCheckoutEvidencePersistence(
      throwingClient,
    ).prepare(prepareInput())).rejects.toEqual(
      new FlightConsumerLiveCheckoutEvidencePersistenceError("rpc_refused"),
    );
    const errorClient: FlightConsumerLiveCheckoutEvidenceRpcClient = {
      async rpc() {
        return { data: null, error: { code: "P0001" } };
      },
    };
    await expect(createFlightConsumerLiveCheckoutEvidencePersistence(
      errorClient,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "rpc_refused",
      message: expect.not.stringContaining("P0001"),
    });
    await expect(createFlightConsumerLiveCheckoutEvidencePersistence(
      clientReturning([]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
  });

  it("is server-only, transport-free, and absent from public routes", () => {
    const modulePath =
      "lib/flights/consumer-production/checkout-evidence-persistence.server.ts";
    const source = readFileSync(modulePath, "utf8");
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from ["']stripe["']/);
    expect(source).not.toMatch(/from ["']@supabase\/supabase-js["']/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("process.env");

    const publicSources = appSourceFiles("app").map((path) => ({
      path,
      source: readFileSync(path, "utf8"),
    }));
    for (const file of publicSources) {
      expect(file.source, file.path).not.toContain(
        "checkout-evidence-persistence.server",
      );
      expect(file.source, file.path).not.toContain(
        "prepare_flight_consumer_live_checkout_evidence_v1",
      );
    }
  });
});
