import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerLiveBookingSettlementPersistence,
  FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_MIGRATION_VERSION,
  FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_RPC,
  FlightConsumerLiveBookingSettlementPersistenceError,
  type FlightConsumerLiveBookingSettlementRpcClient,
} from "../lib/flights/consumer-production/booking-settlement-evidence-persistence.server";

const digest = (character: string) => character.repeat(64);
const checkoutId = "00000000-0000-4000-8000-000000000107";
const orderExecutionId = "00000000-0000-4000-8000-000000000108";
const captureId = "00000000-0000-4000-8000-000000000111";
const settlementId = "00000000-0000-4000-8000-000000000113";

const authorities = Object.freeze({
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
  blind_retry_authorized: false,
});

function prepareInput() {
  return {
    checkoutAggregateId: checkoutId,
    authorizationBridgeReceiptSha256: digest("1"),
    duffelOrderExecutionId: orderExecutionId,
    duffelOrderStateReceiptSha256: digest("2"),
    stripeCaptureAttemptId: captureId,
    stripeCaptureStateReceiptSha256: digest("3"),
    checkoutBindingSha256: digest("4"),
    offerBindingSha256: digest("5"),
    normalizedOfferSha256: digest("6"),
    paymentBindingSha256: digest("7"),
    paymentIntentReferenceSha256: digest("8"),
    providerOrderReferenceSha256: digest("9"),
    providerBookingReferenceSha256: digest("a"),
    chargeReferenceSha256: digest("b"),
    orderReferenceSha256: digest("c"),
    customerReferenceSha256: digest("d"),
    bookingBindingSha256: digest("e"),
    bookingPrerequisiteSha256: digest("f"),
    settlementEvidenceSha256: digest("0"),
    capturedAmountCents: 54_321,
    currency: "USD" as const,
  };
}

function result(state: "prepared" | "booked", revision: 0 | 1) {
  return {
    settlement_id: settlementId,
    booking_state: state,
    booking_revision: revision,
    ticketing_state: "pending",
    checkout_binding_sha256: digest("4"),
    offer_binding_sha256: digest("5"),
    payment_intent_reference_sha256: digest("8"),
    provider_order_reference_sha256: digest("9"),
    provider_booking_reference_sha256: digest("a"),
    charge_reference_sha256: digest("b"),
    captured_amount_cents: 54_321,
    currency: "USD",
    duffel_livemode: true,
    stripe_livemode: true,
    state_receipt_sha256: digest("2"),
    ...authorities,
  };
}

function clientReturning(data: unknown) {
  const rpc = vi.fn(async (
    _name: string,
    _args: Readonly<Record<string, unknown>>,
  ) => {
    void _name;
    void _args;
    return { data, error: null };
  });
  return {
    client: { rpc } as FlightConsumerLiveBookingSettlementRpcClient,
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

describe("Flight Consumer Production booking settlement persistence", () => {
  it("declares a dark evidence-only and ticket-pending boundary", () => {
    const persistence = createFlightConsumerLiveBookingSettlementPersistence(
      clientReturning(null).client,
    );
    expect(FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_MIGRATION_VERSION)
      .toBe("202608260113");
    expect(FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_RPC).toEqual({
      prepare: "prepare_flight_consumer_live_booking_settlement_v1",
      finalize: "finalize_flight_consumer_live_booking_settlement_v1",
    });
    expect(persistence).toMatchObject({
      version: "flight-consumer-live-booking-settlement-persistence-v1",
      productionDark: true,
      evidenceOnly: true,
      routeExposed: false,
      duffelTransportImplemented: false,
      stripeTransportImplemented: false,
      databaseApplyAuthorized: false,
      exact108TerminalOrderRequired: true,
      exact110AuthorizationBridgeRequired: true,
      exact111TerminalCaptureRequired: true,
      ticketingState: "pending",
      providerDispatchAuthorized: false,
      stripeDispatchAuthorized: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
    });
    expect(Object.isFrozen(persistence)).toBe(true);
  });

  it("maps exact cross-provider settlement preparation", async () => {
    const receipt = { decision: "created", ...result("prepared", 0) };
    const { client, rpc } = clientReturning([receipt]);
    await expect(createFlightConsumerLiveBookingSettlementPersistence(
      client,
    ).prepare(prepareInput())).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_RPC.prepare,
      {
        p_checkout_aggregate_id: checkoutId,
        p_authorization_bridge_receipt_sha256: digest("1"),
        p_duffel_order_execution_id: orderExecutionId,
        p_duffel_order_state_receipt_sha256: digest("2"),
        p_stripe_capture_attempt_id: captureId,
        p_stripe_capture_state_receipt_sha256: digest("3"),
        p_checkout_binding_sha256: digest("4"),
        p_offer_binding_sha256: digest("5"),
        p_normalized_offer_sha256: digest("6"),
        p_payment_binding_sha256: digest("7"),
        p_payment_intent_reference_sha256: digest("8"),
        p_provider_order_reference_sha256: digest("9"),
        p_provider_booking_reference_sha256: digest("a"),
        p_charge_reference_sha256: digest("b"),
        p_order_reference_sha256: digest("c"),
        p_customer_reference_sha256: digest("d"),
        p_booking_binding_sha256: digest("e"),
        p_booking_prerequisite_sha256: digest("f"),
        p_settlement_evidence_sha256: digest("0"),
        p_captured_amount_cents: 54_321,
        p_currency: "USD",
      },
    );
  });

  it("maps CAS finalization while ticketing remains pending", async () => {
    const receipt = { decision: "booked", ...result("booked", 1) };
    const { client, rpc } = clientReturning([receipt]);
    const outcome = await createFlightConsumerLiveBookingSettlementPersistence(
      client,
    ).finalize({
      settlementId,
      expectedRevision: 0,
      bookingBindingSha256: digest("e"),
      preparedReceiptSha256: digest("2"),
      finalBookingEvidenceSha256: digest("3"),
    });
    expect(outcome).toEqual(receipt);
    expect(outcome.ticketing_state).toBe("pending");
    expect(outcome.ticketing_authorized).toBe(false);
    expect(rpc).toHaveBeenCalledWith(
      FLIGHT_CONSUMER_LIVE_BOOKING_SETTLEMENT_RPC.finalize,
      {
        p_settlement_id: settlementId,
        p_expected_revision: 0,
        p_booking_binding_sha256: digest("e"),
        p_prepared_receipt_sha256: digest("2"),
        p_final_booking_evidence_sha256: digest("3"),
      },
    );
  });

  it("rejects reference aliasing, malformed digests, and secret fields", async () => {
    const { client, rpc } = clientReturning(null);
    const persistence = createFlightConsumerLiveBookingSettlementPersistence(
      client,
    );
    await expect(persistence.prepare({
      ...prepareInput(),
      providerBookingReferenceSha256: digest("9"),
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.prepare({
      ...prepareInput(),
      chargeReferenceSha256: digest("8"),
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.prepare({
      ...prepareInput(),
      paymentIntentReferenceSha256: "pi_live_secret",
    })).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.prepare({
      ...prepareInput(),
      clientSecret: "forbidden",
    } as never)).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(persistence.finalize({
      settlementId,
      expectedRevision: 0,
      bookingBindingSha256: digest("e"),
      preparedReceiptSha256: digest("2"),
      finalBookingEvidenceSha256: digest("2"),
    })).rejects.toMatchObject({ reason: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed rows, authority drift, and RPC failures", async () => {
    await expect(createFlightConsumerLiveBookingSettlementPersistence(
      clientReturning([]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
    await expect(createFlightConsumerLiveBookingSettlementPersistence(
      clientReturning([{
        decision: "created",
        ...result("prepared", 0),
        ticketing_state: "issued",
      }]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
    await expect(createFlightConsumerLiveBookingSettlementPersistence(
      clientReturning([{
        decision: "created",
        ...result("prepared", 0),
        settlement_authorized: true,
      }]).client,
    ).prepare(prepareInput())).rejects.toMatchObject({
      reason: "invalid_result",
    });
    const throwingClient = {
      rpc: vi.fn(async () => {
        throw new Error("redacted");
      }),
    } as FlightConsumerLiveBookingSettlementRpcClient;
    await expect(createFlightConsumerLiveBookingSettlementPersistence(
      throwingClient,
    ).prepare(prepareInput())).rejects.toMatchObject({ reason: "rpc_refused" });
  });

  it("has no route, env read, transport, ciphertext, or secret integration", () => {
    const path =
      "lib/flights/consumer-production/booking-settlement-evidence-persistence.server.ts";
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(
      /\b(?:fetch|axios|stripe\.com|duffel\.com|process\.env)\b/i,
    );
    expect(source).not.toMatch(
      /\b(?:client_secret|payment_method|card_data|ciphertext)\b/i,
    );
    const imports = appSourceFiles("app").filter((file) =>
      readFileSync(file, "utf8").includes(
        "booking-settlement-evidence-persistence",
      )
    );
    expect(imports).toEqual([]);
  });

  it("uses a stable non-secret error surface", () => {
    const error = new FlightConsumerLiveBookingSettlementPersistenceError(
      "rpc_refused",
    );
    expect(error.message).toBe(
      "Flight Consumer Live booking settlement persistence was refused.",
    );
    expect(error.reason).toBe("rpc_refused");
  });
});
