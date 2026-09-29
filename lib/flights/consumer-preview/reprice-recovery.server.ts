import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

export const FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION =
  "CLOSE_ONE_TERMINAL_CONSUMER_PREVIEW_REPRICE_WITHOUT_REDISPATCH" as const;

const previewSupabaseUrl = "https://eiqmdldjnedqgbtoozqa.supabase.co" as const;
const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

const inputSchema = z.object({
  actorId: uuidSchema,
  confirmation: z.literal(FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION),
  idempotencyKey: uuidSchema,
}).strict();

const attemptSchema = z.object({
  id: uuidSchema,
  offer_id: uuidSchema,
  execution_scope_sha256: sha256Schema,
  consumer_idempotency_key_sha256: sha256Schema,
  state: z.literal("succeeded"),
  revision: z.literal(2),
  retry_authorized: z.literal(false),
}).strict();

const idempotencySchema = z.object({
  id: uuidSchema,
  status: z.literal("in_progress"),
}).strict();

const candidateSchema = z.object({
  attempt: attemptSchema,
  idempotency: idempotencySchema,
}).strict();

const closureSchema = z.object({
  offer_id: uuidSchema,
  terminal_state: z.literal("succeeded"),
  idempotency_status: z.literal("failed"),
}).passthrough();

const attestationSchema = z.object({
  attemptState: z.literal("succeeded"),
  attemptRevision: z.literal(2),
  retryAuthorized: z.literal(false),
  idempotencyStatus: z.literal("failed"),
  offerStatus: z.literal("expired"),
  repriceReceiptCount: z.literal(0),
  refreshedEvidenceCount: z.literal(0),
  orderCount: z.literal(0),
}).strict();

type Candidate = z.infer<typeof candidateSchema>;

export type FlightConsumerPreviewRepriceRecoveryDependencies = Readonly<{
  env: Readonly<Record<string, string | undefined>>;
  requireRuntime: () => Promise<unknown>;
  findCandidates: () => Promise<unknown>;
  closeCandidate: (candidate: Candidate) => Promise<unknown>;
  attestCandidate: (candidate: Candidate) => Promise<unknown>;
}>;

export type FlightConsumerPreviewRepriceRecoveryResult = Readonly<{
  decision: "closed";
  terminalState: "succeeded";
  idempotencyStatus: "failed";
  offerStatus: "expired";
}>;

export class FlightConsumerPreviewRepriceRecoveryError extends Error {
  readonly kind: "conflict" | "unavailable";

  constructor(kind: "conflict" | "unavailable" = "unavailable") {
    super("Flight Consumer Preview terminal reprice recovery is unavailable.");
    this.name = "FlightConsumerPreviewRepriceRecoveryError";
    this.kind = kind;
  }
}

async function defaultFindCandidates() {
  const admin = createAdminClient();
  const attempts = await admin
    .from("flight_provider_request_attempts")
    .select([
      "id",
      "offer_id",
      "execution_scope_sha256",
      "consumer_idempotency_key_sha256",
      "state",
      "revision",
      "retry_authorized",
    ].join(","))
    .eq("consumer_flow_version", 1)
    .eq("operation", "retrieve_offer")
    .eq("state", "succeeded")
    .eq("revision", 2)
    .eq("retry_authorized", false)
    .limit(20);
  if (attempts.error) throw new FlightConsumerPreviewRepriceRecoveryError("conflict");

  const parsedAttempts = z.array(attemptSchema).safeParse(attempts.data);
  if (!parsedAttempts.success) throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
  const candidates: Candidate[] = [];
  for (const attempt of parsedAttempts.data) {
    const receipts = await admin
      .from("flight_reprice_receipts")
      .select("id", { count: "exact", head: true })
      .eq("offer_id", attempt.offer_id);
    if (receipts.error) throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
    if (receipts.count !== 0) continue;

    const idempotency = await admin
      .from("flight_idempotency_records")
      .select("id,status")
      .eq("execution_scope_sha256", attempt.execution_scope_sha256)
      .eq("execution_mode", "test")
      .eq("scope", "reprice")
      .eq("key_sha256", attempt.consumer_idempotency_key_sha256)
      .eq("status", "in_progress");
    if (idempotency.error) throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
    const parsedIdempotency = z.array(idempotencySchema).safeParse(idempotency.data);
    if (!parsedIdempotency.success) {
      throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
    }
    if (parsedIdempotency.data.length === 1) {
      candidates.push({ attempt, idempotency: parsedIdempotency.data[0]! });
    }
  }
  return candidates;
}

async function defaultCloseCandidate(candidate: Candidate) {
  const result = await createAdminClient().rpc("fail_flight_consumer_reprice_v1", {
    p_attempt_id: candidate.attempt.id,
    p_expected_terminal_revision: 2,
  });
  if (result.error) throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
  return result.data;
}

async function exactCount(
  table: "flight_reprice_receipts" | "flight_offer_evidence_vault" | "flight_orders",
  column: "offer_id",
  value: string,
  stage?: "refreshed",
) {
  let query = createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (stage !== undefined) query = query.eq("stage", stage);
  const result = await query;
  if (result.error || result.count === null) {
    throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
  }
  return result.count;
}

async function defaultAttestCandidate(candidate: Candidate) {
  const admin = createAdminClient();
  const [attempt, idempotency, offer, repriceReceiptCount, refreshedEvidenceCount, orderCount] =
    await Promise.all([
      admin
        .from("flight_provider_request_attempts")
        .select("state,revision,retry_authorized")
        .eq("id", candidate.attempt.id)
        .single(),
      admin
        .from("flight_idempotency_records")
        .select("status")
        .eq("id", candidate.idempotency.id)
        .single(),
      admin
        .from("flight_offers")
        .select("status")
        .eq("id", candidate.attempt.offer_id)
        .single(),
      exactCount("flight_reprice_receipts", "offer_id", candidate.attempt.offer_id),
      exactCount(
        "flight_offer_evidence_vault",
        "offer_id",
        candidate.attempt.offer_id,
        "refreshed",
      ),
      exactCount("flight_orders", "offer_id", candidate.attempt.offer_id),
    ]);
  if (attempt.error || idempotency.error || offer.error) {
    throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
  }
  return {
    attemptState: attempt.data.state,
    attemptRevision: attempt.data.revision,
    retryAuthorized: attempt.data.retry_authorized,
    idempotencyStatus: idempotency.data.status,
    offerStatus: offer.data.status,
    repriceReceiptCount,
    refreshedEvidenceCount,
    orderCount,
  };
}

const defaultDependencies: FlightConsumerPreviewRepriceRecoveryDependencies = Object.freeze({
  env: process.env,
  requireRuntime: () => requireFlightConsumerPreviewRequestRuntime(),
  findCandidates: defaultFindCandidates,
  closeCandidate: defaultCloseCandidate,
  attestCandidate: defaultAttestCandidate,
});

export async function closeOneTerminalFlightConsumerPreviewReprice(
  input: Readonly<{ actorId: string; confirmation: string; idempotencyKey: string }>,
  dependencies: FlightConsumerPreviewRepriceRecoveryDependencies = defaultDependencies,
): Promise<FlightConsumerPreviewRepriceRecoveryResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
  if (
    dependencies.env.VERCEL_ENV !== "preview"
    || dependencies.env.NEXT_PUBLIC_SUPABASE_URL !== previewSupabaseUrl
    || typeof dependencies.env.SUPABASE_SERVICE_ROLE_KEY !== "string"
    || dependencies.env.SUPABASE_SERVICE_ROLE_KEY.length < 16
    || dependencies.env.FLIGHT_CONSUMER_PREVIEW_ENABLED !== "true"
  ) throw new FlightConsumerPreviewRepriceRecoveryError("unavailable");

  try {
    await dependencies.requireRuntime();
    const candidates = z.array(candidateSchema).parse(await dependencies.findCandidates());
    if (candidates.length !== 1) {
      throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
    }
    const candidate = candidates[0]!;
    const closure = z.array(closureSchema).length(1).parse(
      await dependencies.closeCandidate(candidate),
    )[0]!;
    if (closure.offer_id !== candidate.attempt.offer_id) {
      throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
    }
    const attestation = attestationSchema.parse(
      await dependencies.attestCandidate(candidate),
    );
    return Object.freeze({
      decision: "closed" as const,
      terminalState: attestation.attemptState,
      idempotencyStatus: attestation.idempotencyStatus,
      offerStatus: attestation.offerStatus,
    });
  } catch (error) {
    if (error instanceof FlightConsumerPreviewRepriceRecoveryError) throw error;
    throw new FlightConsumerPreviewRepriceRecoveryError("conflict");
  }
}
