import "server-only";

import { z } from "zod";

import { createAdminClient } from "../supabase/admin";
import {
  buildFlightNotification,
  type FlightNotificationEvidenceVerificationInput,
  type FlightNotificationEvidenceVerifier,
} from "./flight-notifications";
import { wakeTransactionalEmailWorker } from "./outbox";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const airportSchema = z.string().regex(/^[A-Z]{3}$/);
const bookingReferenceSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{4,63}$/);
const supportedEventSchema = z.enum([
  "order_pending",
  "ticketed",
  "order_failed",
  "refund_completed",
]);

export type FlightConsumerPreviewDeliverableNotificationEvent = z.infer<
  typeof supportedEventSchema
>;

const projectionSchema = z.object({
  customer_id: uuidSchema,
  order_id: uuidSchema,
  event_type: supportedEventSchema,
  event_receipt_id: uuidSchema,
  execution_scope_sha256: sha256Schema,
  lifecycle_evidence_sha256: sha256Schema,
  origin_iata: airportSchema,
  destination_iata: airportSchema,
  booking_reference: bookingReferenceSchema.nullable(),
  provider_order_receipt_sha256: sha256Schema.nullable(),
  booking_reference_receipt_sha256: sha256Schema.nullable(),
  electronic_ticket_document_receipt_sha256s: z.array(sha256Schema).min(1).max(9).nullable(),
  payment_id: uuidSchema.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  refunded_amount_minor: z.union([
    z.number().int().positive(),
    z.string().regex(/^[1-9]\d*$/),
  ]).transform(Number).refine(Number.isSafeInteger).nullable(),
  payment_receipt_sha256: sha256Schema.nullable(),
  reconciliation_receipt_sha256: sha256Schema.nullable(),
  trusted_evidence_receipt_sha256: sha256Schema,
}).strict();

const projectionResultSchema = z.array(projectionSchema).length(1);
const queueResultSchema = z.array(z.object({
  decision: z.enum(["queued", "replay"]),
  email_outbox_id: uuidSchema,
}).strict()).length(1);

type NotificationProjection = z.infer<typeof projectionSchema>;

export type FlightConsumerPreviewNotificationQueueParameters = Readonly<{
  p_customer_id: string;
  p_order_id: string;
  p_event_type: FlightConsumerPreviewDeliverableNotificationEvent;
  p_event_receipt_id: string;
  p_lifecycle_evidence_sha256: string;
  p_trusted_evidence_receipt_sha256: string;
  p_template_name: string;
  p_dedupe_key: string;
  p_subject: string;
  p_message: string;
  p_action_url: string;
}>;

export interface FlightConsumerPreviewNotificationStore {
  project(input: Readonly<{
    customerId: string;
    orderId: string;
    event: FlightConsumerPreviewDeliverableNotificationEvent;
  }>): Promise<unknown>;
  queue(parameters: FlightConsumerPreviewNotificationQueueParameters): Promise<unknown>;
}

export type FlightConsumerPreviewNotificationDeliveryDependencies = Readonly<{
  store: FlightConsumerPreviewNotificationStore;
  appUrl: string;
  wakeWorker: () => Promise<boolean>;
}>;

export type FlightConsumerPreviewNotificationDeliveryResult = Readonly<{
  decision: "queued" | "replay";
  emailOutboxId: string;
  orderId: string;
  event: FlightConsumerPreviewDeliverableNotificationEvent;
}>;

const deliveryInputSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
  event: supportedEventSchema,
}).strict();

export class FlightConsumerPreviewNotificationDeliveryError extends Error {
  constructor() {
    super("Flight Consumer Preview notification delivery is unavailable.");
    this.name = "FlightConsumerPreviewNotificationDeliveryError";
  }
}

function parseProjection(value: unknown) {
  const parsed = projectionResultSchema.safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewNotificationDeliveryError();
  const projection = parsed.data[0]!;
  if (projection.origin_iata === projection.destination_iata) {
    throw new FlightConsumerPreviewNotificationDeliveryError();
  }
  return projection;
}

function resolveFlightsActionUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) throw new Error();
    return new URL("/account/flights", parsed.origin).toString();
  } catch {
    throw new FlightConsumerPreviewNotificationDeliveryError();
  }
}

function projectionInput(projection: NotificationProjection) {
  const base = {
    event: projection.event_type,
    eventReceiptId: projection.event_receipt_id,
    lifecycleEvidenceDigest: projection.lifecycle_evidence_sha256,
    orderId: projection.order_id,
    origin: projection.origin_iata,
    destination: projection.destination_iata,
  } as const;
  if (projection.event_type === "ticketed") {
    if (
      projection.booking_reference === null
      || projection.provider_order_receipt_sha256 === null
      || projection.booking_reference_receipt_sha256 === null
      || projection.electronic_ticket_document_receipt_sha256s === null
      || projection.payment_id !== null
      || projection.currency !== null
      || projection.refunded_amount_minor !== null
      || projection.payment_receipt_sha256 !== null
      || projection.reconciliation_receipt_sha256 !== null
    ) throw new FlightConsumerPreviewNotificationDeliveryError();
    return Object.freeze({
      ...base,
      bookingReference: projection.booking_reference,
      ticketingEvidence: Object.freeze({
        providerOrderReceiptDigest: projection.provider_order_receipt_sha256,
        bookingReferenceReceiptDigest: projection.booking_reference_receipt_sha256,
        electronicTicketDocumentReceiptDigests: Object.freeze([
          ...projection.electronic_ticket_document_receipt_sha256s,
        ]),
      }),
    });
  }
  if (projection.event_type === "refund_completed") {
    if (
      projection.booking_reference !== null
      || projection.provider_order_receipt_sha256 !== null
      || projection.booking_reference_receipt_sha256 !== null
      || projection.electronic_ticket_document_receipt_sha256s !== null
      || projection.payment_id === null
      || projection.currency === null
      || projection.refunded_amount_minor === null
      || projection.payment_receipt_sha256 === null
      || projection.reconciliation_receipt_sha256 === null
    ) throw new FlightConsumerPreviewNotificationDeliveryError();
    return Object.freeze({
      ...base,
      refundEvidence: Object.freeze({
        paymentId: projection.payment_id,
        currency: projection.currency,
        refundedAmountMinor: projection.refunded_amount_minor,
        paymentReceiptDigest: projection.payment_receipt_sha256,
        reconciliationReceiptDigest: projection.reconciliation_receipt_sha256,
      }),
    });
  }
  if (
    projection.booking_reference !== null
    || projection.provider_order_receipt_sha256 !== null
    || projection.booking_reference_receipt_sha256 !== null
    || projection.electronic_ticket_document_receipt_sha256s !== null
    || projection.payment_id !== null
    || projection.currency !== null
    || projection.refunded_amount_minor !== null
    || projection.payment_receipt_sha256 !== null
    || projection.reconciliation_receipt_sha256 !== null
  ) throw new FlightConsumerPreviewNotificationDeliveryError();
  return Object.freeze(base);
}

function sameNullableObject(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function exactProjectionMatch(
  input: FlightNotificationEvidenceVerificationInput,
  projection: NotificationProjection,
) {
  const expected = projectionInput(projection);
  return input.event === expected.event
    && input.eventReceiptId === expected.eventReceiptId
    && input.lifecycleEvidenceDigest === expected.lifecycleEvidenceDigest
    && input.orderId === expected.orderId
    && input.origin === expected.origin
    && input.destination === expected.destination
    && input.bookingReference === ("bookingReference" in expected
      ? expected.bookingReference
      : null)
    && sameNullableObject(
      input.ticketingEvidence,
      "ticketingEvidence" in expected ? expected.ticketingEvidence : null,
    )
    && sameNullableObject(
      input.refundEvidence,
      "refundEvidence" in expected ? expected.refundEvidence : null,
    );
}

class SupabaseFlightConsumerPreviewNotificationStore
implements FlightConsumerPreviewNotificationStore {
  async project(input: Readonly<{
    customerId: string;
    orderId: string;
    event: FlightConsumerPreviewDeliverableNotificationEvent;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "get_flight_consumer_notification_projection_v1",
      {
        p_customer_id: input.customerId,
        p_order_id: input.orderId,
        p_event_type: input.event,
      },
    );
    if (error) throw new FlightConsumerPreviewNotificationDeliveryError();
    return data;
  }

  async queue(parameters: FlightConsumerPreviewNotificationQueueParameters) {
    const { data, error } = await createAdminClient().rpc(
      "queue_flight_consumer_notification_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewNotificationDeliveryError();
    return data;
  }
}

class DurableFlightConsumerPreviewNotificationDelivery {
  readonly #dependencies: FlightConsumerPreviewNotificationDeliveryDependencies;

  constructor(dependencies: FlightConsumerPreviewNotificationDeliveryDependencies) {
    this.#dependencies = Object.freeze({ ...dependencies });
  }

  async deliver(untrustedInput: Readonly<{
    customerId: string;
    orderId: string;
    event: FlightConsumerPreviewDeliverableNotificationEvent;
  }>): Promise<FlightConsumerPreviewNotificationDeliveryResult> {
    try {
      const input = Object.freeze(deliveryInputSchema.parse(structuredClone(untrustedInput)));
      const initialProjection = parseProjection(await this.#dependencies.store.project(input));
      if (
        initialProjection.customer_id !== input.customerId
        || initialProjection.order_id !== input.orderId
        || initialProjection.event_type !== input.event
      ) throw new FlightConsumerPreviewNotificationDeliveryError();
      const verifier: FlightNotificationEvidenceVerifier = Object.freeze({
        verify: async (verificationInput: FlightNotificationEvidenceVerificationInput) => {
          const verifiedProjection = parseProjection(
            await this.#dependencies.store.project(input),
          );
          if (
            verifiedProjection.customer_id !== input.customerId
            || verifiedProjection.order_id !== input.orderId
            || verifiedProjection.event_type !== input.event
            || !exactProjectionMatch(verificationInput, verifiedProjection)
          ) return { verified: false as const, trustedReceiptDigest: null };
          return {
            verified: true as const,
            trustedReceiptDigest: verifiedProjection.trusted_evidence_receipt_sha256,
          };
        },
      });
      const notification = await buildFlightNotification(
        projectionInput(initialProjection),
        verifier,
      );
      if (
        notification.trustedEvidenceReceiptDigest
          !== initialProjection.trusted_evidence_receipt_sha256
      ) throw new FlightConsumerPreviewNotificationDeliveryError();
      const queued = queueResultSchema.safeParse(await this.#dependencies.store.queue({
        p_customer_id: input.customerId,
        p_order_id: input.orderId,
        p_event_type: input.event,
        p_event_receipt_id: notification.eventReceiptId,
        p_lifecycle_evidence_sha256: notification.lifecycleEvidenceDigest,
        p_trusted_evidence_receipt_sha256:
          notification.trustedEvidenceReceiptDigest,
        p_template_name: notification.templateName,
        p_dedupe_key: notification.dedupeKey,
        p_subject: notification.subject,
        p_message: notification.message,
        p_action_url: resolveFlightsActionUrl(this.#dependencies.appUrl),
      }));
      if (!queued.success) throw new FlightConsumerPreviewNotificationDeliveryError();
      try {
        await this.#dependencies.wakeWorker();
      } catch {
        // The durable outbox row is authoritative; worker wake-up is best effort.
      }
      return Object.freeze({
        decision: queued.data[0]!.decision,
        emailOutboxId: queued.data[0]!.email_outbox_id,
        orderId: input.orderId,
        event: input.event,
      });
    } catch (error) {
      if (error instanceof FlightConsumerPreviewNotificationDeliveryError) throw error;
      throw new FlightConsumerPreviewNotificationDeliveryError();
    }
  }
}

export function createInjectedFlightConsumerPreviewNotificationDelivery(
  dependencies: FlightConsumerPreviewNotificationDeliveryDependencies,
) {
  return Object.freeze(new DurableFlightConsumerPreviewNotificationDelivery(dependencies));
}

/**
 * Fail-open delivery boundary for booking/refund workflows. Every lifecycle
 * mutation commits before this function is called. A projection, auth-owner
 * lookup, outbox, or worker failure can therefore never change commerce state.
 */
export async function queueFlightConsumerPreviewNotification(input: Readonly<{
  customerId: string;
  orderId: string;
  event: FlightConsumerPreviewDeliverableNotificationEvent;
}>): Promise<FlightConsumerPreviewNotificationDeliveryResult | null> {
  try {
    return await createInjectedFlightConsumerPreviewNotificationDelivery({
      store: Object.freeze(new SupabaseFlightConsumerPreviewNotificationStore()),
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
      wakeWorker: () => wakeTransactionalEmailWorker(),
    }).deliver(input);
  } catch (error) {
    console.error("Flight Consumer Preview notification could not be queued", {
      event: input.event,
      failure: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}
