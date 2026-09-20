import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import {
  buildDuffelSandboxOfferRequestPlan,
  persistDuffelSandboxInitialOfferEvidence,
  sanitizeDuffelSandboxOfferResponse,
} from "../duffel-sandbox-contract";
import {
  copyDuffelHttpTransportRawBody,
  createDuffelTestHttpTransport,
} from "../duffel/http-transport.server";
import { createDuffelPreviewTransportDependencies } from "../duffel/preview-ports.server";
import { sha256FlightEvidence, type FlightCanonicalJsonValue } from "../runtime-safety";
import {
  createFlightConsumerPreviewDuffelJournal,
  type FlightConsumerPreviewDuffelJournal,
  type FlightConsumerPreviewPreparedAttemptRecovery,
} from "./duffel-journal.server";
import { normalizeFlightConsumerPreviewDuffelOffer } from "./duffel-normalization.server";
import { createStagedFlightConsumerPreviewOfferEvidenceRepository } from "./offer-evidence-staging.server";
import { readFlightConsumerPreviewReferenceKeyring } from "./reference-crypto.server";
import {
  flightConsumerPreviewSearchRequestSchema,
  type FlightConsumerPreviewSearchRequest,
} from "./schemas";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";
import { safeFlightConsumerPreviewCompletionDiagnostic } from "./search-diagnostics";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const searchStatusSchema = z.enum(["created", "searching", "complete", "failed", "expired"]);

const beginRowSchema = z.object({
  decision: z.enum(["created", "replay"]),
  search_id: uuidSchema,
  search_status: searchStatusSchema,
}).passthrough();

const completeRowSchema = z.object({
  search_id: uuidSchema,
  search_status: z.literal("complete"),
  offer_count: z.number().int().min(1).max(5),
}).passthrough();

const recoveryRowSchema = z.object({
  search_id: uuidSchema,
  customer_id: uuidSchema,
  search_status: searchStatusSchema,
  search_expires_at: z.string().datetime({ offset: true }),
  attempt_id: uuidSchema,
  attempt_revision: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  attempt_state: z.enum(["prepared", "dispatching", "blocked", "succeeded", "failed", "ambiguous"]),
  request_plan_sha256: sha256Schema,
  request_sha256: sha256Schema,
  request_body_sha256: sha256Schema,
  adapter_source_sha256: sha256Schema,
  provider_binding_receipt_sha256: sha256Schema,
  operation_authority_receipt_sha256: sha256Schema,
  dispatch_not_after: z.string().datetime({ offset: true }),
  terminal_http_status: z.number().int().min(200).max(599).nullable(),
  terminal_response_sha256: sha256Schema.nullable(),
  terminal_response_bytes: z.number().int().nonnegative().nullable(),
  terminal_receipt_sha256: sha256Schema.nullable(),
}).passthrough().superRefine((row, context) => {
  const noTerminalResponse = row.terminal_http_status === null
    && row.terminal_response_sha256 === null
    && row.terminal_response_bytes === null;
  if (row.attempt_state === "prepared" && (
    row.attempt_revision !== 0
    || !noTerminalResponse
    || row.terminal_receipt_sha256 !== null
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid prepared search recovery state." });
  if (row.attempt_state === "dispatching" && (
    row.attempt_revision !== 1
    || !noTerminalResponse
    || row.terminal_receipt_sha256 !== null
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid dispatching search recovery state." });
  if (row.attempt_state === "blocked" && (
    row.attempt_revision !== 1
    || !noTerminalResponse
    || row.terminal_receipt_sha256 === null
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid blocked search recovery state." });
  if (row.attempt_state === "ambiguous" && (
    row.attempt_revision !== 2
    || !noTerminalResponse
    || row.terminal_receipt_sha256 === null
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid ambiguous search recovery state." });
  if ((row.attempt_state === "succeeded" || row.attempt_state === "failed") && (
    row.attempt_revision !== 2
    || row.terminal_http_status === null
    || row.terminal_response_sha256 === null
    || row.terminal_response_bytes === null
    || row.terminal_receipt_sha256 === null
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid terminal search recovery state." });
});

const searchFailureRowSchema = z.object({
  search_id: uuidSchema,
  search_status: z.literal("failed"),
}).passthrough();

const attemptTerminalRowSchema = z.object({
  attempt_id: uuidSchema,
  attempt_revision: z.literal(2),
  attempt_state: z.literal("ambiguous"),
}).passthrough();

const recoveryInputSchema = z.object({
  customerId: uuidSchema,
  searchId: uuidSchema,
  search: flightConsumerPreviewSearchRequestSchema,
  observedStatus: searchStatusSchema,
  observedExpiresAt: z.string().datetime({ offset: true }).optional(),
}).strict();

const STALE_DISPATCH_GRACE_MS = 2 * 60_000;

type SearchRuntime = Awaited<ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>>;

export interface FlightConsumerPreviewAuthenticatedRpcClient {
  rpc(name: string, parameters: Readonly<Record<string, unknown>>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}

export class FlightConsumerPreviewSearchWorkflowError extends Error {
  constructor() {
    super("The Duffel test search could not be completed.");
    this.name = "FlightConsumerPreviewSearchWorkflowError";
  }
}

function oneRow<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewSearchWorkflowError();
  return parsed.data[0]!;
}

async function markFailed(journal: FlightConsumerPreviewDuffelJournal | null) {
  const outcome = journal?.readOutcome();
  if (!outcome?.terminalRevision || !outcome.terminalState) return;
  try {
    await createAdminClient().rpc("fail_flight_consumer_search_v1", {
      p_attempt_id: outcome.attemptId,
      p_expected_terminal_revision: outcome.terminalRevision,
    });
  } catch {
    // The terminal provider journal remains authoritative for reconciliation.
  }
}

function zeroOrOneRecoveryRow(value: unknown) {
  const parsed = z.array(recoveryRowSchema).max(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewSearchWorkflowError();
  return parsed.data[0] ?? null;
}

function statusResult(searchId: string, status: z.infer<typeof searchStatusSchema>) {
  return Object.freeze({ searchId, status, replay: true as const });
}

function isPastRecoveryGrace(row: z.infer<typeof recoveryRowSchema>) {
  return Date.now() >= Date.parse(row.dispatch_not_after) + STALE_DISPATCH_GRACE_MS;
}

async function failRecoveredSearch(row: z.infer<typeof recoveryRowSchema>) {
  const result = await createAdminClient().rpc("fail_flight_consumer_search_v1", {
    p_attempt_id: row.attempt_id,
    p_expected_terminal_revision: row.attempt_revision,
  });
  if (result.error) return false;
  const failed = oneRow(searchFailureRowSchema, result.data);
  if (failed.search_id !== row.search_id) throw new FlightConsumerPreviewSearchWorkflowError();
  return true;
}

async function markStaleDispatchAmbiguous(row: z.infer<typeof recoveryRowSchema>) {
  const terminalReceiptSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-stale-search-dispatch-v1",
    customerId: row.customer_id,
    searchId: row.search_id,
    attemptId: row.attempt_id,
    requestPlanSha256: row.request_plan_sha256,
    requestSha256: row.request_sha256,
    requestBodySha256: row.request_body_sha256,
    adapterSourceSha256: row.adapter_source_sha256,
    providerBindingReceiptSha256: row.provider_binding_receipt_sha256,
    operationAuthorityReceiptSha256: row.operation_authority_receipt_sha256,
    dispatchNotAfter: row.dispatch_not_after,
    terminalState: "ambiguous",
  });
  const result = await createAdminClient().rpc("complete_flight_provider_request_attempt", {
    p_attempt_id: row.attempt_id,
    p_expected_revision: 1,
    p_terminal_state: "ambiguous",
    p_terminal_http_status: null,
    p_terminal_response_sha256: null,
    p_terminal_response_bytes: null,
    p_terminal_receipt_sha256: terminalReceiptSha256,
  });
  if (result.error) return false;
  const completed = oneRow(attemptTerminalRowSchema, result.data);
  return completed.attempt_id === row.attempt_id;
}

async function executeProviderSearch(input: Readonly<{
  customerId: string;
  searchId: string;
  search: FlightConsumerPreviewSearchRequest;
  runtime: SearchRuntime;
  replay: boolean;
  preparedAttemptRecovery: FlightConsumerPreviewPreparedAttemptRecovery | null;
}>) {
  let journal: FlightConsumerPreviewDuffelJournal | null = null;
  let rawBody: Uint8Array | null = null;
  try {
    journal = createFlightConsumerPreviewDuffelJournal({
      kind: "search",
      customerId: input.customerId,
      searchId: input.searchId,
    }, process.env, input.preparedAttemptRecovery);
    const transport = createDuffelTestHttpTransport(
      createDuffelPreviewTransportDependencies(journal),
    );
    const result = await transport.execute(buildDuffelSandboxOfferRequestPlan(input.search));
    rawBody = copyDuffelHttpTransportRawBody(result);
    const retrievedAt = new Date().toISOString();
    const projected = sanitizeDuffelSandboxOfferResponse(rawBody, {
      search: input.search,
      retrievedAt,
    });
    const selectedIndex = projected.result.offers.findIndex((offer, index) => (
      offer.total.currency === "USD"
      && Date.parse(offer.expiresAt) > Date.now() + 60_000
      && projected.evidence[index]?.passengerIdentityDocumentsRequired === false
    ));
    if (selectedIndex < 0) throw new FlightConsumerPreviewSearchWorkflowError();
    const selected = projected.result.offers[selectedIndex]!;
    const offerId = randomUUID();
    const staged = await createStagedFlightConsumerPreviewOfferEvidenceRepository({
      customerId: input.customerId,
      searchId: input.searchId,
      offerId,
      localOfferId: selected.offerId,
    });
    const retentionExpiresAt = new Date(Math.min(
      Date.parse(selected.expiresAt),
      Date.now() + 45 * 60_000,
    )).toISOString();
    const rehydrated = await persistDuffelSandboxInitialOfferEvidence(
      staged.repository,
      rawBody,
      {
        search: input.search,
        retrievedAt,
        offerId: selected.offerId,
        scope: {
          tenantId: "tenant_iratepilot_preview_0001",
          commerceId: input.searchId,
          actorId: input.customerId,
        },
        retentionExpiresAt,
      },
    );
    const normalized = normalizeFlightConsumerPreviewDuffelOffer({
      customerId: input.customerId,
      offerId,
      executionScopeSha256: input.runtime.binding.executionScopeSha256,
      rehydrated,
      stagedEvidence: staged.takePreparedEvidence(),
      referenceKeyring: readFlightConsumerPreviewReferenceKeyring(),
    });
    const outcome = journal.readOutcome();
    if (outcome?.terminalState !== "succeeded" || outcome.terminalRevision !== 2) {
      throw new FlightConsumerPreviewSearchWorkflowError();
    }
    const completed = await createAdminClient().rpc("complete_flight_consumer_search_v1", {
      p_attempt_id: outcome.attemptId,
      p_expected_terminal_revision: 2,
      p_normalized_offers: [normalized],
    });
    if (completed.error) {
      console.error(
        "[flight-consumer-preview-search] completion RPC refused",
        safeFlightConsumerPreviewCompletionDiagnostic(completed.error),
      );
      throw new FlightConsumerPreviewSearchWorkflowError();
    }
    const completion = oneRow(completeRowSchema, completed.data);
    if (completion.search_id !== input.searchId || completion.offer_count !== 1) {
      throw new FlightConsumerPreviewSearchWorkflowError();
    }
    return Object.freeze({
      searchId: input.searchId,
      status: "complete" as const,
      replay: input.replay,
    });
  } catch {
    await markFailed(journal);
    throw new FlightConsumerPreviewSearchWorkflowError();
  } finally {
    rawBody?.fill(0);
  }
}

async function recoverWithRuntime(input: Readonly<{
  customerId: string;
  searchId: string;
  search: FlightConsumerPreviewSearchRequest;
  observedStatus: z.infer<typeof searchStatusSchema>;
  observedExpiresAt?: string;
  runtime: SearchRuntime;
}>) {
  const readRecovery = () => createAdminClient().rpc("get_flight_consumer_search_recovery_v1", {
    p_customer_id: input.customerId,
    p_search_id: input.searchId,
  });
  const result = await readRecovery();
  if (result.error) throw new FlightConsumerPreviewSearchWorkflowError();
  let recovery = zeroOrOneRecoveryRow(result.data);
  if (recovery === null) {
    if (["complete", "failed", "expired"].includes(input.observedStatus)) {
      return statusResult(input.searchId, input.observedStatus);
    }
    if (input.observedStatus !== "created") throw new FlightConsumerPreviewSearchWorkflowError();
    if (
      input.observedExpiresAt !== undefined
      && Date.parse(input.observedExpiresAt) <= Date.now()
    ) return statusResult(input.searchId, "expired");
    return executeProviderSearch({
      customerId: input.customerId,
      searchId: input.searchId,
      search: input.search,
      runtime: input.runtime,
      replay: true,
      preparedAttemptRecovery: null,
    });
  }
  if (
    recovery.search_id !== input.searchId
    || recovery.customer_id !== input.customerId
  ) throw new FlightConsumerPreviewSearchWorkflowError();
  if (["complete", "failed", "expired"].includes(recovery.search_status)) {
    return statusResult(input.searchId, recovery.search_status);
  }
  if (recovery.search_status !== "searching") {
    throw new FlightConsumerPreviewSearchWorkflowError();
  }

  if (recovery.attempt_state === "prepared") {
    return executeProviderSearch({
      customerId: input.customerId,
      searchId: input.searchId,
      search: input.search,
      runtime: input.runtime,
      replay: true,
      preparedAttemptRecovery: Object.freeze({
        attemptId: recovery.attempt_id,
        dispatchNotAfter: recovery.dispatch_not_after,
      }),
    });
  }
  if (recovery.attempt_state === "dispatching") {
    if (!isPastRecoveryGrace(recovery)) return statusResult(input.searchId, "searching");
    if (!await markStaleDispatchAmbiguous(recovery)) {
      const reread = await readRecovery();
      if (reread.error) throw new FlightConsumerPreviewSearchWorkflowError();
      recovery = zeroOrOneRecoveryRow(reread.data);
      if (recovery === null) throw new FlightConsumerPreviewSearchWorkflowError();
      if (["complete", "failed", "expired"].includes(recovery.search_status)) {
        return statusResult(input.searchId, recovery.search_status);
      }
      if (recovery.attempt_state === "dispatching") {
        return statusResult(input.searchId, "searching");
      }
    } else {
      recovery = { ...recovery, attempt_state: "ambiguous", attempt_revision: 2 };
    }
  }

  if (recovery.attempt_state === "succeeded" && !isPastRecoveryGrace(recovery)) {
    // The normal request may still be materializing encrypted offer evidence
    // after its successful terminal journal write. Do not race it.
    return statusResult(input.searchId, "searching");
  }
  if (!["blocked", "succeeded", "failed", "ambiguous"].includes(recovery.attempt_state)) {
    throw new FlightConsumerPreviewSearchWorkflowError();
  }
  if (await failRecoveredSearch(recovery)) return statusResult(input.searchId, "failed");

  const finalRead = await readRecovery();
  if (finalRead.error) throw new FlightConsumerPreviewSearchWorkflowError();
  const finalRecovery = zeroOrOneRecoveryRow(finalRead.data);
  if (
    finalRecovery !== null
    && ["complete", "failed", "expired"].includes(finalRecovery.search_status)
  ) return statusResult(input.searchId, finalRecovery.search_status);
  throw new FlightConsumerPreviewSearchWorkflowError();
}

export async function recoverFlightConsumerPreviewSearch(input: Readonly<{
  customerId: string;
  searchId: string;
  search: FlightConsumerPreviewSearchRequest;
  observedStatus: z.infer<typeof searchStatusSchema>;
  observedExpiresAt?: string;
}>) {
  const identity = recoveryInputSchema.parse(input);
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  return recoverWithRuntime({ ...identity, runtime });
}

export async function executeFlightConsumerPreviewSearch(input: Readonly<{
  customerId: string;
  idempotencyKey: string;
  search: FlightConsumerPreviewSearchRequest;
  authenticatedRpc: FlightConsumerPreviewAuthenticatedRpcClient;
}>) {
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const requestSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-search-request-v1",
    customerId: input.customerId,
    search: input.search,
  } as FlightCanonicalJsonValue);
  const keySha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-search-idempotency-v1",
    customerId: input.customerId,
    key: input.idempotencyKey,
  });
  const requestFingerprintSha256 = sha256FlightEvidence({
    version: "flight-consumer-preview-search-fingerprint-v1",
    customerId: input.customerId,
    executionScopeSha256: runtime.binding.executionScopeSha256,
    search: input.search,
  } as FlightCanonicalJsonValue);
  const searchExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const begun = await input.authenticatedRpc.rpc("begin_flight_consumer_search_v1", {
    p_key_sha256: keySha256,
    p_request_sha256: requestSha256,
    p_request_fingerprint_sha256: requestFingerprintSha256,
    p_journey_type: input.search.returnDate === null ? "one_way" : "round_trip",
    p_origin_iata: input.search.origin,
    p_destination_iata: input.search.destination,
    p_departure_date: input.search.departureDate,
    p_return_date: input.search.returnDate,
    p_cabin: input.search.cabin,
    p_adult_count: input.search.passengers.adults,
    p_child_count: input.search.passengers.children,
    p_infant_in_seat_count: input.search.passengers.infantsInSeat,
    p_infant_on_lap_count: input.search.passengers.infantsOnLap,
    p_expires_at: searchExpiresAt,
  });
  if (begun.error) throw new FlightConsumerPreviewSearchWorkflowError();
  const row = oneRow(beginRowSchema, begun.data);
  if (row.decision === "replay") {
    if (["complete", "failed", "expired"].includes(row.search_status)) {
      return Object.freeze({ searchId: row.search_id, status: row.search_status, replay: true });
    }
    return recoverWithRuntime({
      customerId: input.customerId,
      searchId: row.search_id,
      search: input.search,
      observedStatus: row.search_status,
      runtime,
    });
  }

  return executeProviderSearch({
    customerId: input.customerId,
    searchId: row.search_id,
    search: input.search,
    runtime,
    replay: false,
    preparedAttemptRecovery: null,
  });
}
