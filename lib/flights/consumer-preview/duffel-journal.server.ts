import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { DUFFEL_PREVIEW_RUNTIME_BINDING } from "../duffel/preview-ports.server";
import type {
  DuffelAuthenticatedRequestJournal,
  DuffelJournalBeginInput,
  DuffelJournalCompletionInput,
  DuffelJournalMarkDispatchingInput,
  DuffelSafeRequestMetadata,
} from "../duffel/telemetry.server";
import { canonicalFlightJson, type FlightCanonicalJsonValue } from "../runtime-safety";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();

const baseContextSchema = z.object({
  customerId: uuidSchema,
  searchId: uuidSchema,
}).strict();

const contextSchema = z.discriminatedUnion("kind", [
  baseContextSchema.extend({
    kind: z.literal("search"),
  }).strict(),
  baseContextSchema.extend({
    kind: z.literal("reprice"),
    offerId: uuidSchema,
    idempotencyKeySha256: sha256Schema,
    idempotencyRequestSha256: sha256Schema,
  }).strict(),
  baseContextSchema.extend({
    kind: z.literal("order"),
    offerId: uuidSchema,
    orderId: uuidSchema,
    offerEvidenceReceiptSha256: sha256Schema,
    paymentBindingReceiptSha256: sha256Schema,
    providerSettlementBindingReceiptSha256: sha256Schema,
  }).strict(),
]);

export type FlightConsumerPreviewDuffelJournalContext = z.infer<typeof contextSchema>;

type RpcResult = Readonly<{ data: unknown; error: unknown }>;

export interface FlightConsumerPreviewJournalRpc {
  rpc(name: string, parameters: Readonly<Record<string, unknown>>): Promise<RpcResult>;
}

export type FlightConsumerPreviewBeforeDuffelDispatchClaim = (
  input: Readonly<{ attemptId: string; requestDigest: string }>,
) => Promise<void>;

type AttemptAuthority = Readonly<{
  attemptId: string;
  operation: DuffelSafeRequestMetadata["operation"];
  requestDigest: string;
  authorizationReceiptDigest: string;
  providerBindingReceiptSha256: string;
  journalReceiptDigest: string;
  dispatchReceiptDigest: string | null;
  completionReceiptDigest: string | null;
  terminalState: "blocked" | "succeeded" | "failed" | "ambiguous" | null;
  terminalRevision: 1 | 2 | null;
}>;

export type FlightConsumerPreviewDuffelJournalOutcome = Readonly<{
  attemptId: string;
  requestDigest: string;
  authorizationReceiptDigest: string;
  providerBindingReceiptSha256: string;
  completionReceiptDigest: string | null;
  currentRevision: 0 | 1 | 2;
  terminalState: AttemptAuthority["terminalState"];
  terminalRevision: AttemptAuthority["terminalRevision"];
}>;

const attemptRowSchema = z.object({
  attempt_id: uuidSchema,
  attempt_revision: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  attempt_state: z.enum(["prepared", "dispatching", "blocked", "succeeded", "failed", "ambiguous"]),
}).passthrough();

const preparedAttemptRecoverySchema = z.object({
  attemptId: uuidSchema,
  dispatchNotAfter: z.string().datetime({ offset: true }),
}).strict();

const dispatchDeadlineCeilingSchema = z.string().datetime({ offset: true });

export type FlightConsumerPreviewPreparedAttemptRecovery = z.infer<
  typeof preparedAttemptRecoverySchema
>;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function authoritySecret(env: Readonly<Record<string, string | undefined>>) {
  const secret = env.FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET;
  if (
    env.VERCEL_ENV !== "preview"
    || env.FLIGHT_CONSUMER_PREVIEW_ENABLED !== "true"
    || typeof secret !== "string"
    || secret.length < 32
  ) throw new FlightConsumerPreviewDuffelJournalError();
  return secret;
}

function hmac(secret: string, label: string, value: unknown) {
  return createHmac("sha256", secret)
    .update(label)
    .update("\0")
    .update(canonicalFlightJson(value as FlightCanonicalJsonValue))
    .digest("hex");
}

function equalDigest(left: string, right: string) {
  return /^[0-9a-f]{64}$/.test(left)
    && /^[0-9a-f]{64}$/.test(right)
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function oneAttemptRow(value: unknown) {
  const parsed = z.array(attemptRowSchema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewDuffelJournalError();
  return parsed.data[0]!;
}

function operationFor(context: FlightConsumerPreviewDuffelJournalContext) {
  if (context.kind === "search") return "create_offer_request" as const;
  if (context.kind === "reprice") return "retrieve_offer" as const;
  return "create_order" as const;
}

export class FlightConsumerPreviewDuffelJournalError extends Error {
  constructor() {
    super("Flight Consumer Preview provider journal is unavailable.");
    this.name = "FlightConsumerPreviewDuffelJournalError";
  }
}

class AdminJournalRpc implements FlightConsumerPreviewJournalRpc {
  async rpc(name: string, parameters: Readonly<Record<string, unknown>>) {
    const result = await createAdminClient().rpc(name, parameters);
    return { data: result.data, error: result.error };
  }
}

export class FlightConsumerPreviewDuffelJournal implements DuffelAuthenticatedRequestJournal {
  readonly #context: FlightConsumerPreviewDuffelJournalContext;
  readonly #rpc: FlightConsumerPreviewJournalRpc;
  readonly #secret: string;
  readonly #preparedAttemptRecovery: FlightConsumerPreviewPreparedAttemptRecovery | null;
  readonly #freshAttemptDispatchDeadlineCeiling: string | null;
  readonly #beforeDispatchClaim: FlightConsumerPreviewBeforeDuffelDispatchClaim | null;
  #attempt: AttemptAuthority | null = null;

  constructor(input: Readonly<{
    context: FlightConsumerPreviewDuffelJournalContext;
    rpc: FlightConsumerPreviewJournalRpc;
    secret: string;
    preparedAttemptRecovery?: FlightConsumerPreviewPreparedAttemptRecovery | null;
    freshAttemptDispatchDeadlineCeiling?: string | null;
    beforeDispatchClaim?: FlightConsumerPreviewBeforeDuffelDispatchClaim | null;
  }>) {
    this.#context = contextSchema.parse(input.context);
    if (typeof input.rpc?.rpc !== "function" || input.secret.length < 32) {
      throw new FlightConsumerPreviewDuffelJournalError();
    }
    this.#rpc = input.rpc;
    this.#secret = input.secret;
    this.#preparedAttemptRecovery = input.preparedAttemptRecovery === undefined
      || input.preparedAttemptRecovery === null
      ? null
      : preparedAttemptRecoverySchema.parse(input.preparedAttemptRecovery);
    this.#freshAttemptDispatchDeadlineCeiling = input.freshAttemptDispatchDeadlineCeiling
      === undefined || input.freshAttemptDispatchDeadlineCeiling === null
      ? null
      : dispatchDeadlineCeilingSchema.parse(input.freshAttemptDispatchDeadlineCeiling);
    if (
      input.beforeDispatchClaim !== undefined
      && input.beforeDispatchClaim !== null
      && typeof input.beforeDispatchClaim !== "function"
    ) throw new FlightConsumerPreviewDuffelJournalError();
    this.#beforeDispatchClaim = input.beforeDispatchClaim ?? null;
  }

  readOutcome(): FlightConsumerPreviewDuffelJournalOutcome | null {
    const attempt = this.#attempt;
    return attempt === null ? null : Object.freeze({
      attemptId: attempt.attemptId,
      requestDigest: attempt.requestDigest,
      authorizationReceiptDigest: attempt.authorizationReceiptDigest,
      providerBindingReceiptSha256: attempt.providerBindingReceiptSha256,
      completionReceiptDigest: attempt.completionReceiptDigest,
      currentRevision: attempt.terminalRevision
        ?? (attempt.dispatchReceiptDigest === null ? 0 as const : 1 as const),
      terminalState: attempt.terminalState,
      terminalRevision: attempt.terminalRevision,
    });
  }

  async begin(input: DuffelJournalBeginInput) {
    try {
      const operation = operationFor(this.#context);
      if (this.#attempt !== null || input.metadata.operation !== operation) throw new Error();
      const expectedAuthorization = hmac(this.#secret, "duffel-preview-traffic-v1", input.metadata);
      if (!equalDigest(input.authorizationReceiptDigest, expectedAuthorization)) throw new Error();
      const providerBindingReceiptSha256 = hmac(this.#secret, "duffel-preview-provider-binding-v1", {
        binding: DUFFEL_PREVIEW_RUNTIME_BINDING,
        requestDigest: input.metadata.requestDigest,
      });
      const freshDispatchNotAfter = new Date(Math.min(
        Date.now() + 4 * 60_000,
        this.#freshAttemptDispatchDeadlineCeiling === null
          ? Number.POSITIVE_INFINITY
          : Date.parse(this.#freshAttemptDispatchDeadlineCeiling),
      )).toISOString();
      const dispatchNotAfter = this.#preparedAttemptRecovery?.dispatchNotAfter
        ?? freshDispatchNotAfter;
      const common = {
        p_request_plan_sha256: input.metadata.requestDigest,
        p_request_sha256: input.metadata.requestDigest,
        p_request_body_sha256: input.metadata.requestBodyDigest ?? sha256("null"),
        p_adapter_source_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.adapterSourceSha256,
        p_provider_binding_receipt_sha256: providerBindingReceiptSha256,
        p_operation_authority_receipt_sha256: input.authorizationReceiptDigest,
        p_dispatch_not_after: dispatchNotAfter,
      } as const;
      let name: string;
      let parameters: Readonly<Record<string, unknown>>;
      if (this.#context.kind === "search") {
        name = "prepare_flight_consumer_search_attempt_v1";
        parameters = { p_search_id: this.#context.searchId, ...common };
      } else if (this.#context.kind === "reprice") {
        name = "prepare_flight_consumer_reprice_attempt_v1";
        parameters = {
          p_customer_id: this.#context.customerId,
          p_offer_id: this.#context.offerId,
          p_key_sha256: this.#context.idempotencyKeySha256,
          p_idempotency_request_sha256: this.#context.idempotencyRequestSha256,
          ...common,
        };
      } else {
        name = "prepare_flight_consumer_duffel_order_attempt_v1";
        parameters = {
          p_order_id: this.#context.orderId,
          p_offer_evidence_receipt_sha256: this.#context.offerEvidenceReceiptSha256,
          ...common,
          p_payment_binding_receipt_sha256: this.#context.paymentBindingReceiptSha256,
          p_provider_settlement_binding_receipt_sha256:
            this.#context.providerSettlementBindingReceiptSha256,
        };
      }
      const result = await this.#rpc.rpc(name, parameters);
      if (result.error) throw new Error();
      const row = oneAttemptRow(result.data);
      if (
        row.attempt_revision !== 0
        || row.attempt_state !== "prepared"
        || (
          this.#preparedAttemptRecovery !== null
          && row.attempt_id !== this.#preparedAttemptRecovery.attemptId
        )
      ) throw new Error();
      const journalReceiptDigest = hmac(this.#secret, "duffel-consumer-journal-prepared-v1", {
        attemptId: row.attempt_id,
        context: this.#context,
        requestDigest: input.metadata.requestDigest,
        authorizationReceiptDigest: input.authorizationReceiptDigest,
      });
      this.#attempt = Object.freeze({
        attemptId: row.attempt_id,
        operation,
        requestDigest: input.metadata.requestDigest,
        authorizationReceiptDigest: input.authorizationReceiptDigest,
        providerBindingReceiptSha256,
        journalReceiptDigest,
        dispatchReceiptDigest: null,
        completionReceiptDigest: null,
        terminalState: null,
        terminalRevision: null,
      });
      return Object.freeze({
        version: "duffel-journal-begin-result-v1" as const,
        state: "prepared" as const,
        attemptId: row.attempt_id,
        revision: 0 as const,
        journalReceiptDigest,
      });
    } catch {
      throw new FlightConsumerPreviewDuffelJournalError();
    }
  }

  async markDispatching(input: DuffelJournalMarkDispatchingInput) {
    try {
      const attempt = this.#attempt;
      if (
        attempt === null
        || attempt.dispatchReceiptDigest !== null
        || input.attemptId !== attempt.attemptId
        || input.requestDigest !== attempt.requestDigest
        || !equalDigest(input.authorizationReceiptDigest, attempt.authorizationReceiptDigest)
        || !equalDigest(input.journalReceiptDigest, attempt.journalReceiptDigest)
      ) return Object.freeze({
        version: "duffel-journal-mark-dispatching-result-v1" as const,
        decision: "refused" as const,
      });
      if (
        this.#preparedAttemptRecovery !== null
        && Date.parse(this.#preparedAttemptRecovery.dispatchNotAfter) <= Date.now()
      ) return Object.freeze({
        version: "duffel-journal-mark-dispatching-result-v1" as const,
        decision: "refused" as const,
      });
      if (this.#context.kind === "order" && this.#beforeDispatchClaim !== null) {
        await this.#beforeDispatchClaim(Object.freeze({
          attemptId: attempt.attemptId,
          requestDigest: attempt.requestDigest,
        }));
      }
      const common = {
        p_attempt_id: attempt.attemptId,
        p_expected_revision: 0,
        p_adapter_source_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.adapterSourceSha256,
        p_provider_binding_receipt_sha256: attempt.providerBindingReceiptSha256,
        p_operation_authority_receipt_sha256: attempt.authorizationReceiptDigest,
      } as const;
      const result = this.#context.kind === "order"
        ? await this.#rpc.rpc("claim_flight_consumer_duffel_order_attempt_v1", {
          ...common,
          p_payment_binding_receipt_sha256: this.#context.paymentBindingReceiptSha256,
          p_provider_settlement_binding_receipt_sha256:
            this.#context.providerSettlementBindingReceiptSha256,
        })
        : await this.#rpc.rpc("claim_flight_consumer_shopping_attempt_v1", common);
      if (result.error) {
        // A recovered prepared request has already proved which exact attempt
        // may be resumed. Returning a refusal lets the transport close that
        // attempt as blocked instead of treating a rejected claim as
        // post-dispatch ambiguity. A concurrent claimant still wins by CAS:
        // the transport's prepared -> blocked completion will then be refused.
        if (
          (this.#context.kind === "search" || this.#context.kind === "order")
          && this.#preparedAttemptRecovery !== null
        ) return Object.freeze({
          version: "duffel-journal-mark-dispatching-result-v1" as const,
          decision: "refused" as const,
        });
        throw new Error();
      }
      const row = oneAttemptRow(result.data);
      if (
        row.attempt_id !== attempt.attemptId
        || row.attempt_revision !== 1
        || row.attempt_state !== "dispatching"
      ) throw new Error();
      const dispatchReceiptDigest = hmac(this.#secret, "duffel-consumer-journal-dispatch-v1", {
        attemptId: attempt.attemptId,
        requestDigest: attempt.requestDigest,
        journalReceiptDigest: attempt.journalReceiptDigest,
      });
      this.#attempt = Object.freeze({ ...attempt, dispatchReceiptDigest });
      return Object.freeze({
        version: "duffel-journal-mark-dispatching-result-v1" as const,
        decision: "claimed" as const,
        state: "dispatching" as const,
        attemptId: attempt.attemptId,
        revision: 1 as const,
        dispatchReceiptDigest,
      });
    } catch {
      throw new FlightConsumerPreviewDuffelJournalError();
    }
  }

  async complete(input: DuffelJournalCompletionInput) {
    try {
      const attempt = this.#attempt;
      if (
        attempt === null
        || input.attemptId !== attempt.attemptId
        || input.requestDigest !== attempt.requestDigest
        || !equalDigest(input.journalReceiptDigest, attempt.journalReceiptDigest)
        || (input.expectedRevision === 1 && (
          attempt.dispatchReceiptDigest === null
          || input.dispatchReceiptDigest === null
          || !equalDigest(input.dispatchReceiptDigest, attempt.dispatchReceiptDigest)
        ))
      ) throw new Error();
      const completionReceiptDigest = hmac(
        this.#secret,
        "duffel-consumer-journal-completion-v1",
        input,
      );
      const result = await this.#rpc.rpc("complete_flight_provider_request_attempt", {
        p_attempt_id: input.attemptId,
        p_expected_revision: input.expectedRevision,
        p_terminal_state: input.terminalState,
        p_terminal_http_status: input.httpStatus,
        p_terminal_response_sha256: input.responseDigest,
        p_terminal_response_bytes: input.inboundBodyBytes,
        p_terminal_receipt_sha256: completionReceiptDigest,
      });
      if (result.error) throw new Error();
      const row = oneAttemptRow(result.data);
      const revision = input.expectedRevision === 0 ? 1 as const : 2 as const;
      if (
        row.attempt_id !== attempt.attemptId
        || row.attempt_revision !== revision
        || row.attempt_state !== input.terminalState
      ) throw new Error();
      this.#attempt = Object.freeze({
        ...attempt,
        completionReceiptDigest,
        terminalState: input.terminalState,
        terminalRevision: revision,
      });
      return Object.freeze({
        version: "duffel-journal-completion-result-v1" as const,
        state: input.terminalState,
        attemptId: attempt.attemptId,
        revision,
        completionReceiptDigest,
      });
    } catch {
      throw new FlightConsumerPreviewDuffelJournalError();
    }
  }
}

export function createFlightConsumerPreviewDuffelJournal(
  context: FlightConsumerPreviewDuffelJournalContext,
  env: Readonly<Record<string, string | undefined>> = process.env,
  preparedAttemptRecovery: FlightConsumerPreviewPreparedAttemptRecovery | null = null,
  freshAttemptDispatchDeadlineCeiling: string | null = null,
  beforeDispatchClaim: FlightConsumerPreviewBeforeDuffelDispatchClaim | null = null,
) {
  return new FlightConsumerPreviewDuffelJournal({
    context,
    rpc: new AdminJournalRpc(),
    secret: authoritySecret(env),
    preparedAttemptRecovery,
    freshAttemptDispatchDeadlineCeiling,
    beforeDispatchClaim,
  });
}
