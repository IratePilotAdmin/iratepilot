import "server-only";

import { z } from "zod";

import {
  reconcileFlightConsumerPreviewOrder,
  type FlightConsumerPreviewReconciliationResult,
} from "./reconciliation-workflow.server";

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const instantSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const nonnegativeIntegerSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/),
]).transform(Number).refine(Number.isSafeInteger);

export const flightConsumerPreviewReconciliationStatusSchema = z.enum([
  "open",
  "investigating",
  "blocked",
  "resolved",
]);
export const flightConsumerPreviewResolutionCodeSchema = z.enum([
  "local_state_corrected",
  "provider_state_confirmed",
  "payment_reversed",
  "ticket_reissued",
  "duplicate_suppressed",
  "manual_followup_required",
]);

const nullableStatusSchema = z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/).nullable();
const listRowSchema = z.object({
  case_id: uuidSchema,
  order_id: uuidSchema,
  customer_id: uuidSchema,
  confirmation_code: z.string().min(1).max(64),
  case_type: z.enum([
    "ambiguous_order",
    "payment_order_mismatch",
    "ticket_mismatch",
    "provider_event_gap",
    "refund_mismatch",
    "servicing_mismatch",
  ]),
  subject_type: z.enum([
    "flight_order",
    "flight_payment",
    "flight_ticket_document",
    "flight_service_request",
    "flight_provider_event",
  ]),
  source_status: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/),
  target_status: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/),
  case_status: flightConsumerPreviewReconciliationStatusSchema,
  resolution_code: flightConsumerPreviewResolutionCodeSchema.nullable(),
  created_at: instantSchema,
  updated_at: instantSchema,
  resolved_at: instantSchema.nullable(),
  order_status: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/),
  payment_status: nullableStatusSchema,
  provider_attempt_state: nullableStatusSchema,
  refund_attempt_state: nullableStatusSchema,
  total_cents: nonnegativeIntegerSchema,
  currency: z.literal("USD"),
  ticket_count: nonnegativeIntegerSchema,
  execution_scope_sha256: sha256Schema,
}).strict();

const detailRowSchema = listRowSchema.extend({
  source_revision_at: instantSchema,
  expected_state_sha256: sha256Schema,
  observed_state_sha256: sha256Schema,
  target_state_sha256: sha256Schema,
  resolution_evidence_sha256: sha256Schema.nullable(),
  resolved_by: uuidSchema.nullable(),
  payment_id: uuidSchema.nullable(),
  provider_attempt_id: uuidSchema.nullable(),
  refund_attempt_id: uuidSchema.nullable(),
  provider_attempt_revision: z.number().int().min(0).max(2).nullable(),
  refund_attempt_revision: z.number().int().min(0).max(2).nullable(),
  authorized_cents: nonnegativeIntegerSchema.nullable(),
  captured_cents: nonnegativeIntegerSchema.nullable(),
  refunded_cents: nonnegativeIntegerSchema.nullable(),
}).strict();

const resolutionResultRowSchema = z.object({
  decision: z.enum(["resolved", "replay"]),
  case_id: uuidSchema,
  case_status: z.literal("resolved"),
  resolution_code: flightConsumerPreviewResolutionCodeSchema,
  resolution_evidence_sha256: sha256Schema,
  resolved_by: uuidSchema,
  resolved_at: instantSchema,
  updated_at: instantSchema,
}).strict();

type ListRow = z.infer<typeof listRowSchema>;
type DetailRow = z.infer<typeof detailRowSchema>;

export type FlightConsumerPreviewAdminReconciliationCase = Readonly<{
  caseId: string;
  orderId: string;
  customerId: string;
  confirmationCode: string;
  caseType: ListRow["case_type"];
  subjectType: ListRow["subject_type"];
  sourceStatus: string;
  targetStatus: string;
  status: z.infer<typeof flightConsumerPreviewReconciliationStatusSchema>;
  resolutionCode: z.infer<typeof flightConsumerPreviewResolutionCodeSchema> | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  orderStatus: string;
  paymentStatus: string | null;
  providerAttemptState: string | null;
  refundAttemptState: string | null;
  totalCents: number;
  currency: "USD";
  ticketCount: number;
  executionScopeSha256: string;
}>;

export type FlightConsumerPreviewAdminReconciliationDetail =
  FlightConsumerPreviewAdminReconciliationCase & Readonly<{
    sourceRevisionAt: string;
    expectedStateSha256: string;
    observedStateSha256: string;
    targetStateSha256: string;
    resolutionEvidenceSha256: string | null;
    resolvedBy: string | null;
    paymentId: string | null;
    providerAttemptId: string | null;
    refundAttemptId: string | null;
    providerAttemptRevision: number | null;
    refundAttemptRevision: number | null;
    authorizedCents: number | null;
    capturedCents: number | null;
    refundedCents: number | null;
  }>;

export interface FlightConsumerPreviewAdminRpcClient {
  rpc(
    name: string,
    parameters?: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export class FlightConsumerPreviewAdminReconciliationError extends Error {
  readonly kind: "conflict" | "unavailable";

  constructor(kind: "conflict" | "unavailable" = "unavailable") {
    super("Flight Consumer Preview reconciliation administration is unavailable.");
    this.name = "FlightConsumerPreviewAdminReconciliationError";
    this.kind = kind;
  }
}

function listCase(row: ListRow): FlightConsumerPreviewAdminReconciliationCase {
  return Object.freeze({
    caseId: row.case_id,
    orderId: row.order_id,
    customerId: row.customer_id,
    confirmationCode: row.confirmation_code,
    caseType: row.case_type,
    subjectType: row.subject_type,
    sourceStatus: row.source_status,
    targetStatus: row.target_status,
    status: row.case_status,
    resolutionCode: row.resolution_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    providerAttemptState: row.provider_attempt_state,
    refundAttemptState: row.refund_attempt_state,
    totalCents: row.total_cents,
    currency: row.currency,
    ticketCount: row.ticket_count,
    executionScopeSha256: row.execution_scope_sha256,
  });
}

function detailCase(row: DetailRow): FlightConsumerPreviewAdminReconciliationDetail {
  return Object.freeze({
    ...listCase(row),
    sourceRevisionAt: row.source_revision_at,
    expectedStateSha256: row.expected_state_sha256,
    observedStateSha256: row.observed_state_sha256,
    targetStateSha256: row.target_state_sha256,
    resolutionEvidenceSha256: row.resolution_evidence_sha256,
    resolvedBy: row.resolved_by,
    paymentId: row.payment_id,
    providerAttemptId: row.provider_attempt_id,
    refundAttemptId: row.refund_attempt_id,
    providerAttemptRevision: row.provider_attempt_revision,
    refundAttemptRevision: row.refund_attempt_revision,
    authorizedCents: row.authorized_cents,
    capturedCents: row.captured_cents,
    refundedCents: row.refunded_cents,
  });
}

async function callRpc(
  client: FlightConsumerPreviewAdminRpcClient,
  name: string,
  parameters: Readonly<Record<string, unknown>>,
) {
  try {
    const result = await client.rpc(name, parameters);
    if (result.error) throw new Error();
    return result.data;
  } catch {
    throw new FlightConsumerPreviewAdminReconciliationError();
  }
}

export async function listFlightConsumerPreviewAdminReconciliationCases(
  client: FlightConsumerPreviewAdminRpcClient,
  input: Readonly<{ limit?: number; status?: string | null }> = {},
) {
  const parsed = z.object({
    limit: z.number().int().min(1).max(100).default(50),
    status: flightConsumerPreviewReconciliationStatusSchema.nullable().default(null),
  }).strict().parse(input);
  const raw = await callRpc(client, "list_flight_consumer_admin_reconciliation_v1", {
    p_limit: parsed.limit,
    p_status: parsed.status,
  });
  const rows = z.array(listRowSchema).max(parsed.limit).safeParse(raw);
  if (!rows.success) throw new FlightConsumerPreviewAdminReconciliationError();
  return Object.freeze(rows.data.map(listCase));
}

export async function getFlightConsumerPreviewAdminReconciliationCase(
  client: FlightConsumerPreviewAdminRpcClient,
  caseId: string,
) {
  const id = uuidSchema.safeParse(caseId);
  if (!id.success) throw new FlightConsumerPreviewAdminReconciliationError();
  const raw = await callRpc(client, "get_flight_consumer_admin_reconciliation_v1", {
    p_case_id: id.data,
  });
  const rows = z.array(detailRowSchema).max(1).safeParse(raw);
  if (!rows.success) throw new FlightConsumerPreviewAdminReconciliationError();
  if (rows.data.length === 0) return null;
  if (rows.data[0]!.case_id !== id.data) throw new FlightConsumerPreviewAdminReconciliationError();
  return detailCase(rows.data[0]!);
}

export async function resolveFlightConsumerPreviewAdminReconciliationCase(
  client: FlightConsumerPreviewAdminRpcClient,
  input: Readonly<{
    caseId: string;
    expectedUpdatedAt: string;
    resolutionCode: string;
    resolutionEvidenceSha256: string;
  }>,
) {
  const parsed = z.object({
    caseId: uuidSchema,
    expectedUpdatedAt: instantSchema,
    resolutionCode: flightConsumerPreviewResolutionCodeSchema,
    resolutionEvidenceSha256: sha256Schema,
  }).strict().safeParse(input);
  if (!parsed.success) throw new FlightConsumerPreviewAdminReconciliationError("conflict");
  const raw = await callRpc(client, "resolve_flight_consumer_admin_reconciliation_v1", {
    p_case_id: parsed.data.caseId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_resolution_code: parsed.data.resolutionCode,
    p_resolution_evidence_sha256: parsed.data.resolutionEvidenceSha256,
  });
  const rows = z.array(resolutionResultRowSchema).length(1).safeParse(raw);
  if (!rows.success) throw new FlightConsumerPreviewAdminReconciliationError();
  const result = rows.data[0]!;
  if (
    result.case_id !== parsed.data.caseId
    || result.resolution_code !== parsed.data.resolutionCode
    || result.resolution_evidence_sha256 !== parsed.data.resolutionEvidenceSha256
  ) throw new FlightConsumerPreviewAdminReconciliationError();
  return Object.freeze({
    decision: result.decision,
    caseId: result.case_id,
    status: result.case_status,
    resolutionCode: result.resolution_code,
    resolutionEvidenceSha256: result.resolution_evidence_sha256,
    resolvedBy: result.resolved_by,
    resolvedAt: result.resolved_at,
    updatedAt: result.updated_at,
  });
}

export async function compensateFlightConsumerPreviewAdminReconciliationCase(
  client: FlightConsumerPreviewAdminRpcClient,
  caseId: string,
  reconcile: (input: Readonly<{
    customerId: string;
    orderId: string;
    idempotencyKey: string;
  }>) => Promise<FlightConsumerPreviewReconciliationResult> = reconcileFlightConsumerPreviewOrder,
  onCommitted?: (input: Readonly<{
    customerId: string;
    orderId: string;
    result: FlightConsumerPreviewReconciliationResult;
  }>) => void,
) {
  const detail = await getFlightConsumerPreviewAdminReconciliationCase(client, caseId);
  if (
    detail === null
    || detail.caseType !== "ambiguous_order"
    || detail.subjectType !== "flight_order"
    || detail.status !== "resolved"
    || detail.resolutionCode !== "duplicate_suppressed"
    || detail.resolutionEvidenceSha256 === null
    || detail.resolvedBy === null
    || detail.resolvedAt === null
  ) throw new FlightConsumerPreviewAdminReconciliationError("conflict");
  let result: FlightConsumerPreviewReconciliationResult;
  try {
    result = await reconcile({
      customerId: detail.customerId,
      orderId: detail.orderId,
      idempotencyKey: `flight-consumer-preview-admin-compensate:${detail.caseId}`,
    });
  } catch {
    throw new FlightConsumerPreviewAdminReconciliationError();
  }
  try {
    onCommitted?.({
      customerId: detail.customerId,
      orderId: detail.orderId,
      result,
    });
  } catch {
    // A post-commit notification scheduler cannot change compensation state.
  }
  return result;
}
