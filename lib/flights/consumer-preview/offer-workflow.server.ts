import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import {
  buildDuffelSandboxOfferRetrievalPlan,
  persistDuffelSandboxRefreshedOfferEvidence,
  rehydrateDuffelSandboxOfferEvidence,
} from "../duffel-sandbox-contract";
import {
  copyDuffelHttpTransportRawBody,
  createDuffelTestHttpTransport,
} from "../duffel/http-transport.server";
import { createDuffelPreviewTransportDependencies } from "../duffel/preview-ports.server";
import { sha256FlightEvidence } from "../runtime-safety";
import {
  createFlightConsumerPreviewDuffelJournal,
  type FlightConsumerPreviewDuffelJournal,
} from "./duffel-journal.server";
import { normalizedStagedFlightOfferEvidence } from "./duffel-normalization.server";
import { safeFlightConsumerPreviewRepriceDiagnostic } from "./offer-diagnostics";
import { createFlightConsumerPreviewOfferEvidenceRepository } from "./offer-evidence-repository.server";
import { createStagedFlightConsumerPreviewOfferEvidenceRepository } from "./offer-evidence-staging.server";
import type { FlightConsumerPreviewAuthenticatedRpcClient } from "./search-workflow.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

const evidenceContextRowSchema = z.object({
  receipt_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  local_offer_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  reprice_receipt_id: z.string().uuid().nullable(),
  retention_expires_at: z.string(),
}).passthrough();

const repriceRowSchema = z.object({
  reprice_receipt_id: z.string().uuid(),
  reprice_status: z.enum(["confirmed", "price_changed"]),
  acceptance_required: z.boolean(),
}).passthrough();

const orderRowSchema = z.object({
  decision: z.enum(["created", "replay"]),
  order_id: z.string().uuid(),
  order_status: z.enum(["pending_payment", "payment_authorized", "order_creating", "booked", "ticketing_pending", "ticketed"]),
}).passthrough();

export class FlightConsumerPreviewOfferWorkflowError extends Error {
  constructor() {
    super("This Duffel test offer could not be accepted.");
    this.name = "FlightConsumerPreviewOfferWorkflowError";
  }
}

function oneRow<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewOfferWorkflowError();
  return parsed.data[0]!;
}

async function createPendingOrder(input: Readonly<{
  customerId: string;
  searchId: string;
  offerId: string;
  repriceReceiptId: string;
  idempotencyKey: string;
  confirmChangedPrice: boolean;
  authenticatedRpc: FlightConsumerPreviewAuthenticatedRpcClient;
}>) {
  const keySha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-order-idempotency-v1",
    customerId: input.customerId,
    key: input.idempotencyKey,
  });
  const requestSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-order-acceptance-v1",
    customerId: input.customerId,
    searchId: input.searchId,
    offerId: input.offerId,
    repriceReceiptId: input.repriceReceiptId,
    confirmChangedPrice: input.confirmChangedPrice,
  });
  const result = await input.authenticatedRpc.rpc(
    "accept_flight_consumer_reprice_and_create_order_v1",
    {
      p_offer_id: input.offerId,
      p_reprice_receipt_id: input.repriceReceiptId,
      p_key_sha256: keySha256,
      p_request_sha256: requestSha256,
    },
  );
  if (result.error) throw new FlightConsumerPreviewOfferWorkflowError();
  const row = oneRow(orderRowSchema, result.data);
  return Object.freeze({ orderId: row.order_id, status: row.order_status, replay: row.decision === "replay" });
}

async function markRepriceFailure(journal: FlightConsumerPreviewDuffelJournal | null) {
  const outcome = journal?.readOutcome();
  if (!outcome?.terminalRevision || !outcome.terminalState) return;
  try {
    const failed = await createAdminClient().rpc("fail_flight_consumer_reprice_v1", {
      p_attempt_id: outcome.attemptId,
      p_expected_terminal_revision: outcome.terminalRevision,
    });
    if (failed.error) {
      console.error(
        "[flight-consumer-preview-offer] failure RPC refused",
        safeFlightConsumerPreviewRepriceDiagnostic(failed.error),
      );
    }
  } catch {
    // Durable provider-attempt evidence remains authoritative.
  }
}

export async function executeFlightConsumerPreviewOfferAcceptance(input: Readonly<{
  customerId: string;
  searchId: string;
  offerId: string;
  idempotencyKey: string;
  confirmedRepriceReceiptId?: string;
  confirmChangedPrice?: true;
  authenticatedRpc: FlightConsumerPreviewAuthenticatedRpcClient;
}>) {
  await requireFlightConsumerPreviewRequestRuntime();
  if (input.confirmedRepriceReceiptId) {
    return createPendingOrder({
      ...input,
      repriceReceiptId: input.confirmedRepriceReceiptId,
      confirmChangedPrice: input.confirmChangedPrice === true,
    });
  }

  const contextResult = await createAdminClient().rpc(
    "get_flight_consumer_offer_evidence_context_v1",
    {
      p_customer_id: input.customerId,
      p_search_id: input.searchId,
      p_offer_id: input.offerId,
      p_stage: "initial",
    },
  );
  if (contextResult.error) throw new FlightConsumerPreviewOfferWorkflowError();
  const context = oneRow(evidenceContextRowSchema, contextResult.data);
  const repository = await createFlightConsumerPreviewOfferEvidenceRepository({
    customerId: input.customerId,
    searchId: input.searchId,
    offerId: input.offerId,
    localOfferId: context.local_offer_id,
  });
  const scope = {
    tenantId: "tenant_iratepilot_preview_0001" as const,
    commerceId: input.searchId,
    actorId: input.customerId,
  };
  const initial = await rehydrateDuffelSandboxOfferEvidence(
    repository,
    context.receipt_sha256,
    scope,
  );
  const keySha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-reprice-idempotency-v1",
    customerId: input.customerId,
    key: input.idempotencyKey,
  });
  const idempotencyRequestSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-reprice-request-v1",
    customerId: input.customerId,
    searchId: input.searchId,
    offerId: input.offerId,
    initialReceiptSha256: context.receipt_sha256,
  });
  let journal: FlightConsumerPreviewDuffelJournal | null = null;
  let rawBody: Uint8Array | null = null;
  try {
    const plan = buildDuffelSandboxOfferRetrievalPlan(initial.evidence);
    journal = createFlightConsumerPreviewDuffelJournal({
      kind: "reprice",
      customerId: input.customerId,
      searchId: input.searchId,
      offerId: input.offerId,
      idempotencyKeySha256: keySha256,
      idempotencyRequestSha256,
    });
    const transport = createDuffelTestHttpTransport(
      createDuffelPreviewTransportDependencies(journal),
    );
    const result = await transport.execute(plan);
    rawBody = copyDuffelHttpTransportRawBody(result);
    const repricedAt = new Date().toISOString();
    const staged = await createStagedFlightConsumerPreviewOfferEvidenceRepository({
      customerId: input.customerId,
      searchId: input.searchId,
      offerId: input.offerId,
      localOfferId: context.local_offer_id,
    });
    const refreshed = await persistDuffelSandboxRefreshedOfferEvidence(
      staged.repository,
      rawBody,
      {
        predecessorReceiptDigest: context.receipt_sha256,
        repricedAt,
        scope,
      },
    );
    if (refreshed.evidence.version !== "duffel-refreshed-offer-v1") {
      throw new FlightConsumerPreviewOfferWorkflowError();
    }
    const priceChanged = refreshed.snapshot.total.amountMinor !== initial.snapshot.total.amountMinor
      || refreshed.snapshot.total.currency !== initial.snapshot.total.currency
      || refreshed.evidence.termsChanged;
    const outcome = journal.readOutcome();
    if (outcome?.terminalState !== "succeeded" || outcome.terminalRevision !== 2) {
      throw new FlightConsumerPreviewOfferWorkflowError();
    }
    const completed = await createAdminClient().rpc("complete_flight_consumer_reprice_v1", {
      p_attempt_id: outcome.attemptId,
      p_expected_terminal_revision: 2,
      p_reprice_request_sha256: plan.requestDigest,
      p_reprice_response_sha256: result.responseDigest,
      p_status: priceChanged ? "price_changed" : "confirmed",
      p_currency: refreshed.snapshot.total.currency,
      p_original_total_cents: initial.snapshot.total.amountMinor,
      p_repriced_total_cents: refreshed.snapshot.total.amountMinor,
      p_expires_at: refreshed.snapshot.expiresAt,
      p_refreshed_evidence: normalizedStagedFlightOfferEvidence(
        staged.takePreparedEvidence(),
      ),
    });
    if (completed.error) {
      console.error(
        "[flight-consumer-preview-offer] completion RPC refused",
        safeFlightConsumerPreviewRepriceDiagnostic(completed.error),
      );
      throw new FlightConsumerPreviewOfferWorkflowError();
    }
    const reprice = oneRow(repriceRowSchema, completed.data);
    if (reprice.acceptance_required) {
      return Object.freeze({
        acceptanceRequired: true as const,
        repriceReceiptId: reprice.reprice_receipt_id,
        totalCents: refreshed.snapshot.total.amountMinor,
        currency: refreshed.snapshot.total.currency,
      });
    }
    return createPendingOrder({
      customerId: input.customerId,
      searchId: input.searchId,
      offerId: input.offerId,
      repriceReceiptId: reprice.reprice_receipt_id,
      idempotencyKey: input.idempotencyKey,
      confirmChangedPrice: false,
      authenticatedRpc: input.authenticatedRpc,
    });
  } catch {
    await markRepriceFailure(journal);
    throw new FlightConsumerPreviewOfferWorkflowError();
  } finally {
    rawBody?.fill(0);
  }
}
