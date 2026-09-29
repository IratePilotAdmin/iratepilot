import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";
import { z } from "zod";

import {
  sanitizeDuffelSandboxOrderResponse,
  sanitizeDuffelSandboxTerminalRecoveryOrderResponse,
  type DuffelRefreshedOfferEvidence,
  type DuffelRehydratedOfferEvidence,
  type DuffelSanitizedOrderEvidence,
  type DuffelTerminalRecoveryOfferEvidence,
  type DuffelTerminalRecoveryRefreshedOfferEvidence,
} from "../duffel-sandbox-contract";
import { canonicalFlightJson } from "../runtime-safety";
import { extractVerifiedDuffelPreviewOrderReferences } from "./duffel-evidence.server";
import {
  encryptFlightConsumerPreviewReference,
  type FlightConsumerPreviewReferenceKeyring,
} from "./reference-crypto.server";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });

const projectionIdentitySchema = z.object({
  customerId: uuidSchema,
  executionScopeSha256: sha256Schema,
  expectedOfferEvidenceReceiptSha256: sha256Schema,
  providerResponseSha256: sha256Schema,
  responseObservedAt: instantSchema,
}).strict();

const orderSchema = z.object({
  id: uuidSchema,
  customer_id: uuidSchema,
  search_id: uuidSchema,
  offer_id: uuidSchema,
  reprice_receipt_id: uuidSchema,
  execution_mode: z.literal("test"),
  execution_scope_sha256: sha256Schema,
  provider_code: z.literal("duffel"),
  currency: z.literal("USD"),
  total_cents: z.number().int().positive(),
  status: z.enum(["order_creating", "requires_review"]),
}).passthrough();

const searchSchema = z.object({
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adult_count: z.number().int().min(1).max(9),
  child_count: z.literal(0),
  infant_in_seat_count: z.literal(0),
  infant_on_lap_count: z.literal(0),
}).passthrough();

const offerSchema = z.object({
  validating_carrier: z.literal("ZZ"),
}).passthrough();

const paymentSchema = z.object({
  status: z.literal("captured"),
  authorized_cents: z.number().int().positive(),
  captured_cents: z.number().int().positive(),
  refunded_cents: z.literal(0),
}).passthrough();

const passengerSchema = z.object({
  id: uuidSchema,
  traveler_sequence: z.number().int().min(1).max(9),
  traveler_type: z.literal("adult"),
}).passthrough();

export type FlightConsumerPreviewTerminalFinalizationArtifact = Readonly<{
  providerOrderRefCiphertext: string;
  providerOrderRefSha256: string;
  providerCreatedAt: string;
  ticketingDeadlineAt: string;
  passengerBindings: readonly Readonly<{
    passenger_ref_id: string;
    provider_passenger_ref_ciphertext: string;
    provider_passenger_ref_sha256: string;
  }>[];
  ticketDocuments: readonly Readonly<{
    passenger_ref_id: string;
    document_ref_ciphertext: string;
    document_ref_sha256: string;
    issuing_carrier: "ZZ";
  }>[];
  issuedTicketCount: number;
}>;

export class FlightConsumerPreviewTerminalResponseFinalizationError extends Error {
  constructor() {
    super("The retained Duffel terminal response could not be safely finalized.");
    this.name = "FlightConsumerPreviewTerminalResponseFinalizationError";
  }
}

function sameCanonical(left: unknown, right: unknown) {
  return canonicalFlightJson(left as never) === canonicalFlightJson(right as never);
}

function ownEnumerableDataProperty(value: object, key: string) {
  if (nodeTypes.isProxy(value)) throw new FlightConsumerPreviewTerminalResponseFinalizationError();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return Object.freeze({ present: false as const, value: undefined });
  if (!descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) {
    throw new FlightConsumerPreviewTerminalResponseFinalizationError();
  }
  return Object.freeze({ present: true as const, value: descriptor.value as unknown });
}

function terminalTicketingDeadline(
  outboundDepartureAt: string,
  providerCreatedAt: string,
) {
  const departureMilliseconds = Date.parse(outboundDepartureAt);
  const providerCreatedMilliseconds = Date.parse(providerCreatedAt);
  const deadline = new Date(departureMilliseconds - 60_000);
  if (
    !Number.isFinite(departureMilliseconds)
    || new Date(departureMilliseconds).toISOString() !== outboundDepartureAt
    || !Number.isFinite(providerCreatedMilliseconds)
    || new Date(providerCreatedMilliseconds).toISOString() !== providerCreatedAt
    || !Number.isFinite(deadline.getTime())
    || deadline.getTime() <= Date.now()
    || deadline.getTime() <= providerCreatedMilliseconds
    || deadline.getTime() >= departureMilliseconds
  ) throw new FlightConsumerPreviewTerminalResponseFinalizationError();
  return deadline.toISOString();
}

/**
 * Projects an already-observed provider response into the encrypted SQL
 * finalization artifact. This path deliberately consumes only retained offer
 * evidence and the original response-observation time. It creates no dispatch
 * authority and does not consult current offer or reprice validity.
 */
export function projectFlightConsumerPreviewTerminalOrderResponse(input: Readonly<{
  customerId: string;
  executionScopeSha256: string;
  order: Readonly<Record<string, unknown>>;
  search: Readonly<Record<string, unknown>>;
  offer: Readonly<Record<string, unknown>>;
  payment: Readonly<Record<string, unknown>>;
  passengers: readonly Readonly<Record<string, unknown>>[];
  refreshedOffer: DuffelRehydratedOfferEvidence | DuffelTerminalRecoveryOfferEvidence;
  expectedOfferEvidenceReceiptSha256: string;
  expectedProviderPassengerIds: readonly string[];
  rawBody: Uint8Array;
  providerResponseSha256: string;
  responseObservedAt: string;
  referenceKeyring: FlightConsumerPreviewReferenceKeyring;
}>): FlightConsumerPreviewTerminalFinalizationArtifact {
  let phase:
    | "identity_contract"
    | "provider_order_sanitizer"
    | "ticket_evidence_contract"
    | "reference_extraction"
    | "provider_order_reference_encryption"
    | "passenger_reference_encryption"
    | "ticket_reference_encryption"
    | "artifact_shape" = "identity_contract";
  try {
    const identity = projectionIdentitySchema.parse({
      customerId: input.customerId,
      executionScopeSha256: input.executionScopeSha256,
      expectedOfferEvidenceReceiptSha256: input.expectedOfferEvidenceReceiptSha256,
      providerResponseSha256: input.providerResponseSha256,
      responseObservedAt: input.responseObservedAt,
    });
    const order = orderSchema.parse(input.order);
    const search = searchSchema.parse(input.search);
    const offer = offerSchema.parse(input.offer);
    const payment = paymentSchema.parse(input.payment);
    const passengers = z.array(passengerSchema).min(1).max(9).parse(input.passengers);
    const expectedProviderPassengerIds = z.array(
      z.string().regex(/^pas_[A-Za-z0-9]{8,252}$/),
    ).min(1).max(9).parse(input.expectedProviderPassengerIds);
    if (nodeTypes.isProxy(input.refreshedOffer)) {
      throw new FlightConsumerPreviewTerminalResponseFinalizationError();
    }
    const refreshedOfferPrototype = Object.getPrototypeOf(input.refreshedOffer) as object | null;
    if (
      (refreshedOfferPrototype !== Object.prototype && refreshedOfferPrototype !== null)
      || Object.getOwnPropertySymbols(input.refreshedOffer).length !== 0
    ) throw new FlightConsumerPreviewTerminalResponseFinalizationError();
    const terminalStageProperty = ownEnumerableDataProperty(
      input.refreshedOffer,
      "terminalStage",
    );
    const ordinaryStageProperty = ownEnumerableDataProperty(input.refreshedOffer, "stage");
    const outerVersionProperty = ownEnumerableDataProperty(input.refreshedOffer, "version");
    if (terminalStageProperty.present === ordinaryStageProperty.present) {
      throw new FlightConsumerPreviewTerminalResponseFinalizationError();
    }
    const terminalRecovery = terminalStageProperty.present;
    let terminalExpectedOffer: DuffelTerminalRecoveryRefreshedOfferEvidence | null = null;
    let ordinaryExpectedOffer: DuffelRefreshedOfferEvidence | null = null;
    if (terminalRecovery) {
      const candidate = input.refreshedOffer as DuffelTerminalRecoveryOfferEvidence;
      if (
        !outerVersionProperty.present
        || outerVersionProperty.value !== "duffel-terminal-recovery-offer-evidence-v1"
        || terminalStageProperty.value !== "refreshed"
        || candidate.evidence.version
          !== "duffel-terminal-recovery-refreshed-offer-evidence-v1"
      ) throw new FlightConsumerPreviewTerminalResponseFinalizationError();
      terminalExpectedOffer = candidate.evidence;
    } else {
      const candidate = input.refreshedOffer as DuffelRehydratedOfferEvidence;
      if (
        outerVersionProperty.present
        || ordinaryStageProperty.value !== "refreshed"
        || candidate.evidence.version !== "duffel-refreshed-offer-v1"
      ) throw new FlightConsumerPreviewTerminalResponseFinalizationError();
      ordinaryExpectedOffer = candidate.evidence;
    }
    const expectedOffer = terminalExpectedOffer ?? ordinaryExpectedOffer;
    if (expectedOffer === null) throw new FlightConsumerPreviewTerminalResponseFinalizationError();
    if (
      !(input.rawBody instanceof Uint8Array)
      || input.rawBody.byteLength < 1
      || input.rawBody.byteLength > 1_048_576
      || order.customer_id !== identity.customerId
      || order.execution_scope_sha256 !== identity.executionScopeSha256
      || payment.authorized_cents !== order.total_cents
      || payment.captured_cents !== order.total_cents
      || passengers.length !== search.adult_count
      || expectedProviderPassengerIds.length !== passengers.length
      || new Set(expectedProviderPassengerIds).size !== expectedProviderPassengerIds.length
      || passengers.some((passenger, index) => passenger.traveler_sequence !== index + 1)
      || input.refreshedOffer.receiptDigest !== identity.expectedOfferEvidenceReceiptSha256
      || input.refreshedOffer.scope.tenantId !== "tenant_iratepilot_preview_0001"
      || input.refreshedOffer.scope.commerceId !== order.search_id
      || input.refreshedOffer.scope.actorId !== identity.customerId
      || input.refreshedOffer.search.departureDate !== search.departure_date
      || input.refreshedOffer.search.passengers.adults !== search.adult_count
      || input.refreshedOffer.search.passengers.children !== 0
      || input.refreshedOffer.search.passengers.infantsInSeat !== 0
      || input.refreshedOffer.search.passengers.infantsOnLap !== 0
      || input.refreshedOffer.snapshot.total.currency !== order.currency
      || input.refreshedOffer.snapshot.total.amountMinor !== order.total_cents
      || createHash("sha256").update(input.rawBody).digest("hex")
        !== identity.providerResponseSha256
    ) throw new FlightConsumerPreviewTerminalResponseFinalizationError();

    phase = "provider_order_sanitizer";
    let orderEvidence: DuffelSanitizedOrderEvidence;
    if (terminalExpectedOffer !== null) {
      orderEvidence = sanitizeDuffelSandboxTerminalRecoveryOrderResponse(input.rawBody, {
        expectedOffer: terminalExpectedOffer,
        acceptedTermsDigest: terminalExpectedOffer.termsDigest,
        expectedProviderPassengerIds,
        retrievedAt: identity.responseObservedAt,
      });
    } else {
      if (ordinaryExpectedOffer === null) {
        throw new FlightConsumerPreviewTerminalResponseFinalizationError();
      }
      orderEvidence = sanitizeDuffelSandboxOrderResponse(input.rawBody, {
        expectedOffer: ordinaryExpectedOffer,
        acceptedTermsDigest: ordinaryExpectedOffer.termsDigest,
        expectedProviderPassengerIds,
        retrievedAt: identity.responseObservedAt,
      });
    }
    phase = "ticket_evidence_contract";
    if (
      orderEvidence.rawBodyDigest !== identity.providerResponseSha256
      || orderEvidence.acceptedTermsDigest !== expectedOffer.termsDigest
      || orderEvidence.offerRefreshReceiptDigest
        !== expectedOffer.refreshReceiptDigest
      || orderEvidence.offerRefreshedAt !== expectedOffer.refreshedAt
      || orderEvidence.selectedOfferIdDigest
        !== expectedOffer.providerOfferIdDigest
      || !sameCanonical(orderEvidence.total, input.refreshedOffer.snapshot.total)
      || !sameCanonical(
        orderEvidence.passengerIdDigests,
        [...expectedOffer.providerPassengerIdDigests].sort(),
      )
      || !sameCanonical(
        orderEvidence.ticketedPassengerIdDigests,
        [...expectedOffer.providerPassengerIdDigests].sort(),
      )
      || !sha256Schema.safeParse(orderEvidence.providerOrderIdDigest).success
      || !sha256Schema.safeParse(orderEvidence.itineraryDigest).success
      || orderEvidence.liveMode !== false
      || !orderEvidence.uncancelled
      || !orderEvidence.bookingReferencePresent
      || orderEvidence.paidAt === null
      || orderEvidence.awaitingPayment
      || !orderEvidence.everyPassengerCoveredByElectronicTicket
      || !orderEvidence.ticketingEstablished
      || orderEvidence.ticketDocumentDigests.length !== passengers.length
      || new Set(orderEvidence.ticketDocumentDigests).size !== passengers.length
      || orderEvidence.ticketedPassengerIdDigests.length !== passengers.length
    ) throw new FlightConsumerPreviewTerminalResponseFinalizationError();

    phase = "reference_extraction";
    const references = extractVerifiedDuffelPreviewOrderReferences({
      rawBody: input.rawBody,
      orderEvidence,
      expectedProviderPassengerIds,
    });
    phase = "provider_order_reference_encryption";
    const providerOrder = encryptFlightConsumerPreviewReference({
      value: references.providerOrderId,
      context: {
        kind: "duffel_order",
        customerId: identity.customerId,
        resourceId: order.id,
        executionScopeSha256: identity.executionScopeSha256,
      },
      keyring: input.referenceKeyring,
    });
    const passengerByProviderId = new Map(expectedProviderPassengerIds.map(
      (providerPassengerId, index) => [providerPassengerId, passengers[index]!] as const,
    ));
    phase = "passenger_reference_encryption";
    const passengerBindings = references.providerPassengerIds.map((providerPassengerId) => {
      const passenger = passengerByProviderId.get(providerPassengerId);
      if (!passenger) throw new FlightConsumerPreviewTerminalResponseFinalizationError();
      const encrypted = encryptFlightConsumerPreviewReference({
        value: providerPassengerId,
        context: {
          kind: "duffel_passenger",
          customerId: identity.customerId,
          resourceId: passenger.id,
          executionScopeSha256: identity.executionScopeSha256,
        },
        keyring: input.referenceKeyring,
      });
      return Object.freeze({
        passenger_ref_id: passenger.id,
        provider_passenger_ref_ciphertext: encrypted.ciphertext,
        provider_passenger_ref_sha256: encrypted.referenceSha256,
      });
    });
    phase = "ticket_reference_encryption";
    const ticketDocuments = references.tickets.map((ticket) => {
      const passenger = passengerByProviderId.get(ticket.providerPassengerId);
      if (!passenger) throw new FlightConsumerPreviewTerminalResponseFinalizationError();
      const encrypted = encryptFlightConsumerPreviewReference({
        value: ticket.documentReference,
        context: {
          kind: "duffel_ticket",
          customerId: identity.customerId,
          resourceId: `ticket:${passenger.id}`,
          executionScopeSha256: identity.executionScopeSha256,
        },
        keyring: input.referenceKeyring,
      });
      return Object.freeze({
        passenger_ref_id: passenger.id,
        document_ref_ciphertext: encrypted.ciphertext,
        document_ref_sha256: encrypted.referenceSha256,
        issuing_carrier: offer.validating_carrier,
      });
    });
    phase = "artifact_shape";
    if (
      passengerBindings.length !== passengers.length
      || ticketDocuments.length !== passengers.length
    ) throw new FlightConsumerPreviewTerminalResponseFinalizationError();

    return Object.freeze({
      providerOrderRefCiphertext: providerOrder.ciphertext,
      providerOrderRefSha256: providerOrder.referenceSha256,
      providerCreatedAt: orderEvidence.createdAt,
      ticketingDeadlineAt: terminalTicketingDeadline(
        input.refreshedOffer.snapshot.segments[0]?.departsAt ?? "",
        orderEvidence.createdAt,
      ),
      passengerBindings: Object.freeze(passengerBindings),
      ticketDocuments: Object.freeze(ticketDocuments),
      issuedTicketCount: passengers.length,
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : null;
    console.error("[flight-consumer-preview:terminal-response] projection rejected", {
      phase,
      category: errorName === "DuffelContractError"
        ? "duffel_contract"
        : errorName === "FlightConsumerPreviewDuffelEvidenceError"
          ? "duffel_reference_evidence"
          : error instanceof z.ZodError
            ? "schema_projection"
            : error instanceof FlightConsumerPreviewTerminalResponseFinalizationError
              ? "workflow_guard"
              : "unexpected_failure",
      contractReason: errorName === "DuffelContractError" && error instanceof Error
        ? error.message
        : null,
    });
    if (error instanceof FlightConsumerPreviewTerminalResponseFinalizationError) throw error;
    throw new FlightConsumerPreviewTerminalResponseFinalizationError();
  }
}
