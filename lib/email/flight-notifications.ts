import { isProxy } from "node:util/types";

export const flightNotificationEvents = [
  "order_pending",
  "ticketed",
  "order_failed",
  "schedule_changed",
  "cancellation_confirmed",
  "refund_completed",
] as const;

export type FlightNotificationEvent = (typeof flightNotificationEvents)[number];

export type FlightNotificationInput = {
  event: FlightNotificationEvent;
  eventReceiptId: string;
  lifecycleEvidenceDigest: string;
  orderId: string;
  origin: string;
  destination: string;
  bookingReference?: string | null;
  ticketingEvidence?: {
    providerOrderReceiptDigest: string;
    bookingReferenceReceiptDigest: string;
    electronicTicketDocumentReceiptDigests: readonly string[];
  } | null;
  refundEvidence?: {
    paymentId: string;
    currency: string;
    refundedAmountMinor: number;
    paymentReceiptDigest: string;
    reconciliationReceiptDigest: string;
  } | null;
};

export type FlightNotificationEvidenceVerificationInput = {
  event: FlightNotificationEvent;
  eventReceiptId: string;
  lifecycleEvidenceDigest: string;
  orderId: string;
  origin: string;
  destination: string;
  bookingReference: string | null;
  ticketingEvidence: FlightNotificationInput["ticketingEvidence"];
  refundEvidence: FlightNotificationInput["refundEvidence"];
};

export type FlightNotificationEvidenceVerifier = {
  /** Must query authenticated, durable evidence and bind its result to every exact field in the input. */
  verify(
    input: FlightNotificationEvidenceVerificationInput,
  ): Promise<{ verified: true; trustedReceiptDigest: string } | { verified: false; trustedReceiptDigest: null }>;
};

export type FlightNotification = {
  templateName: `flight_${FlightNotificationEvent}`;
  dedupeKey: string;
  eventReceiptId: string;
  lifecycleEvidenceDigest: string;
  trustedEvidenceReceiptDigest: string;
  ticketingEvidence: FlightNotificationInput["ticketingEvidence"];
  refundEvidence: FlightNotificationInput["refundEvidence"];
  refundReconciliationEvidenceDigest: string | null;
  subject: string;
  message: string;
  actionPath: null;
  bookingReference: string | null;
  ticketed: boolean;
  paymentOutcomeClaimed: boolean;
};

const safeId = /^[A-Za-z0-9_-]{1,100}$/;
const providerReference = /^[A-Za-z0-9][A-Za-z0-9._:-]{4,63}$/;
const sha256 = /^[0-9a-f]{64}$/;
const airport = /^[A-Z]{3}$/;

const inputKeys = [
  "event",
  "eventReceiptId",
  "lifecycleEvidenceDigest",
  "orderId",
  "origin",
  "destination",
  "bookingReference",
  "ticketingEvidence",
  "refundEvidence",
] as const;
const ticketingEvidenceKeys = [
  "providerOrderReceiptDigest",
  "bookingReferenceReceiptDigest",
  "electronicTicketDocumentReceiptDigests",
] as const;
const refundEvidenceKeys = [
  "paymentId",
  "currency",
  "refundedAmountMinor",
  "paymentReceiptDigest",
  "reconciliationReceiptDigest",
] as const;

function snapshotPlainDataRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || isProxy(value)) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const allowed = new Set(allowedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new Error(`${label} contains an unexpected field.`);
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} must contain enumerable data fields only.`);
    }
    snapshot[key] = descriptor.value;
  }
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
      throw new Error(`${label} is missing a required field.`);
    }
  }
  return Object.freeze(snapshot);
}

function snapshotDigestArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error("Electronic-ticket receipts must be a plain data array.");
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
    throw new Error("Electronic-ticket receipts must have an exact array length.");
  }
  const length = lengthDescriptor.value as number;
  if (length < 0 || length > 9) {
    throw new Error("Electronic-ticket receipts must contain at most nine entries.");
  }
  const ownKeys = Reflect.ownKeys(value);
  const expectedKeys = new Set(["length", ...Array.from({ length }, (_, index) => String(index))]);
  if (ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key)) || ownKeys.length !== expectedKeys.size) {
    throw new Error("Electronic-ticket receipts must be contiguous data entries without extra fields.");
  }
  const snapshot: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "string") {
      throw new Error("Electronic-ticket receipts must contain string data entries only.");
    }
    snapshot.push(descriptor.value);
  }
  return Object.freeze(snapshot);
}

function snapshotNotificationInput(value: unknown): Readonly<FlightNotificationInput> {
  const record = snapshotPlainDataRecord(value, "Flight notification input", inputKeys, [
    "event",
    "eventReceiptId",
    "lifecycleEvidenceDigest",
    "orderId",
    "origin",
    "destination",
  ]);
  const rawTicketingEvidence = record.ticketingEvidence;
  const rawRefundEvidence = record.refundEvidence;
  let ticketingEvidence: FlightNotificationInput["ticketingEvidence"] = null;
  let refundEvidence: FlightNotificationInput["refundEvidence"] = null;
  if (rawTicketingEvidence !== undefined && rawTicketingEvidence !== null) {
    const ticketing = snapshotPlainDataRecord(
      rawTicketingEvidence,
      "Flight notification ticketing evidence",
      ticketingEvidenceKeys,
      ticketingEvidenceKeys,
    );
    ticketingEvidence = Object.freeze({
      providerOrderReceiptDigest: ticketing.providerOrderReceiptDigest as string,
      bookingReferenceReceiptDigest: ticketing.bookingReferenceReceiptDigest as string,
      electronicTicketDocumentReceiptDigests: snapshotDigestArray(ticketing.electronicTicketDocumentReceiptDigests),
    });
  }
  if (rawRefundEvidence !== undefined && rawRefundEvidence !== null) {
    const refund = snapshotPlainDataRecord(
      rawRefundEvidence,
      "Flight notification refund evidence",
      refundEvidenceKeys,
      refundEvidenceKeys,
    );
    refundEvidence = Object.freeze({
      paymentId: refund.paymentId as string,
      currency: refund.currency as string,
      refundedAmountMinor: refund.refundedAmountMinor as number,
      paymentReceiptDigest: refund.paymentReceiptDigest as string,
      reconciliationReceiptDigest: refund.reconciliationReceiptDigest as string,
    });
  }
  return Object.freeze({
    event: record.event as FlightNotificationEvent,
    eventReceiptId: record.eventReceiptId as string,
    lifecycleEvidenceDigest: record.lifecycleEvidenceDigest as string,
    orderId: record.orderId as string,
    origin: record.origin as string,
    destination: record.destination as string,
    bookingReference: record.bookingReference as string | null | undefined,
    ticketingEvidence,
    refundEvidence,
  });
}

function captureVerifier(
  verifier: FlightNotificationEvidenceVerifier,
): FlightNotificationEvidenceVerifier["verify"] {
  if (verifier === null || typeof verifier !== "object" || isProxy(verifier)) {
    throw new Error("A trusted flight notification evidence verifier is required.");
  }
  let owner: object | null = verifier;
  while (owner !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, "verify");
    if (descriptor) {
      if (!("value" in descriptor) || typeof descriptor.value !== "function") {
        throw new Error("The flight notification evidence verifier must expose a data-only verify method.");
      }
      return descriptor.value.bind(verifier) as FlightNotificationEvidenceVerifier["verify"];
    }
    owner = Object.getPrototypeOf(owner) as object | null;
  }
  throw new Error("A trusted flight notification evidence verifier is required.");
}

function snapshotVerificationResult(value: unknown) {
  const result = snapshotPlainDataRecord(
    value,
    "Flight notification verification result",
    ["verified", "trustedReceiptDigest"],
    ["verified", "trustedReceiptDigest"],
  );
  if (typeof result.verified !== "boolean"
    || (result.verified && typeof result.trustedReceiptDigest !== "string")
    || (!result.verified && result.trustedReceiptDigest !== null)) {
    throw new Error("Trusted flight notification evidence could not be verified.");
  }
  return Object.freeze({
    verified: result.verified,
    trustedReceiptDigest: result.trustedReceiptDigest as string | null,
  });
}

function assertInput(input: FlightNotificationInput) {
  if (!flightNotificationEvents.includes(input.event)) throw new Error("Flight notification event is invalid.");
  if (typeof input.orderId !== "string" || typeof input.eventReceiptId !== "string"
    || typeof input.lifecycleEvidenceDigest !== "string" || typeof input.origin !== "string"
    || typeof input.destination !== "string") {
    throw new Error("Flight notification identifiers must be strings.");
  }
  if (!safeId.test(input.orderId)) throw new Error("Flight notification order ID is invalid.");
  if (!safeId.test(input.eventReceiptId)) throw new Error("Flight notification event receipt ID is invalid.");
  if (!sha256.test(input.lifecycleEvidenceDigest)) throw new Error("Flight lifecycle evidence digest is invalid.");
  if (!airport.test(input.origin) || !airport.test(input.destination) || input.origin === input.destination) {
    throw new Error("Flight notification airport pair is invalid.");
  }
  if (input.bookingReference !== undefined && input.bookingReference !== null
    && (typeof input.bookingReference !== "string" || !providerReference.test(input.bookingReference))) {
    throw new Error("Flight notification booking reference is invalid.");
  }
  const ticketingEvidence = input.ticketingEvidence ?? null;
  if (input.event === "ticketed") {
    if (!input.bookingReference || ticketingEvidence === null) {
      throw new Error("Ticketed notifications require a valid booking reference and exact ticketing evidence.");
    }
    const documentDigests = ticketingEvidence.electronicTicketDocumentReceiptDigests;
    if (typeof ticketingEvidence.providerOrderReceiptDigest !== "string"
      || typeof ticketingEvidence.bookingReferenceReceiptDigest !== "string"
      || !sha256.test(ticketingEvidence.providerOrderReceiptDigest)
      || !sha256.test(ticketingEvidence.bookingReferenceReceiptDigest)
      || !Array.isArray(documentDigests)
      || documentDigests.length < 1
      || documentDigests.length > 9
      || new Set(documentDigests).size !== documentDigests.length
      || documentDigests.some((digest) => !sha256.test(digest))) {
      throw new Error("Ticketed notifications require exact provider-order, booking-reference, and electronic-ticket receipts.");
    }
  } else if (ticketingEvidence !== null) {
    throw new Error("Ticketing evidence is valid only for a ticketed notification.");
  }
  const refundEvidence = input.refundEvidence ?? null;
  if (input.event === "refund_completed") {
    if (refundEvidence === null
      || typeof refundEvidence.paymentId !== "string"
      || typeof refundEvidence.currency !== "string"
      || typeof refundEvidence.refundedAmountMinor !== "number"
      || typeof refundEvidence.paymentReceiptDigest !== "string"
      || typeof refundEvidence.reconciliationReceiptDigest !== "string"
      || !safeId.test(refundEvidence.paymentId)
      || !/^[A-Z]{3}$/.test(refundEvidence.currency)
      || !Number.isSafeInteger(refundEvidence.refundedAmountMinor)
      || refundEvidence.refundedAmountMinor <= 0
      || !sha256.test(refundEvidence.paymentReceiptDigest)
      || !sha256.test(refundEvidence.reconciliationReceiptDigest)) {
      throw new Error("Refund-completed notifications require exact positive-amount payment reconciliation evidence.");
    }
  } else if (refundEvidence !== null) {
    throw new Error("Refund reconciliation evidence is valid only for a refund-completed notification.");
  }
}

export async function buildFlightNotification(
  input: FlightNotificationInput,
  verifier: FlightNotificationEvidenceVerifier,
): Promise<FlightNotification> {
  const snapshot = snapshotNotificationInput(input);
  assertInput(snapshot);
  const verify = captureVerifier(verifier);
  const verificationInput: FlightNotificationEvidenceVerificationInput = Object.freeze({
    event: snapshot.event,
    eventReceiptId: snapshot.eventReceiptId,
    lifecycleEvidenceDigest: snapshot.lifecycleEvidenceDigest,
    orderId: snapshot.orderId,
    origin: snapshot.origin,
    destination: snapshot.destination,
    bookingReference: snapshot.bookingReference ?? null,
    ticketingEvidence: snapshot.ticketingEvidence ?? null,
    refundEvidence: snapshot.refundEvidence ?? null,
  });
  const verification = snapshotVerificationResult(await verify(verificationInput));
  const trustedReceiptDigest = verification.trustedReceiptDigest;
  if (!verification.verified || typeof trustedReceiptDigest !== "string" || !sha256.test(trustedReceiptDigest)) {
    throw new Error("Trusted flight notification evidence could not be verified.");
  }
  const route = `${snapshot.origin} to ${snapshot.destination}`;
  const ticketed = snapshot.event === "ticketed";
  const content: Record<FlightNotificationEvent, { subject: string; message: string; paymentOutcomeClaimed: boolean }> = {
    order_pending: {
      subject: "Your flight order is still processing",
      message: `Your ${route} request is processing. It is not confirmed or ticketed yet. Do not submit another order.`,
      paymentOutcomeClaimed: false,
    },
    ticketed: {
      subject: "Your flight is booked and ticketed",
      message: `Your ${route} order has a provider booking reference and electronic-ticket documentation. Review the operating carrier, itinerary, fare conditions, and support details.`,
      paymentOutcomeClaimed: false,
    },
    order_failed: {
      subject: "Your flight order could not be completed",
      message: `Your ${route} order was not completed. Any payment state must be reconciled before trying again.`,
      paymentOutcomeClaimed: false,
    },
    schedule_changed: {
      subject: "An airline changed your flight",
      message: `The airline changed your ${route} itinerary. Review the updated schedule and available actions before traveling.`,
      paymentOutcomeClaimed: false,
    },
    cancellation_confirmed: {
      subject: "Your flight cancellation is confirmed",
      message: `Your ${route} order was cancelled. A cancellation does not by itself prove that a traveler refund is complete.`,
      paymentOutcomeClaimed: false,
    },
    refund_completed: {
      subject: "Your flight refund is complete",
      message: `The approved traveler refund for your cancelled ${route} order was completed and reconciled.`,
      paymentOutcomeClaimed: true,
    },
  };
  return Object.freeze({
    templateName: `flight_${snapshot.event}`,
    dedupeKey: `flight:${snapshot.orderId}:${snapshot.event}:${snapshot.eventReceiptId}`,
    eventReceiptId: snapshot.eventReceiptId,
    lifecycleEvidenceDigest: snapshot.lifecycleEvidenceDigest,
    trustedEvidenceReceiptDigest: trustedReceiptDigest,
    ticketingEvidence: snapshot.ticketingEvidence ?? null,
    refundEvidence: snapshot.refundEvidence ?? null,
    refundReconciliationEvidenceDigest: snapshot.refundEvidence?.reconciliationReceiptDigest ?? null,
    ...content[snapshot.event],
    actionPath: null,
    bookingReference: snapshot.bookingReference ?? null,
    ticketed,
  });
}
