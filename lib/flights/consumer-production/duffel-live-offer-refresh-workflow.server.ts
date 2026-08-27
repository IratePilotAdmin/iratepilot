import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { sha256FlightEvidence } from "../runtime-safety";
import {
  createFlightConsumerProductionDuffelLiveOfferRepriceAdapter,
  deriveFlightConsumerProductionDuffelLiveOfferIdSha256,
  deriveFlightConsumerProductionDuffelLiveOfferRepriceRequestSha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_MAX_BYTES,
  FlightConsumerProductionDuffelLiveOfferRepriceError,
  issueFlightConsumerProductionDuffelLiveOfferRepriceAuthority,
  type FlightConsumerProductionDuffelLiveOfferRepriceRequest,
  type FlightConsumerProductionDuffelLiveOfferRepriceResponse,
  type FlightConsumerProductionDuffelLiveOfferRepriceTransport,
} from "./duffel-live-offer-reprice.server";
import {
  acceptFlightConsumerProductionDuffelOfferSource,
  createFlightConsumerProductionDuffelOfferSourcePort,
  type FlightConsumerProductionDuffelOfferSourcePort,
} from "./duffel-offer-source.server";
import { requireFlightConsumerProductionDarkRuntime } from "./runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_OFFER_REFRESH_MODE =
  "flight_consumer_production_duffel_live_offer_refresh_observation_dark" as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const inputSchema = z.object({
  confirmation: z.literal(
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  ),
  offerId: z.string().regex(/^off_[A-Za-z0-9]{8,252}$/),
  sourceShoppingAttemptId: uuidSchema,
}).strict();
const attemptStateSchema = z.enum([
  "prepared",
  "dispatching",
  "succeeded",
  "failed",
  "ambiguous",
]);
const attemptRowSchema = z.object({
  decision: z.enum(["created", "replay"]).optional(),
  attempt_id: uuidSchema,
  attempt_state: attemptStateSchema,
  attempt_revision: z.number().int().min(0).max(2),
  offer_binding_sha256: sha256Schema,
  source_offer_evidence_sha256: sha256Schema,
  request_sha256: sha256Schema,
  provider_dispatch_count: z.number().int().min(0).max(1),
  terminal_error_code: z.string().nullable(),
  terminal_http_status: z.number().int().min(100).max(599).nullable(),
  terminal_response_sha256: sha256Schema.nullable(),
  normalized_offer_sha256: sha256Schema.nullable(),
  price_amount_minor: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullable(),
  price_currency: z.literal("USD").nullable(),
  offer_expires_at: z.string().nullable(),
  observed_at: z.string().nullable(),
  owner_name: z.string().nullable(),
  owner_iata_code: z.string().nullable(),
  owner_identity_sha256: sha256Schema.nullable(),
}).strict();
const claimRowSchema = z.object({
  attempt_id: uuidSchema,
  attempt_state: z.literal("dispatching"),
  attempt_revision: z.literal(1),
}).strict();
const completionRowSchema = z.object({
  attempt_id: uuidSchema,
  attempt_state: z.enum(["succeeded", "failed", "ambiguous"]),
  attempt_revision: z.literal(2),
}).strict();

type AttemptRow = z.infer<typeof attemptRowSchema>;
type ProductionEnvironment = Readonly<Record<string, string | undefined>>;

export interface FlightConsumerProductionDuffelOfferRefreshJournalPort {
  inspect(parameters: Readonly<{
    p_execution_scope_sha256: string;
    p_idempotency_sha256: string;
    p_source_id: string;
    p_source_offer_evidence_sha256: string;
  }>): Promise<unknown>;
  begin(parameters: Readonly<{
    p_execution_scope_sha256: string;
    p_idempotency_sha256: string;
    p_source_id: string;
    p_source_shopping_attempt_id: string;
    p_source_shopping_execution_scope_sha256: string;
    p_source_offer_evidence_sha256: string;
    p_offer_id_sha256: string;
    p_offer_binding_sha256: string;
    p_authority_sha256: string;
    p_request_sha256: string;
    p_dispatch_not_after: string;
  }>): Promise<unknown>;
  claim(parameters: Readonly<{
    p_attempt_id: string;
    p_expected_revision: 0;
    p_execution_scope_sha256: string;
    p_offer_binding_sha256: string;
    p_request_sha256: string;
  }>): Promise<unknown>;
  complete(parameters: Readonly<{
    p_attempt_id: string;
    p_expected_revision: 1;
    p_execution_scope_sha256: string;
    p_offer_binding_sha256: string;
    p_request_sha256: string;
    p_terminal_state: "succeeded" | "failed" | "ambiguous";
    p_provider_dispatch_count: 0 | 1;
    p_terminal_error_code: string | null;
    p_terminal_http_status: number | null;
    p_terminal_response_sha256: string | null;
    p_normalized_offer_sha256: string | null;
    p_price_amount_minor: number | null;
    p_offer_expires_at: string | null;
    p_observed_at: string | null;
    p_owner_name: string | null;
    p_owner_iata_code: string | null;
    p_owner_identity_sha256: string | null;
  }>): Promise<unknown>;
}

class SupabaseFlightConsumerProductionDuffelOfferRefreshJournalPort
implements FlightConsumerProductionDuffelOfferRefreshJournalPort {
  async inspect(parameters: Parameters<
    FlightConsumerProductionDuffelOfferRefreshJournalPort["inspect"]
  >[0]) {
    const { data, error } = await createAdminClient().rpc(
      "get_flight_consumer_live_duffel_offer_refresh_attempt_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelOfferRefreshError(
      503,
      "journal_inspection_failed",
    );
    return data;
  }

  async begin(parameters: Parameters<
    FlightConsumerProductionDuffelOfferRefreshJournalPort["begin"]
  >[0]) {
    const { data, error } = await createAdminClient().rpc(
      "prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelOfferRefreshError(
      503,
      "journal_prepare_failed",
    );
    return data;
  }

  async claim(parameters: Parameters<
    FlightConsumerProductionDuffelOfferRefreshJournalPort["claim"]
  >[0]) {
    const { data, error } = await createAdminClient().rpc(
      "claim_flight_consumer_live_duffel_offer_refresh_attempt_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelOfferRefreshError(
      409,
      "journal_claim_refused",
    );
    return data;
  }

  async complete(parameters: Parameters<
    FlightConsumerProductionDuffelOfferRefreshJournalPort["complete"]
  >[0]) {
    const { data, error } = await createAdminClient().rpc(
      "complete_flight_consumer_live_duffel_offer_refresh_attempt_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelOfferRefreshError(
      503,
      "journal_completion_failed",
    );
    return data;
  }
}

export class FlightConsumerProductionDuffelOfferRefreshError extends Error {
  constructor(
    readonly status: 409 | 502 | 503 | 504 = 503,
    readonly diagnostic = "workflow_unavailable",
  ) {
    super("The Duffel Production live-offer refresh observation could not be completed.");
    this.name = "FlightConsumerProductionDuffelOfferRefreshError";
  }
}

export type FlightConsumerProductionDuffelOfferRefreshResult = Readonly<{
  version: "flight-consumer-production-duffel-live-offer-refresh-result-v1";
  mode: typeof FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_OFFER_REFRESH_MODE;
  attemptId: string;
  state: "observed";
  replay: boolean;
  providerCode: "duffel";
  providerEnvironment: "live";
  price: Readonly<{ currency: "USD"; amountMinor: number }>;
  owner: Readonly<{
    name: string;
    iataCode: string | null;
    identitySha256: string;
  }>;
  expiresAt: string;
  observedAt: string;
  evidence: Readonly<{
    offerBindingSha256: string;
    sourceOfferEvidenceSha256: string;
    requestSha256: string;
    responseSha256: string;
    normalizedOfferSha256: string;
  }>;
  providerRetrieveOfferDispatchCount: 1;
  providerRequestsThisInvocation: 0 | 1;
  automaticRetryAttempted: false;
  rawProviderReferencesExposed: false;
  finalCheckoutPricingAuthorized: false;
  orderAuthorized: false;
  paymentAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
  refundAuthorized: false;
  servicingAuthorized: false;
  consumerReleaseEnabled: false;
}>;

function oneRow<T>(schema: z.ZodType<T>, value: unknown) {
  const accepted = z.array(schema).length(1).safeParse(value);
  if (!accepted.success) {
    throw new FlightConsumerProductionDuffelOfferRefreshError(
      503,
      "journal_receipt_rejected",
    );
  }
  return accepted.data[0]!;
}

function optionalRow<T>(schema: z.ZodType<T>, value: unknown) {
  const accepted = z.array(schema).max(1).safeParse(value);
  if (!accepted.success) {
    throw new FlightConsumerProductionDuffelOfferRefreshError(
      503,
      "journal_receipt_rejected",
    );
  }
  return accepted.data[0] ?? null;
}

function requireExactLane(env: ProductionEnvironment) {
  const exact = Object.freeze({
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "true",
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
    FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "false",
    FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "false",
    FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "false",
  });
  requireFlightConsumerProductionDarkRuntime(env);
  for (const [name, expected] of Object.entries(exact)) {
    if (env[name] !== expected) {
      throw new FlightConsumerProductionDuffelOfferRefreshError(
        503,
        "workflow_unavailable",
      );
    }
  }
}

function asAmountMinor(value: number | string | null) {
  const amount = typeof value === "string" ? Number(value) : value;
  if (amount === null || !Number.isSafeInteger(amount) || amount < 1) {
    throw new FlightConsumerProductionDuffelOfferRefreshError(
      503,
      "journal_receipt_rejected",
    );
  }
  return amount;
}

function safeResult(input: Readonly<{
  attemptId: string;
  replay: boolean;
  providerRequestsThisInvocation: 0 | 1;
  offerBindingSha256: string;
  sourceOfferEvidenceSha256: string;
  requestSha256: string;
  responseSha256: string;
  normalizedOfferSha256: string;
  priceAmountMinor: number;
  ownerName: string;
  ownerIataCode: string | null;
  ownerIdentitySha256: string;
  expiresAt: string;
  observedAt: string;
}>): FlightConsumerProductionDuffelOfferRefreshResult {
  return Object.freeze({
    version: "flight-consumer-production-duffel-live-offer-refresh-result-v1",
    mode: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_OFFER_REFRESH_MODE,
    attemptId: input.attemptId,
    state: "observed",
    replay: input.replay,
    providerCode: "duffel",
    providerEnvironment: "live",
    price: Object.freeze({ currency: "USD", amountMinor: input.priceAmountMinor }),
    owner: Object.freeze({
      name: input.ownerName,
      iataCode: input.ownerIataCode,
      identitySha256: input.ownerIdentitySha256,
    }),
    expiresAt: input.expiresAt,
    observedAt: input.observedAt,
    evidence: Object.freeze({
      offerBindingSha256: input.offerBindingSha256,
      sourceOfferEvidenceSha256: input.sourceOfferEvidenceSha256,
      requestSha256: input.requestSha256,
      responseSha256: input.responseSha256,
      normalizedOfferSha256: input.normalizedOfferSha256,
    }),
    providerRetrieveOfferDispatchCount: 1,
    providerRequestsThisInvocation: input.providerRequestsThisInvocation,
    automaticRetryAttempted: false,
    rawProviderReferencesExposed: false,
    finalCheckoutPricingAuthorized: false,
    orderAuthorized: false,
    paymentAuthorized: false,
    settlementAuthorized: false,
    ticketingAuthorized: false,
    refundAuthorized: false,
    servicingAuthorized: false,
    consumerReleaseEnabled: false,
  });
}

function safeReplay(
  row: AttemptRow,
  sourceOfferEvidenceSha256: string,
  offerBindingSha256: string,
) {
  if (
    row.attempt_state !== "succeeded"
    || row.source_offer_evidence_sha256 !== sourceOfferEvidenceSha256
    || row.offer_binding_sha256 !== offerBindingSha256
    || row.provider_dispatch_count !== 1
    || row.terminal_http_status !== 200
    || row.terminal_response_sha256 === null
    || row.normalized_offer_sha256 === null
    || row.price_currency !== "USD"
    || row.offer_expires_at === null
    || row.observed_at === null
    || row.owner_name === null
    || row.owner_identity_sha256 === null
  ) {
    throw new FlightConsumerProductionDuffelOfferRefreshError(
      409,
      "prior_attempt_not_replayable",
    );
  }
  return safeResult({
    attemptId: row.attempt_id,
    replay: true,
    providerRequestsThisInvocation: 0,
    offerBindingSha256,
    sourceOfferEvidenceSha256,
    requestSha256: row.request_sha256,
    responseSha256: row.terminal_response_sha256,
    normalizedOfferSha256: row.normalized_offer_sha256,
    priceAmountMinor: asAmountMinor(row.price_amount_minor),
    ownerName: row.owner_name,
    ownerIataCode: row.owner_iata_code,
    ownerIdentitySha256: row.owner_identity_sha256,
    expiresAt: new Date(row.offer_expires_at).toISOString(),
    observedAt: new Date(row.observed_at).toISOString(),
  });
}

async function readBoundedBody(response: Response) {
  const declared = response.headers.get("content-length");
  if (
    declared !== null
    && (!/^(?:0|[1-9]\d*)$/.test(declared)
      || Number(declared) > FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_MAX_BYTES)
  ) {
    throw new Error("provider_response_too_large");
  }
  const reader = response.body?.getReader();
  if (reader === undefined) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("provider_response_too_large");
    }
    chunks.push(chunk.value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function createFlightConsumerProductionDuffelOfferRefreshTransport(
  fetcher: typeof fetch = fetch,
): FlightConsumerProductionDuffelLiveOfferRepriceTransport {
  return Object.freeze({
    async retrieveBoundOffer(
      request: FlightConsumerProductionDuffelLiveOfferRepriceRequest,
    ): Promise<FlightConsumerProductionDuffelLiveOfferRepriceResponse> {
      if (request.method !== "GET" || request.body !== null) {
        throw new Error("provider_request_refused");
      }
      const response = await fetcher(request.url, {
        method: "GET",
        headers: request.headers,
        body: null,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: request.signal,
      });
      return Object.freeze({
        status: response.status,
        url: response.url,
        redirected: response.redirected,
        headers: response.headers,
        body: await readBoundedBody(response),
      });
    },
  });
}

export function createFlightConsumerProductionDuffelOfferRefreshJournalPort():
FlightConsumerProductionDuffelOfferRefreshJournalPort {
  return Object.freeze(
    new SupabaseFlightConsumerProductionDuffelOfferRefreshJournalPort(),
  );
}

export function createFlightConsumerProductionDarkDuffelOfferRefreshWorkflow(
  env: ProductionEnvironment = process.env,
  dependencies: Readonly<{
    offerSources?: FlightConsumerProductionDuffelOfferSourcePort;
    journal?: FlightConsumerProductionDuffelOfferRefreshJournalPort;
    transport?: FlightConsumerProductionDuffelLiveOfferRepriceTransport;
  }> = {},
) {
  requireExactLane(env);
  const runtime = requireFlightConsumerProductionDarkRuntime(env);
  const offerSources = dependencies.offerSources
    ?? createFlightConsumerProductionDuffelOfferSourcePort();
  const journal = dependencies.journal
    ?? createFlightConsumerProductionDuffelOfferRefreshJournalPort();
  const transport = dependencies.transport
    ?? createFlightConsumerProductionDuffelOfferRefreshTransport();

  return Object.freeze({
    async execute(value: unknown): Promise<FlightConsumerProductionDuffelOfferRefreshResult> {
      const parsed = inputSchema.safeParse(value);
      if (!parsed.success) {
        throw new FlightConsumerProductionDuffelOfferRefreshError(
          409,
          "request_contract_refused",
        );
      }
      let source;
      const offerIdSha256 =
        deriveFlightConsumerProductionDuffelLiveOfferIdSha256(
          parsed.data.offerId,
        );
      try {
        source = acceptFlightConsumerProductionDuffelOfferSource(
          await offerSources.resolve({
            p_source_shopping_attempt_id: parsed.data.sourceShoppingAttemptId,
            p_source_shopping_execution_scope_sha256:
              runtime.binding.executionScopeSha256,
            p_offer_id_sha256: offerIdSha256,
          }),
          {
            attemptId: parsed.data.sourceShoppingAttemptId,
            executionScopeSha256: runtime.binding.executionScopeSha256,
          },
        );
      } catch {
        throw new FlightConsumerProductionDuffelOfferRefreshError(
          409,
          "source_offer_unavailable",
        );
      }
      if (source.offerIdSha256 !== offerIdSha256) {
        throw new FlightConsumerProductionDuffelOfferRefreshError(
          409,
          "source_offer_binding_rejected",
        );
      }
      const offerBindingSha256 = sha256FlightEvidence({
        version: "flight-consumer-production-duffel-live-offer-binding-v1",
        providerCode: "duffel",
        providerEnvironment: "live",
        offerIdSha256: source.offerIdSha256,
        sourceOfferEvidenceSha256: source.sourceOfferEvidenceSha256,
        sourceShoppingExecutionScopeSha256:
          source.sourceShoppingExecutionScopeSha256,
      });
      const idempotencySha256 = sha256FlightEvidence({
        version: "flight-consumer-production-duffel-live-offer-refresh-idempotency-v1",
        executionScopeSha256: runtime.binding.executionScopeSha256,
        sourceId: source.sourceId,
        sourceShoppingAttemptId: source.sourceShoppingAttemptId,
        sourceOfferEvidenceSha256: source.sourceOfferEvidenceSha256,
        offerBindingSha256,
      });

      const inspected = optionalRow(attemptRowSchema, await journal.inspect({
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
        p_idempotency_sha256: idempotencySha256,
        p_source_id: source.sourceId,
        p_source_offer_evidence_sha256: source.sourceOfferEvidenceSha256,
      }));
      if (inspected !== null) {
        return safeReplay(
          inspected,
          source.sourceOfferEvidenceSha256,
          offerBindingSha256,
        );
      }

      const authority = issueFlightConsumerProductionDuffelLiveOfferRepriceAuthority({
        confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
        offerId: parsed.data.offerId,
        sourceOfferEvidenceSha256: source.sourceOfferEvidenceSha256,
        sourceShoppingExecutionScopeSha256:
          source.sourceShoppingExecutionScopeSha256,
      }, env);
      if (
        authority.offerIdSha256 !== source.offerIdSha256
        || authority.offerBindingSha256 !== offerBindingSha256
      ) {
        throw new FlightConsumerProductionDuffelOfferRefreshError(
          503,
          "source_binding_rejected",
        );
      }
      const requestSha256 =
        deriveFlightConsumerProductionDuffelLiveOfferRepriceRequestSha256(
          authority,
        );
      const begun = oneRow(attemptRowSchema, await journal.begin({
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
        p_idempotency_sha256: idempotencySha256,
        p_source_id: source.sourceId,
        p_source_shopping_attempt_id: source.sourceShoppingAttemptId,
        p_source_shopping_execution_scope_sha256:
          source.sourceShoppingExecutionScopeSha256,
        p_source_offer_evidence_sha256: source.sourceOfferEvidenceSha256,
        p_offer_id_sha256: source.offerIdSha256,
        p_offer_binding_sha256: authority.offerBindingSha256,
        p_authority_sha256: authority.authoritySha256,
        p_request_sha256: requestSha256,
        p_dispatch_not_after: authority.dispatchNotAfter,
      }));
      if (begun.decision === "replay") {
        return safeReplay(
          begun,
          source.sourceOfferEvidenceSha256,
          authority.offerBindingSha256,
        );
      }
      const claimed = oneRow(claimRowSchema, await journal.claim({
        p_attempt_id: begun.attempt_id,
        p_expected_revision: 0,
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
        p_offer_binding_sha256: authority.offerBindingSha256,
        p_request_sha256: requestSha256,
      }));
      if (claimed.attempt_id !== begun.attempt_id) {
        throw new FlightConsumerProductionDuffelOfferRefreshError(
          503,
          "journal_claim_receipt_rejected",
        );
      }

      try {
        const refreshed = await createFlightConsumerProductionDuffelLiveOfferRepriceAdapter({
          authority,
          transport,
        }).execute({
          confirmation: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
          offerBindingSha256: authority.offerBindingSha256,
        });
        if (refreshed.evidence.requestSha256 !== requestSha256) {
          throw new FlightConsumerProductionDuffelOfferRefreshError(
            503,
            "provider_receipt_rejected",
          );
        }
        const completed = oneRow(completionRowSchema, await journal.complete({
          p_attempt_id: begun.attempt_id,
          p_expected_revision: 1,
          p_execution_scope_sha256: runtime.binding.executionScopeSha256,
          p_offer_binding_sha256: authority.offerBindingSha256,
          p_request_sha256: requestSha256,
          p_terminal_state: "succeeded",
          p_provider_dispatch_count: 1,
          p_terminal_error_code: null,
          p_terminal_http_status: 200,
          p_terminal_response_sha256: refreshed.evidence.responseSha256,
          p_normalized_offer_sha256: refreshed.evidence.normalizedOfferSha256,
          p_price_amount_minor: refreshed.price.amountMinor,
          p_offer_expires_at: refreshed.expiresAt,
          p_observed_at: refreshed.observedAt,
          p_owner_name: refreshed.owner.name,
          p_owner_iata_code: refreshed.owner.iataCode,
          p_owner_identity_sha256: refreshed.owner.identitySha256,
        }));
        if (completed.attempt_id !== begun.attempt_id) {
          throw new FlightConsumerProductionDuffelOfferRefreshError(
            503,
            "journal_completion_receipt_rejected",
          );
        }
        return safeResult({
          attemptId: begun.attempt_id,
          replay: false,
          providerRequestsThisInvocation: 1,
          offerBindingSha256: authority.offerBindingSha256,
          sourceOfferEvidenceSha256: source.sourceOfferEvidenceSha256,
          requestSha256,
          responseSha256: refreshed.evidence.responseSha256,
          normalizedOfferSha256: refreshed.evidence.normalizedOfferSha256,
          priceAmountMinor: refreshed.price.amountMinor,
          ownerName: refreshed.owner.name,
          ownerIataCode: refreshed.owner.iataCode,
          ownerIdentitySha256: refreshed.owner.identitySha256,
          expiresAt: refreshed.expiresAt,
          observedAt: refreshed.observedAt,
        });
      } catch (error) {
        const providerError = error instanceof
          FlightConsumerProductionDuffelLiveOfferRepriceError
          ? error
          : null;
        const terminalState = providerError?.providerOutcome === "ambiguous"
          ? "ambiguous" as const
          : "failed" as const;
        const providerDispatchCount = providerError?.providerOutcome === "not_dispatched"
          ? 0 as const
          : 1 as const;
        await journal.complete({
          p_attempt_id: begun.attempt_id,
          p_expected_revision: 1,
          p_execution_scope_sha256: runtime.binding.executionScopeSha256,
          p_offer_binding_sha256: authority.offerBindingSha256,
          p_request_sha256: requestSha256,
          p_terminal_state: terminalState,
          p_provider_dispatch_count: terminalState === "ambiguous"
            ? 1
            : providerDispatchCount,
          p_terminal_error_code: providerError?.code ?? "workflow_failed",
          p_terminal_http_status: null,
          p_terminal_response_sha256: null,
          p_normalized_offer_sha256: null,
          p_price_amount_minor: null,
          p_offer_expires_at: null,
          p_observed_at: null,
          p_owner_name: null,
          p_owner_iata_code: null,
          p_owner_identity_sha256: null,
        }).catch(() => undefined);
        if (error instanceof FlightConsumerProductionDuffelOfferRefreshError) {
          throw error;
        }
        throw new FlightConsumerProductionDuffelOfferRefreshError(
          terminalState === "ambiguous" ? 504 : 502,
          providerError?.code ?? "offer_refresh_failed",
        );
      }
    },
  });
}
