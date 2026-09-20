import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { sha256FlightEvidence, type FlightCanonicalJsonValue } from "../runtime-safety";
import { createFlightConsumerPreviewAuthority } from "./authority.server";
import {
  buildFlightConsumerPreviewTerminalResponseFinalizationArtifact,
  loadFlightConsumerPreviewOrderFinalizationState,
} from "./complete-order-workflow.server";
import {
  createFlightConsumerPreviewDuffelOrderRecoveryTransport,
} from "./duffel-order-recovery-transport.server";
import {
  decryptFlightConsumerOrderRecoveryEvidence,
  encryptFlightConsumerOrderRecoveryEvidence,
  readFlightConsumerPreviewOfferEvidenceKeyring,
  type FlightConsumerOrderRecoveryEvidenceContext,
} from "./evidence-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

type FlightConsumerPreviewRuntime = Awaited<
  ReturnType<typeof requireFlightConsumerPreviewRequestRuntime>
>;

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const instantSchema = z.string().datetime({ offset: true });

const convergenceSchema = z.object({
  order_id: uuidSchema,
  customer_id: uuidSchema,
  order_status: z.enum(["order_creating", "requires_review", "ticketed"]),
  execution_scope_sha256: sha256Schema,
  provider_attempt_id: uuidSchema,
  provider_attempt_state: z.literal("succeeded"),
  provider_attempt_revision: z.union([z.literal(2), z.literal("2")]).transform(Number),
  ledger_id: uuidSchema,
  ledger_state: z.enum(["processing", "processed"]),
  ledger_revision: z.union([z.literal(1), z.literal(2), z.literal("1"), z.literal("2")])
    .transform(Number),
  provider_offer_ref_sha256: sha256Schema,
  provider_order_ref_sha256: sha256Schema,
  recovery_evidence_receipt_sha256: sha256Schema.nullable(),
  recovery_retention_expires_at: instantSchema.nullable(),
  reconciliation_case_id: uuidSchema.nullable(),
  reconciliation_case_status: z.enum(["open", "investigating", "blocked", "resolved"]).nullable(),
  reconciliation_resolution_code: z.string().nullable(),
  reconciliation_resolution_actor_type: z.enum(["administrator", "system"]).nullable(),
  reconciliation_system_receipt_sha256: sha256Schema.nullable(),
  reconciliation_updated_at: instantSchema.nullable(),
  issued_ticket_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
}).strict();

const recoveryEvidenceSchema = z.object({
  evidence_id: uuidSchema,
  ledger_id: uuidSchema,
  attempt_id: uuidSchema,
  order_id: uuidSchema,
  customer_id: uuidSchema,
  execution_scope_sha256: sha256Schema,
  provider_offer_ref_sha256: sha256Schema,
  provider_order_ref_sha256: sha256Schema,
  recovery_request_sha256: sha256Schema,
  provider_response_sha256: sha256Schema,
  webhook_verification_receipt_sha256: sha256Schema,
  recovery_authority_receipt_sha256: sha256Schema,
  recovery_evidence_receipt_sha256: sha256Schema,
  key_version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
  iv_base64url: z.string().min(1),
  auth_tag_base64url: z.string().min(1),
  ciphertext_base64url: z.string().min(1),
  aad_sha256: sha256Schema,
  ciphertext_sha256: sha256Schema,
  retention_expires_at: instantSchema,
  created_at: instantSchema,
}).strict();

const completedEvidenceSchema = z.object({
  ledger_id: uuidSchema,
  ledger_revision: z.union([z.literal(2), z.literal("2")]).transform(Number),
  ledger_state: z.literal("processed"),
  evidence_id: uuidSchema,
  recovery_evidence_receipt_sha256: sha256Schema,
  retention_expires_at: instantSchema,
}).strict();

const finalizationResultSchema = z.object({
  order_id: uuidSchema,
  order_status: z.literal("ticketed"),
  issued_ticket_count: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number),
  reconciliation_case_id: uuidSchema,
}).strict();

type ConvergenceRow = z.infer<typeof convergenceSchema>;

type FinalizationArtifact = Readonly<{
  providerOrderRefCiphertext: string;
  providerOrderRefSha256: string;
  providerCreatedAt: string;
  ticketingDeadlineAt: string;
  passengerBindings: readonly Readonly<Record<string, unknown>>[];
  ticketDocuments: readonly Readonly<Record<string, unknown>>[];
  issuedTicketCount: number;
}>;

type RecoveryEnvelope = Readonly<{
  keyVersion: string;
  ivBase64Url: string;
  authTagBase64Url: string;
  ciphertextBase64Url: string;
  aadSha256: string;
  ciphertextSha256: string;
  receiptSha256: string;
}>;

export interface FlightConsumerPreviewAsyncDuffelConvergencePort {
  readContext(parameters: Readonly<{
    p_customer_id: string;
    p_order_id: string;
    p_ledger_id: string;
    p_expected_lease_token_sha256: string | null;
  }>): Promise<unknown>;
  loadEvidence(parameters: Readonly<{
    p_customer_id: string;
    p_order_id: string;
    p_ledger_id: string;
    p_recovery_evidence_receipt_sha256: string;
  }>): Promise<unknown>;
  markAmbiguous(parameters: Readonly<{
    p_attempt_id: string;
    p_expected_terminal_revision: 2;
    p_expected_state_sha256: string;
    p_observed_state_sha256: string;
  }>): Promise<void>;
  completeEvidence(parameters: Readonly<Record<string, unknown>>): Promise<unknown>;
  finalize(parameters: Readonly<Record<string, unknown>>): Promise<unknown>;
}

type RecoveryTransport = Readonly<{
  retrieve(input: Readonly<{
    providerOrderId: string;
    providerOrderRefSha256: string;
  }>): Promise<Readonly<{
    rawBody: Uint8Array;
    responseSha256: string;
    responseBytes: number;
    recoveryRequestSha256: string;
    providerOrderRefSha256: string;
  }>>;
}>;

type RecoveryCrypto = Readonly<{
  seal(input: Readonly<{
    rawBody: Uint8Array;
    providerResponseSha256: string;
    context: FlightConsumerOrderRecoveryEvidenceContext;
  }>): RecoveryEnvelope;
  open(input: Readonly<{
    envelope: unknown;
    providerResponseSha256: string;
    context: FlightConsumerOrderRecoveryEvidenceContext;
  }>): Uint8Array;
}>;

type ArtifactBuilder = (input: Readonly<{
  customerId: string;
  orderId: string;
  attemptId: string;
  executionScopeSha256: string;
  rawBody: Uint8Array;
  providerResponseSha256: string;
  responseObservedAt: string;
}>) => Promise<FinalizationArtifact>;

export class FlightConsumerPreviewAsyncDuffelConvergenceError extends Error {
  constructor() {
    super("The asynchronous Duffel test order could not be safely converged.");
    this.name = "FlightConsumerPreviewAsyncDuffelConvergenceError";
  }
}

function one<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
  return parsed.data[0]! as z.output<S>;
}

function exactContext(value: unknown) {
  const parsed = z.array(convergenceSchema).length(1).safeParse(value);
  if (!parsed.success) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
  return parsed.data[0]!;
}

function millisecondRecoveryObservation(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
  }
  // PostgreSQL timestamptz preserves microseconds, while the authenticated
  // provider projection is intentionally limited to JavaScript milliseconds.
  // Floor only the immutable vault timestamp's representation; never invent a
  // later observation instant.
  return new Date(milliseconds).toISOString();
}

function requestAuthorityPayload(row: ConvergenceRow, recoveryRequestSha256: string) {
  return Object.freeze({
    version: "flight-consumer-preview-duffel-order-recovery-request-authority-v1",
    customerId: row.customer_id,
    orderId: row.order_id,
    attemptId: row.provider_attempt_id,
    ledgerId: row.ledger_id,
    executionScopeSha256: row.execution_scope_sha256,
    providerOfferRefSha256: row.provider_offer_ref_sha256,
    providerOrderRefSha256: row.provider_order_ref_sha256,
    recoveryRequestSha256,
  });
}

function responseAuthorityPayload(
  row: ConvergenceRow,
  recoveryRequestSha256: string,
  requestAuthorityReceiptSha256: string,
  providerResponseSha256: string,
) {
  return Object.freeze({
    version: "flight-consumer-preview-duffel-order-recovery-response-authority-v1",
    customerId: row.customer_id,
    orderId: row.order_id,
    attemptId: row.provider_attempt_id,
    ledgerId: row.ledger_id,
    executionScopeSha256: row.execution_scope_sha256,
    providerOfferRefSha256: row.provider_offer_ref_sha256,
    providerOrderRefSha256: row.provider_order_ref_sha256,
    recoveryRequestSha256,
    requestAuthorityReceiptSha256,
    providerResponseSha256,
  });
}

function evidenceContext(
  row: ConvergenceRow,
  recoveryRequestSha256: string,
  recoveryAuthorityReceiptSha256: string,
) {
  return Object.freeze({
    customerId: row.customer_id,
    orderId: row.order_id,
    attemptId: row.provider_attempt_id,
    ledgerId: row.ledger_id,
    executionScopeSha256: row.execution_scope_sha256,
    recoveryRequestSha256,
    recoveryAuthorityReceiptSha256,
  });
}

export function createInjectedFlightConsumerPreviewAsyncDuffelConvergence(input: Readonly<{
  executionScopeSha256: string;
  port: FlightConsumerPreviewAsyncDuffelConvergencePort;
  transport: RecoveryTransport;
  crypto: RecoveryCrypto;
  authorityReceipt: (operation: string, evidence: FlightCanonicalJsonValue) => string;
  buildArtifact: ArtifactBuilder;
  now: () => Date;
}>) {
  const executionScopeSha256 = sha256Schema.parse(input.executionScopeSha256);
  if (
    typeof input.port?.readContext !== "function"
    || typeof input.port?.loadEvidence !== "function"
    || typeof input.port?.markAmbiguous !== "function"
    || typeof input.port?.completeEvidence !== "function"
    || typeof input.port?.finalize !== "function"
    || typeof input.transport?.retrieve !== "function"
    || typeof input.crypto?.seal !== "function"
    || typeof input.crypto?.open !== "function"
    || typeof input.authorityReceipt !== "function"
    || typeof input.buildArtifact !== "function"
    || typeof input.now !== "function"
  ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();

  async function finalize(
    row: ConvergenceRow,
    recoveryEvidenceReceiptSha256: string,
    artifact: FinalizationArtifact,
  ) {
    if (
      artifact.providerOrderRefSha256 !== row.provider_order_ref_sha256
      || !Number.isSafeInteger(artifact.issuedTicketCount)
      || artifact.issuedTicketCount < 1
      || artifact.passengerBindings.length !== artifact.issuedTicketCount
      || artifact.ticketDocuments.length !== artifact.issuedTicketCount
    ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
    const finalized = one(finalizationResultSchema, await input.port.finalize({
      p_customer_id: row.customer_id,
      p_order_id: row.order_id,
      p_ledger_id: row.ledger_id,
      p_recovery_evidence_receipt_sha256: recoveryEvidenceReceiptSha256,
      p_provider_order_ref_ciphertext: artifact.providerOrderRefCiphertext,
      p_provider_order_ref_sha256: artifact.providerOrderRefSha256,
      p_provider_created_at: artifact.providerCreatedAt,
      p_ticketing_deadline_at: artifact.ticketingDeadlineAt,
      p_passenger_bindings: artifact.passengerBindings,
      p_ticket_documents: artifact.ticketDocuments,
    }));
    if (
      finalized.order_id !== row.order_id
      || finalized.issued_ticket_count !== artifact.issuedTicketCount
      || finalized.issued_ticket_count < 1
    ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
    return Object.freeze({
      orderId: finalized.order_id,
      status: finalized.order_status,
      issuedTicketCount: finalized.issued_ticket_count,
      reconciliationCaseId: finalized.reconciliation_case_id,
      webhookLeaseCompletionRequired: false as const,
    });
  }

  return Object.freeze({
    async converge(untrusted: Readonly<{
      customerId: string;
      orderId: string;
      attemptId: string;
      ledgerId: string;
      leaseTokenSha256: string | null;
      providerOrderId: string;
      providerOrderRefSha256: string;
      providerOfferRefSha256: string;
    }>) {
      let rawBody: Uint8Array | null = null;
      let phase = "identity_contract";
      try {
        const identity = z.object({
          customerId: uuidSchema,
          orderId: uuidSchema,
          attemptId: uuidSchema,
          ledgerId: uuidSchema,
          leaseTokenSha256: sha256Schema.nullable(),
          providerOrderId: z.string().regex(/^ord_[A-Za-z0-9]{8,252}$/),
          providerOrderRefSha256: sha256Schema,
          providerOfferRefSha256: sha256Schema,
        }).strict().parse(untrusted);
        phase = "initial_context";
        let row = exactContext(await input.port.readContext({
          p_customer_id: identity.customerId,
          p_order_id: identity.orderId,
          p_ledger_id: identity.ledgerId,
          p_expected_lease_token_sha256: identity.leaseTokenSha256,
        }));
        if (
          row.customer_id !== identity.customerId
          || row.order_id !== identity.orderId
          || row.provider_attempt_id !== identity.attemptId
          || row.ledger_id !== identity.ledgerId
          || row.execution_scope_sha256 !== executionScopeSha256
          || row.provider_order_ref_sha256 !== identity.providerOrderRefSha256
          || row.provider_offer_ref_sha256 !== identity.providerOfferRefSha256
          || row.provider_attempt_state !== "succeeded"
          || row.provider_attempt_revision !== 2
        ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
        if (row.order_status === "ticketed") {
          if (row.issued_ticket_count < 1) {
            throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
          }
          const webhookLeaseCompletionRequired =
            row.ledger_state === "processing"
            && row.ledger_revision === 1
            && identity.leaseTokenSha256 !== null;
          const terminalReplay = row.ledger_state === "processed"
            && row.ledger_revision === 2
            && identity.leaseTokenSha256 === null;
          if (!webhookLeaseCompletionRequired && !terminalReplay) {
            throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
          }
          return Object.freeze({
            orderId: row.order_id,
            status: "ticketed" as const,
            issuedTicketCount: row.issued_ticket_count,
            reconciliationCaseId: row.reconciliation_case_id,
            webhookLeaseCompletionRequired,
          });
        }
        if (row.order_status === "order_creating") {
          phase = "ambiguity_transition";
          await input.port.markAmbiguous({
            p_attempt_id: row.provider_attempt_id,
            p_expected_terminal_revision: 2,
            p_expected_state_sha256: sha256FlightEvidence({
              version: "flight-consumer-preview-order-review-expected-v1",
              customerId: row.customer_id,
              orderId: row.order_id,
              expected: "ticketed",
            }),
            p_observed_state_sha256: sha256FlightEvidence({
              version: "flight-consumer-preview-order-review-observed-v1",
              orderId: row.order_id,
              attemptId: row.provider_attempt_id,
              currentRevision: 2,
              terminalState: "succeeded",
              terminalRevision: 2,
              reason: "async_order_created_webhook_recovery",
            }),
          });
          phase = "post_ambiguity_context";
          row = exactContext(await input.port.readContext({
            p_customer_id: identity.customerId,
            p_order_id: identity.orderId,
            p_ledger_id: identity.ledgerId,
            p_expected_lease_token_sha256: identity.leaseTokenSha256,
          }));
          if (
            row.customer_id !== identity.customerId
            || row.order_id !== identity.orderId
            || row.provider_attempt_id !== identity.attemptId
            || row.ledger_id !== identity.ledgerId
            || row.execution_scope_sha256 !== executionScopeSha256
            || row.provider_order_ref_sha256 !== identity.providerOrderRefSha256
            || row.provider_offer_ref_sha256 !== identity.providerOfferRefSha256
            || row.order_status !== "requires_review"
            || row.reconciliation_case_id === null
          ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
        }
        if (row.order_status !== "requires_review" || row.reconciliation_case_id === null) {
          throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
        }

        if (row.ledger_state === "processed" && row.ledger_revision === 2) {
          phase = "retained_recovery_evidence";
          if (
            row.recovery_evidence_receipt_sha256 === null
            || row.recovery_retention_expires_at === null
            || Date.parse(row.recovery_retention_expires_at) <= input.now().getTime()
          ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
          const evidence = one(recoveryEvidenceSchema, await input.port.loadEvidence({
            p_customer_id: row.customer_id,
            p_order_id: row.order_id,
            p_ledger_id: row.ledger_id,
            p_recovery_evidence_receipt_sha256: row.recovery_evidence_receipt_sha256,
          }));
          if (
            evidence.ledger_id !== row.ledger_id
            || evidence.attempt_id !== row.provider_attempt_id
            || evidence.order_id !== row.order_id
            || evidence.customer_id !== row.customer_id
            || evidence.execution_scope_sha256 !== row.execution_scope_sha256
            || evidence.provider_offer_ref_sha256 !== row.provider_offer_ref_sha256
            || evidence.provider_order_ref_sha256 !== row.provider_order_ref_sha256
            || evidence.recovery_evidence_receipt_sha256
              !== row.recovery_evidence_receipt_sha256
            || Date.parse(evidence.retention_expires_at) <= input.now().getTime()
          ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
          const requestAuthorityReceiptSha256 = input.authorityReceipt(
            "duffel-order-recovery-request",
            requestAuthorityPayload(
              row,
              evidence.recovery_request_sha256,
            ) as unknown as FlightCanonicalJsonValue,
          );
          const recoveryAuthorityReceiptSha256 = input.authorityReceipt(
            "duffel-order-recovery-response",
            responseAuthorityPayload(
              row,
              evidence.recovery_request_sha256,
              requestAuthorityReceiptSha256,
              evidence.provider_response_sha256,
            ) as unknown as FlightCanonicalJsonValue,
          );
          if (recoveryAuthorityReceiptSha256 !== evidence.recovery_authority_receipt_sha256) {
            throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
          }
          phase = "retained_recovery_decryption";
          rawBody = input.crypto.open({
            envelope: {
              keyVersion: evidence.key_version,
              ivBase64Url: evidence.iv_base64url,
              authTagBase64Url: evidence.auth_tag_base64url,
              ciphertextBase64Url: evidence.ciphertext_base64url,
              aadSha256: evidence.aad_sha256,
              ciphertextSha256: evidence.ciphertext_sha256,
              receiptSha256: evidence.recovery_evidence_receipt_sha256,
            },
            providerResponseSha256: evidence.provider_response_sha256,
            context: evidenceContext(
              row,
              evidence.recovery_request_sha256,
              recoveryAuthorityReceiptSha256,
            ),
          });
          phase = "retained_recovery_projection";
          const artifact = await input.buildArtifact({
            customerId: row.customer_id,
            orderId: row.order_id,
            attemptId: row.provider_attempt_id,
            executionScopeSha256: row.execution_scope_sha256,
            rawBody,
            providerResponseSha256: evidence.provider_response_sha256,
            responseObservedAt: millisecondRecoveryObservation(evidence.created_at),
          });
          phase = "retained_recovery_finalization";
          return await finalize(row, evidence.recovery_evidence_receipt_sha256, artifact);
        }

        if (
          row.ledger_state !== "processing"
          || row.ledger_revision !== 1
          || identity.leaseTokenSha256 === null
          || row.recovery_evidence_receipt_sha256 !== null
        ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
        phase = "provider_order_retrieval";
        const retrieved = await input.transport.retrieve({
          providerOrderId: identity.providerOrderId,
          providerOrderRefSha256: identity.providerOrderRefSha256,
        });
        const responseObservedAt = input.now().toISOString();
        rawBody = retrieved.rawBody;
        const requestAuthorityReceiptSha256 = input.authorityReceipt(
          "duffel-order-recovery-request",
          requestAuthorityPayload(
            row,
            retrieved.recoveryRequestSha256,
          ) as unknown as FlightCanonicalJsonValue,
        );
        const recoveryAuthorityReceiptSha256 = input.authorityReceipt(
          "duffel-order-recovery-response",
          responseAuthorityPayload(
            row,
            retrieved.recoveryRequestSha256,
            requestAuthorityReceiptSha256,
            retrieved.responseSha256,
          ) as unknown as FlightCanonicalJsonValue,
        );
        phase = "provider_order_projection";
        const artifact = await input.buildArtifact({
          customerId: row.customer_id,
          orderId: row.order_id,
          attemptId: row.provider_attempt_id,
          executionScopeSha256: row.execution_scope_sha256,
          rawBody,
          providerResponseSha256: retrieved.responseSha256,
          responseObservedAt,
        });
        phase = "recovery_evidence_encryption";
        const encrypted = input.crypto.seal({
          rawBody,
          providerResponseSha256: retrieved.responseSha256,
          context: evidenceContext(
            row,
            retrieved.recoveryRequestSha256,
            recoveryAuthorityReceiptSha256,
          ),
        });
        const retentionExpiresAt = new Date(
          input.now().getTime() + 7 * 24 * 60 * 60_000,
        ).toISOString();
        const outcomeSha256 = sha256FlightEvidence({
          version: "flight-consumer-preview-duffel-order-recovery-outcome-v1",
          customerId: row.customer_id,
          orderId: row.order_id,
          attemptId: row.provider_attempt_id,
          ledgerId: row.ledger_id,
          providerOrderRefSha256: row.provider_order_ref_sha256,
          providerResponseSha256: retrieved.responseSha256,
          recoveryEvidenceReceiptSha256: encrypted.receiptSha256,
          outcome: "processed",
        });
        phase = "recovery_evidence_completion";
        const completed = one(completedEvidenceSchema, await input.port.completeEvidence({
          p_customer_id: row.customer_id,
          p_order_id: row.order_id,
          p_ledger_id: row.ledger_id,
          p_attempt_id: row.provider_attempt_id,
          p_expected_revision: 1,
          p_lease_token_sha256: identity.leaseTokenSha256,
          p_outcome_sha256: outcomeSha256,
          p_recovery_request_sha256: retrieved.recoveryRequestSha256,
          p_recovery_authority_receipt_sha256: recoveryAuthorityReceiptSha256,
          p_provider_order_ref_sha256: row.provider_order_ref_sha256,
          p_provider_response_sha256: retrieved.responseSha256,
          p_key_version: encrypted.keyVersion,
          p_iv_base64url: encrypted.ivBase64Url,
          p_auth_tag_base64url: encrypted.authTagBase64Url,
          p_ciphertext_base64url: encrypted.ciphertextBase64Url,
          p_aad_sha256: encrypted.aadSha256,
          p_ciphertext_sha256: encrypted.ciphertextSha256,
          p_recovery_evidence_receipt_sha256: encrypted.receiptSha256,
          p_retention_expires_at: retentionExpiresAt,
        }));
        if (
          completed.ledger_id !== row.ledger_id
          || completed.recovery_evidence_receipt_sha256 !== encrypted.receiptSha256
        ) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
        phase = "recovery_finalization";
        return await finalize(row, encrypted.receiptSha256, artifact);
      } catch (error) {
        console.error("[flight-consumer-preview] Async Duffel convergence failed", {
          diagnostic: "async_duffel_convergence_failed",
          phase,
          category: error instanceof FlightConsumerPreviewAsyncDuffelConvergenceError
            ? "workflow_contract"
            : error instanceof z.ZodError
              ? "schema_contract"
              : error instanceof Error
                ? error.name
                : "unknown",
        });
        if (error instanceof FlightConsumerPreviewAsyncDuffelConvergenceError) throw error;
        throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
      } finally {
        rawBody?.fill(0);
      }
    },
  });
}

class SupabaseAsyncDuffelConvergencePort
implements FlightConsumerPreviewAsyncDuffelConvergencePort {
  async readContext(parameters: Readonly<{
    p_customer_id: string;
    p_order_id: string;
    p_ledger_id: string;
    p_expected_lease_token_sha256: string | null;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "get_flight_consumer_async_duffel_convergence_lease_bound_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
    return data;
  }

  async loadEvidence(parameters: Readonly<{
    p_customer_id: string;
    p_order_id: string;
    p_ledger_id: string;
    p_recovery_evidence_receipt_sha256: string;
  }>) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc(
      "load_flight_consumer_duffel_order_recovery_evidence_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
    const rows = z.array(z.record(z.unknown())).length(1).safeParse(data);
    if (!rows.success) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
    const observation = await admin.rpc(
      "get_flight_consumer_duffel_recovery_evidence_observation_v1",
      parameters,
    );
    if (observation.error) {
      throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
    }
    const createdAt = one(
      z.object({ created_at: instantSchema }).strict(),
      observation.data,
    ).created_at;
    return [{ ...rows.data[0], created_at: createdAt }];
  }

  async completeEvidence(parameters: Readonly<Record<string, unknown>>) {
    const { data, error } = await createAdminClient().rpc(
      "complete_flight_consumer_duffel_recovery_evidence_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
    return data;
  }

  async markAmbiguous(parameters: Readonly<{
    p_attempt_id: string;
    p_expected_terminal_revision: 2;
    p_expected_state_sha256: string;
    p_observed_state_sha256: string;
  }>) {
    const { error } = await createAdminClient().rpc(
      "mark_flight_consumer_order_ambiguous_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
  }

  async finalize(parameters: Readonly<Record<string, unknown>>) {
    const { data, error } = await createAdminClient().rpc(
      "finalize_flight_consumer_async_duffel_order_v1",
      parameters,
    );
    if (error) {
      console.error("[flight-consumer-preview] Async Duffel finalization RPC rejected", {
        diagnostic: "async_duffel_finalization_rpc_rejected",
        postgresCode: /^[A-Z0-9]{5}$/.test(error.code ?? "") ? error.code : "unknown",
        databaseMessage: typeof error.message === "string"
          ? error.message.slice(0, 240)
          : "unknown",
      });
      throw new FlightConsumerPreviewAsyncDuffelConvergenceError();
    }
    return data;
  }
}

export function createFlightConsumerPreviewAsyncDuffelConvergence(
  runtime: FlightConsumerPreviewRuntime,
) {
  const authority = createFlightConsumerPreviewAuthority(runtime.binding);
  const keyring = readFlightConsumerPreviewOfferEvidenceKeyring();
  return createInjectedFlightConsumerPreviewAsyncDuffelConvergence({
    executionScopeSha256: runtime.binding.executionScopeSha256,
    port: Object.freeze(new SupabaseAsyncDuffelConvergencePort()),
    transport: createFlightConsumerPreviewDuffelOrderRecoveryTransport(),
    crypto: Object.freeze({
      seal: (input) => encryptFlightConsumerOrderRecoveryEvidence({
        ...input,
        context: input.context,
        keyring,
      }),
      open: (input) => decryptFlightConsumerOrderRecoveryEvidence({
        ...input,
        context: input.context,
        keyring,
      }),
    }),
    authorityReceipt: (operation, evidence) => authority.operationReceipt(operation, evidence),
    buildArtifact: async (artifactInput) => {
      const state = await loadFlightConsumerPreviewOrderFinalizationState({
        customerId: artifactInput.customerId,
        orderId: artifactInput.orderId,
        executionScopeSha256: artifactInput.executionScopeSha256,
      });
      return buildFlightConsumerPreviewTerminalResponseFinalizationArtifact({
        customerId: artifactInput.customerId,
        ...state,
        runtime,
        attemptId: artifactInput.attemptId,
        rawBody: artifactInput.rawBody,
        providerResponseSha256: artifactInput.providerResponseSha256,
        responseObservation: {
          kind: "async_recovery",
          observedAt: artifactInput.responseObservedAt,
        },
      });
    },
    now: () => new Date(),
  });
}
