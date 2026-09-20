import "server-only";

import { z } from "zod";

import { sha256FlightEvidence } from "../runtime-safety";
import type { DuffelSanitizedOrderEvidence } from "../duffel-sandbox-contract";

const passengerIdSchema = z.string().regex(/^pas_[A-Za-z0-9]{8,252}$/);
const responseSchema = z.object({
  data: z.object({
    passengers: z.array(z.object({ id: passengerIdSchema }).passthrough()).min(1).max(9),
  }).passthrough(),
}).passthrough();

const orderResponseSchema = z.object({
  data: z.object({
    id: z.string().regex(/^ord_[A-Za-z0-9]{8,252}$/),
    passengers: z.array(z.object({ id: passengerIdSchema }).passthrough()).min(1).max(9),
    documents: z.array(z.object({
      type: z.string(),
      unique_identifier: z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/),
      passenger_ids: z.array(passengerIdSchema).min(1).max(9),
    }).passthrough()).max(18).optional(),
  }).passthrough(),
}).passthrough();

export class FlightConsumerPreviewDuffelEvidenceError extends Error {
  constructor() {
    super("Flight Consumer Preview Duffel passenger evidence is unavailable.");
    this.name = "FlightConsumerPreviewDuffelEvidenceError";
  }
}

function passengerIdDigest(value: string) {
  return sha256FlightEvidence({ version: "duffel-passenger-id-v1", value });
}

/**
 * Extracts only the opaque passenger identifiers required by the certified
 * order-create contract after checking them against the sanitized evidence.
 * The raw provider response never leaves this server-only boundary.
 */
export function extractVerifiedDuffelPreviewPassengerIds(input: Readonly<{
  rawBody: Uint8Array;
  expectedPassengerIdDigests: readonly string[];
  expectedCount: number;
}>) {
  if (
    !(input.rawBody instanceof Uint8Array)
    || input.rawBody.byteLength === 0
    || input.rawBody.byteLength > 1_048_576
    || !Number.isSafeInteger(input.expectedCount)
    || input.expectedCount < 1
    || input.expectedCount > 9
  ) throw new FlightConsumerPreviewDuffelEvidenceError();
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(input.rawBody);
    const parsed = responseSchema.parse(JSON.parse(decoded) as unknown);
    const ids = parsed.data.passengers.map(({ id }) => id);
    const actualDigests = ids.map(passengerIdDigest).sort();
    const expectedDigests = [...input.expectedPassengerIdDigests].sort();
    if (
      ids.length !== input.expectedCount
      || new Set(ids).size !== ids.length
      || expectedDigests.length !== input.expectedCount
      || expectedDigests.some((digest) => !/^[0-9a-f]{64}$/.test(digest))
      || JSON.stringify(actualDigests) !== JSON.stringify(expectedDigests)
    ) throw new FlightConsumerPreviewDuffelEvidenceError();
    return Object.freeze([...ids]);
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelEvidenceError) throw error;
    throw new FlightConsumerPreviewDuffelEvidenceError();
  }
}

/**
 * Extracts only order/passenger/ticket references after the full certified
 * order sanitizer has already authenticated their exact digest projection.
 */
export function extractVerifiedDuffelPreviewOrderReferences(input: Readonly<{
  rawBody: Uint8Array;
  orderEvidence: DuffelSanitizedOrderEvidence;
  expectedProviderPassengerIds: readonly string[];
}>) {
  try {
    if (
      !(input.rawBody instanceof Uint8Array)
      || input.rawBody.byteLength === 0
      || input.rawBody.byteLength > 1_048_576
      || input.orderEvidence.version !== "duffel-sanitized-order-v1"
      || input.orderEvidence.liveMode !== false
    ) throw new FlightConsumerPreviewDuffelEvidenceError();
    const parsed = orderResponseSchema.parse(JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(input.rawBody),
    ) as unknown);
    const passengerIds = parsed.data.passengers.map(({ id }) => id);
    if (
      parsed.data.id !== input.orderEvidence.providerOrderId
      || new Set(passengerIds).size !== passengerIds.length
      || JSON.stringify([...passengerIds].sort())
        !== JSON.stringify([...input.expectedProviderPassengerIds].sort())
    ) throw new FlightConsumerPreviewDuffelEvidenceError();
    const tickets = (parsed.data.documents ?? [])
      .filter((document) => document.type === "electronic_ticket")
      .map((document) => {
        if (document.passenger_ids.length !== 1) throw new FlightConsumerPreviewDuffelEvidenceError();
        const providerPassengerId = document.passenger_ids[0]!;
        if (!passengerIds.includes(providerPassengerId)) throw new FlightConsumerPreviewDuffelEvidenceError();
        const digest = sha256FlightEvidence({
          version: "duffel-electronic-ticket-v1",
          orderIdDigest: sha256FlightEvidence({
            version: "duffel-provider-order-id-v1",
            value: parsed.data.id,
          }),
          identifier: document.unique_identifier,
          passengerIdDigests: [passengerIdDigest(providerPassengerId)],
        });
        return Object.freeze({
          providerPassengerId,
          documentReference: document.unique_identifier,
          documentDigest: digest,
        });
      });
    if (
      tickets.length !== passengerIds.length
      || new Set(tickets.map((ticket) => ticket.providerPassengerId)).size !== passengerIds.length
      || new Set(tickets.map((ticket) => ticket.documentReference)).size !== tickets.length
      || JSON.stringify(tickets.map((ticket) => ticket.documentDigest).sort())
        !== JSON.stringify([...input.orderEvidence.ticketDocumentDigests].sort())
      || !input.orderEvidence.everyPassengerCoveredByElectronicTicket
      || !input.orderEvidence.ticketingEstablished
    ) throw new FlightConsumerPreviewDuffelEvidenceError();
    return Object.freeze({
      providerOrderId: parsed.data.id,
      providerPassengerIds: Object.freeze([...passengerIds]),
      tickets: Object.freeze(tickets),
    });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewDuffelEvidenceError) throw error;
    throw new FlightConsumerPreviewDuffelEvidenceError();
  }
}
