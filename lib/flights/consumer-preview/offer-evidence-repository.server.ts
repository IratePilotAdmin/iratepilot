import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  projectDuffelSandboxTerminalRecoveryOfferEvidence,
  type DuffelAuthenticatedOfferEvidenceLoader,
  DuffelAuthenticatedOfferEvidenceLoadResult,
  type DuffelAuthenticatedOfferEvidenceRepository,
  type DuffelAuthenticatedOfferEvidenceRepositoryPolicy,
  type DuffelAuthenticatedOfferEvidenceStoreResult,
  type DuffelDurableOfferEvidenceRecord,
  type DuffelOfferEvidenceScope,
  type DuffelTerminalRecoveryOfferEvidence,
} from "../duffel-sandbox-contract";
import {
  canonicalFlightJson,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import { createAdminClient } from "../../supabase/admin";
import {
  decryptFlightConsumerOfferEvidence,
  encryptFlightConsumerOfferEvidence,
  readFlightConsumerPreviewOfferEvidenceKeyring,
  type FlightConsumerOfferEvidenceKeyring,
} from "./evidence-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";
import { flightConsumerPreviewSearchRequestSchema } from "./schemas";

export const FLIGHT_CONSUMER_PREVIEW_TENANT_ID = "tenant_iratepilot_preview_0001" as const;
export const FLIGHT_CONSUMER_OFFER_EVIDENCE_RETENTION_SECONDS = 3_600 as const;

const maximumRawBodyBytes = 1_048_576;
const maximumRawBodyBase64Length = Math.ceil(maximumRawBodyBytes / 3) * 4;
const maximumCiphertextBase64UrlLength = 2_100_000;
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const stableTokenSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
const keyVersionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
const canonicalBase64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

const exactInstantSchema = z.string().refine((value) => {
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).toISOString() === value;
}, "Use a normalized ISO-8601 instant.");

const databaseInstantSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Use a parseable database instant.",
);

const evidenceScopeSchema = z.object({
  tenantId: z.literal(FLIGHT_CONSUMER_PREVIEW_TENANT_ID),
  commerceId: uuidSchema,
  actorId: uuidSchema,
}).strict();

const durableRecordSchema = z.object({
  version: z.literal("duffel-durable-offer-evidence-record-v1"),
  stage: z.enum(["initial", "refreshed"]),
  scope: evidenceScopeSchema,
  localOfferId: stableTokenSchema,
  search: flightConsumerPreviewSearchRequestSchema,
  observedAt: exactInstantSchema,
  retentionExpiresAt: exactInstantSchema,
  predecessorReceiptDigest: sha256Schema.nullable(),
  rawBodyBase64: z.string().min(4).max(maximumRawBodyBase64Length),
  rawBodyDigest: sha256Schema,
  evidenceDigest: sha256Schema,
  snapshotDigest: sha256Schema,
  recordDigest: sha256Schema,
}).strict().superRefine((value, context) => {
  if (value.stage === "initial" && value.predecessorReceiptDigest !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["predecessorReceiptDigest"], message: "Initial evidence cannot have a predecessor." });
  }
  if (value.stage === "refreshed" && value.predecessorReceiptDigest === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["predecessorReceiptDigest"], message: "Refreshed evidence requires a predecessor." });
  }
});

const repositoryBindingSchema = z.object({
  customerId: uuidSchema,
  searchId: uuidSchema,
  offerId: uuidSchema,
  localOfferId: stableTokenSchema,
  executionScopeSha256: sha256Schema,
  evidenceKeyVersion: keyVersionSchema,
}).strict();

export type FlightConsumerOfferEvidenceRepositoryBinding = z.infer<typeof repositoryBindingSchema>;

export type FlightOfferEvidenceStoreRpcParameters = Readonly<{
  p_customer_id: string;
  p_search_id: string;
  p_offer_id: string;
  p_execution_scope_sha256: string;
  p_stage: "initial" | "refreshed";
  p_predecessor_receipt_sha256: string | null;
  p_observed_at: string;
  p_retention_expires_at: string;
  p_raw_body_sha256: string;
  p_evidence_sha256: string;
  p_snapshot_sha256: string;
  p_record_sha256: string;
  p_receipt_sha256: string;
  p_key_version: string;
  p_iv_base64url: string;
  p_auth_tag_base64url: string;
  p_ciphertext_base64url: string;
  p_aad_sha256: string;
  p_record_hmac_sha256: string;
}>;

export type FlightOfferEvidenceLoadRpcParameters = Readonly<{
  p_receipt_sha256: string;
  p_customer_id: string;
  p_execution_scope_sha256: string;
}>;

export type FlightOfferEvidenceTerminalRecoveryLoadRpcParameters = Readonly<{
  p_attempt_id: string;
  p_order_id: string;
  p_receipt_sha256: string;
  p_customer_id: string;
  p_execution_scope_sha256: string;
}>;

export type FlightOfferEvidenceTerminalRecoveryLocalIdentityRpcParameters = Readonly<{
  p_attempt_id: string;
  p_order_id: string;
  p_customer_id: string;
  p_execution_scope_sha256: string;
  p_receipt_sha256: string;
}>;

export interface FlightConsumerOfferEvidenceVault {
  store(parameters: FlightOfferEvidenceStoreRpcParameters): Promise<unknown>;
  load(parameters: FlightOfferEvidenceLoadRpcParameters): Promise<unknown>;
}

export type FlightConsumerOfferEvidenceRepositoryDependencies = Readonly<{
  vault: FlightConsumerOfferEvidenceVault;
  keyring: FlightConsumerOfferEvidenceKeyring;
  readTrustedTime: () => string;
}>;

export type FlightConsumerTerminalRecoveryOfferEvidenceRepositoryDependencies = Readonly<{
  vault: Pick<FlightConsumerOfferEvidenceVault, "load">;
  keyring: FlightConsumerOfferEvidenceKeyring;
  attemptDispatchedAt: string;
  readCurrentTime: () => string;
}>;

export type FlightConsumerTerminalRecoveryOfferEvidenceProjectionResult =
  | Readonly<{
    decision: "verified";
    receiptDigest: string;
    record: DuffelDurableOfferEvidenceRecord;
    offer: DuffelTerminalRecoveryOfferEvidence;
  }>
  | Readonly<{ decision: "not_found" | "invalid" }>;

export type FlightConsumerTerminalRecoveryOfferEvidenceLoadResult =
  DuffelAuthenticatedOfferEvidenceLoadResult;

/**
 * Recovery-only evidence port. Its method names and result shape are
 * intentionally distinct from the full authenticated repository, and it has
 * no policy, persistence, refresh, or create-order authority surface.
 */
export interface FlightConsumerTerminalRecoveryOfferEvidenceReader {
  verifyAndLoadTerminalOfferEvidence(
    receiptDigest: string,
    expectedScope: DuffelOfferEvidenceScope,
  ): Promise<FlightConsumerTerminalRecoveryOfferEvidenceLoadResult>;
  projectTerminalOfferEvidence(
    receiptDigest: string,
    expectedScope: DuffelOfferEvidenceScope,
  ): Promise<FlightConsumerTerminalRecoveryOfferEvidenceProjectionResult>;
}

const storeResultSchema = z.array(z.object({
  decision: z.enum(["created", "replay"]),
  evidence_id: uuidSchema,
  receipt_sha256: sha256Schema,
}).strict()).length(1);

const loadResultSchema = z.array(z.object({
  evidence_id: uuidSchema,
  customer_id: uuidSchema,
  search_id: uuidSchema,
  offer_id: uuidSchema,
  stage: z.enum(["initial", "refreshed"]),
  predecessor_receipt_sha256: sha256Schema.nullable(),
  observed_at: databaseInstantSchema,
  retention_expires_at: databaseInstantSchema,
  raw_body_sha256: sha256Schema,
  evidence_sha256: sha256Schema,
  snapshot_sha256: sha256Schema,
  record_sha256: sha256Schema,
  receipt_sha256: sha256Schema,
  key_version: keyVersionSchema,
  iv_base64url: canonicalBase64UrlSchema.length(16),
  auth_tag_base64url: canonicalBase64UrlSchema.length(22),
  ciphertext_base64url: canonicalBase64UrlSchema.min(16).max(maximumCiphertextBase64UrlLength),
  aad_sha256: sha256Schema,
  record_hmac_sha256: sha256Schema,
}).strict()).max(1);

const terminalRecoveryLocalIdentityResultSchema = z.array(z.object({
  local_offer_id: stableTokenSchema,
}).strict()).length(1);

export class FlightConsumerOfferEvidenceRepositoryError extends Error {
  constructor() {
    super("Flight Consumer Preview offer evidence is unavailable.");
    this.name = "FlightConsumerOfferEvidenceRepositoryError";
  }
}

class SupabaseFlightConsumerOfferEvidenceVault implements FlightConsumerOfferEvidenceVault {
  async store(parameters: FlightOfferEvidenceStoreRpcParameters) {
    const { data, error } = await createAdminClient().rpc("store_flight_offer_evidence_v1", parameters);
    if (error) throw new FlightConsumerOfferEvidenceRepositoryError();
    return data;
  }

  async load(parameters: FlightOfferEvidenceLoadRpcParameters) {
    const { data, error } = await createAdminClient().rpc("load_flight_offer_evidence_v1", parameters);
    if (error) throw new FlightConsumerOfferEvidenceRepositoryError();
    return data;
  }
}

/**
 * Read-only adapter for projecting an already-created Duffel TEST order. The
 * database function independently proves the successful provider attempt,
 * captured payment, retained response evidence, and exact offer-evidence
 * chain before returning ciphertext. It cannot store evidence or authorize a
 * provider request.
 */
class SupabaseFlightConsumerTerminalRecoveryOfferEvidenceVault
implements FlightConsumerOfferEvidenceVault {
  readonly #attemptId: string;
  readonly #orderId: string;

  constructor(input: Readonly<{ attemptId: string; orderId: string }>) {
    this.#attemptId = input.attemptId;
    this.#orderId = input.orderId;
  }

  async store(): Promise<never> {
    throw new FlightConsumerOfferEvidenceRepositoryError();
  }

  async load(parameters: FlightOfferEvidenceLoadRpcParameters) {
    const recoveryParameters: FlightOfferEvidenceTerminalRecoveryLoadRpcParameters = Object.freeze({
      p_attempt_id: this.#attemptId,
      p_order_id: this.#orderId,
      p_receipt_sha256: parameters.p_receipt_sha256,
      p_customer_id: parameters.p_customer_id,
      p_execution_scope_sha256: parameters.p_execution_scope_sha256,
    });
    const { data, error } = await createAdminClient().rpc(
      "load_flight_offer_evidence_for_terminal_recovery_v1",
      recoveryParameters,
    );
    if (error) throw new FlightConsumerOfferEvidenceRepositoryError();
    return data;
  }
}

async function readFlightConsumerTerminalRecoveryLocalOfferId(
  parameters: FlightOfferEvidenceTerminalRecoveryLocalIdentityRpcParameters,
) {
  try {
    const { data, error } = await createAdminClient().rpc(
      "get_flight_offer_local_identity_for_terminal_recovery_v1",
      parameters,
    );
    if (error) throw new FlightConsumerOfferEvidenceRepositoryError();
    const parsed = terminalRecoveryLocalIdentityResultSchema.safeParse(data);
    if (!parsed.success) throw new FlightConsumerOfferEvidenceRepositoryError();
    return parsed.data[0]!.local_offer_id;
  } catch {
    throw new FlightConsumerOfferEvidenceRepositoryError();
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalSnapshot(value: unknown) {
  const serialized = canonicalFlightJson(value as FlightCanonicalJsonValue);
  return JSON.parse(serialized) as unknown;
}

function snapshotScope(value: unknown) {
  return evidenceScopeSchema.parse(canonicalSnapshot(value));
}

function durableRecordPayload(record: z.infer<typeof durableRecordSchema>) {
  return {
    version: record.version,
    stage: record.stage,
    scope: record.scope,
    localOfferId: record.localOfferId,
    search: record.search,
    observedAt: record.observedAt,
    retentionExpiresAt: record.retentionExpiresAt,
    predecessorReceiptDigest: record.predecessorReceiptDigest,
    rawBodyBase64: record.rawBodyBase64,
    rawBodyDigest: record.rawBodyDigest,
    evidenceDigest: record.evidenceDigest,
    snapshotDigest: record.snapshotDigest,
  } as const;
}

function snapshotAndVerifyRecord(value: unknown) {
  const record = durableRecordSchema.parse(canonicalSnapshot(value));
  const rawBody = Buffer.from(record.rawBodyBase64, "base64");
  if (
    rawBody.length === 0
    || rawBody.length > maximumRawBodyBytes
    || rawBody.toString("base64") !== record.rawBodyBase64
    || createHash("sha256").update(rawBody).digest("hex") !== record.rawBodyDigest
    || sha256FlightEvidence(durableRecordPayload(record) as unknown as FlightCanonicalJsonValue)
      !== record.recordDigest
  ) {
    rawBody.fill(0);
    throw new FlightConsumerOfferEvidenceRepositoryError();
  }
  rawBody.fill(0);
  return deepFreeze(record) as DuffelDurableOfferEvidenceRecord;
}

function sameScope(left: DuffelOfferEvidenceScope, right: DuffelOfferEvidenceScope) {
  return left.tenantId === right.tenantId
    && left.commerceId === right.commerceId
    && left.actorId === right.actorId;
}

function milliseconds(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new FlightConsumerOfferEvidenceRepositoryError();
  return parsed;
}

function contextFor(record: DuffelDurableOfferEvidenceRecord, binding: FlightConsumerOfferEvidenceRepositoryBinding) {
  return Object.freeze({
    customerId: binding.customerId,
    searchId: binding.searchId,
    localOfferId: binding.localOfferId,
    executionScopeSha256: binding.executionScopeSha256,
    stage: record.stage,
    predecessorReceiptDigest: record.predecessorReceiptDigest,
  });
}

export function buildFlightConsumerPreviewOfferEvidenceScope(input: Readonly<{
  customerId: string;
  searchId: string;
}>): DuffelOfferEvidenceScope {
  const parsed = z.object({ customerId: uuidSchema, searchId: uuidSchema }).strict().parse(input);
  return Object.freeze({
    tenantId: FLIGHT_CONSUMER_PREVIEW_TENANT_ID,
    commerceId: parsed.searchId,
    actorId: parsed.customerId,
  });
}

class DurableFlightConsumerOfferEvidenceRepository implements DuffelAuthenticatedOfferEvidenceRepository {
  readonly #binding: FlightConsumerOfferEvidenceRepositoryBinding;
  readonly #scope: DuffelOfferEvidenceScope;
  readonly #vault: FlightConsumerOfferEvidenceVault;
  readonly #keyring: FlightConsumerOfferEvidenceKeyring;
  readonly #readTrustedTime: () => string;

  constructor(
    binding: FlightConsumerOfferEvidenceRepositoryBinding,
    dependencies: FlightConsumerOfferEvidenceRepositoryDependencies,
  ) {
    this.#binding = Object.freeze({ ...repositoryBindingSchema.parse(canonicalSnapshot(binding)) });
    this.#scope = buildFlightConsumerPreviewOfferEvidenceScope({
      customerId: this.#binding.customerId,
      searchId: this.#binding.searchId,
    });
    if (
      dependencies.keyring.keyVersion !== this.#binding.evidenceKeyVersion
      || typeof dependencies.vault?.store !== "function"
      || typeof dependencies.vault?.load !== "function"
      || typeof dependencies.readTrustedTime !== "function"
    ) throw new FlightConsumerOfferEvidenceRepositoryError();
    this.#vault = dependencies.vault;
    this.#keyring = dependencies.keyring;
    this.#readTrustedTime = dependencies.readTrustedTime;
  }

  #trustedTime() {
    try {
      return exactInstantSchema.parse(this.#readTrustedTime());
    } catch {
      throw new FlightConsumerOfferEvidenceRepositoryError();
    }
  }

  async readOfferEvidencePolicy(): Promise<DuffelAuthenticatedOfferEvidenceRepositoryPolicy> {
    return Object.freeze({
      version: "duffel-offer-evidence-repository-policy-v1",
      decision: "accepted",
      dataClassification: "synthetic_fixture_only",
      realProviderDataAuthorized: false,
      rawBodyLoggingDisabled: true,
      tenantAccessControlRequired: true,
      retentionDeletionRequired: true,
      maximumRetentionSeconds: FLIGHT_CONSUMER_OFFER_EVIDENCE_RETENTION_SECONDS,
      trustedTime: this.#trustedTime(),
    });
  }

  #assertBoundRecord(record: DuffelDurableOfferEvidenceRecord, expectedScope: DuffelOfferEvidenceScope) {
    if (
      !sameScope(expectedScope, this.#scope)
      || !sameScope(record.scope, this.#scope)
      || record.localOfferId !== this.#binding.localOfferId
    ) throw new FlightConsumerOfferEvidenceRepositoryError();

    const trustedTime = milliseconds(this.#trustedTime());
    const observedAt = milliseconds(record.observedAt);
    const retentionExpiresAt = milliseconds(record.retentionExpiresAt);
    if (
      observedAt > trustedTime
      || retentionExpiresAt <= trustedTime
      || retentionExpiresAt - trustedTime > FLIGHT_CONSUMER_OFFER_EVIDENCE_RETENTION_SECONDS * 1_000
      || retentionExpiresAt > observedAt + 604_800_000
    ) throw new FlightConsumerOfferEvidenceRepositoryError();
  }

  async #loadVerified(
    receiptDigest: string,
    expectedScope: DuffelOfferEvidenceScope,
  ): Promise<DuffelAuthenticatedOfferEvidenceLoadResult> {
    let raw: unknown;
    try {
      raw = await this.#vault.load({
        p_receipt_sha256: receiptDigest,
        p_customer_id: this.#binding.customerId,
        p_execution_scope_sha256: this.#binding.executionScopeSha256,
      });
    } catch {
      throw new FlightConsumerOfferEvidenceRepositoryError();
    }
    const parsed = loadResultSchema.safeParse(raw);
    if (!parsed.success) return Object.freeze({ decision: "invalid" });
    if (parsed.data.length === 0) return Object.freeze({ decision: "not_found" });
    const row = parsed.data[0]!;
    if (milliseconds(row.retention_expires_at) <= milliseconds(this.#trustedTime())) {
      return Object.freeze({ decision: "not_found" });
    }
    if (
      row.customer_id !== this.#binding.customerId
      || row.search_id !== this.#binding.searchId
      || row.offer_id !== this.#binding.offerId
      || row.receipt_sha256 !== receiptDigest
      || row.key_version !== this.#binding.evidenceKeyVersion
      || (row.stage === "initial" && row.predecessor_receipt_sha256 !== null)
      || (row.stage === "refreshed" && row.predecessor_receipt_sha256 === null)
    ) return Object.freeze({ decision: "invalid" });

    try {
      const envelope = Object.freeze({
        version: "flight-consumer-offer-evidence-envelope-v1" as const,
        algorithm: "aes-256-gcm" as const,
        keyVersion: row.key_version,
        ivBase64Url: row.iv_base64url,
        ciphertextBase64Url: row.ciphertext_base64url,
        authTagBase64Url: row.auth_tag_base64url,
        aadSha256: row.aad_sha256,
        recordHmacSha256: row.record_hmac_sha256,
        receiptSha256: row.receipt_sha256,
      });
      const decrypted = decryptFlightConsumerOfferEvidence({
        envelope,
        recordDigest: row.record_sha256,
        context: {
          customerId: this.#binding.customerId,
          searchId: this.#binding.searchId,
          localOfferId: this.#binding.localOfferId,
          executionScopeSha256: this.#binding.executionScopeSha256,
          stage: row.stage,
          predecessorReceiptDigest: row.predecessor_receipt_sha256,
        },
        keyring: this.#keyring,
      });
      const record = snapshotAndVerifyRecord(decrypted);
      if (
        !sameScope(expectedScope, this.#scope)
        || !sameScope(record.scope, this.#scope)
        || record.localOfferId !== this.#binding.localOfferId
        || record.stage !== row.stage
        || record.predecessorReceiptDigest !== row.predecessor_receipt_sha256
        || milliseconds(record.observedAt) !== milliseconds(row.observed_at)
        || milliseconds(record.retentionExpiresAt) !== milliseconds(row.retention_expires_at)
        || record.rawBodyDigest !== row.raw_body_sha256
        || record.evidenceDigest !== row.evidence_sha256
        || record.snapshotDigest !== row.snapshot_sha256
        || record.recordDigest !== row.record_sha256
      ) return Object.freeze({ decision: "invalid" });
      this.#assertBoundRecord(record, expectedScope);
      return deepFreeze({ decision: "verified", receiptDigest, record });
    } catch {
      return Object.freeze({ decision: "invalid" });
    }
  }

  async storeOfferEvidence(
    untrustedRecord: DuffelDurableOfferEvidenceRecord,
    untrustedExpectedScope: DuffelOfferEvidenceScope,
  ): Promise<DuffelAuthenticatedOfferEvidenceStoreResult> {
    let record: DuffelDurableOfferEvidenceRecord;
    let expectedScope: DuffelOfferEvidenceScope;
    try {
      record = snapshotAndVerifyRecord(untrustedRecord);
      expectedScope = snapshotScope(untrustedExpectedScope);
      this.#assertBoundRecord(record, expectedScope);
    } catch {
      throw new FlightConsumerOfferEvidenceRepositoryError();
    }

    const envelope = encryptFlightConsumerOfferEvidence({
      record: record as unknown as Readonly<Record<string, unknown>>,
      recordDigest: record.recordDigest,
      context: contextFor(record, this.#binding),
      keyring: this.#keyring,
    });
    const existing = await this.#loadVerified(envelope.receiptSha256, expectedScope);
    if (existing.decision === "verified") {
      if (existing.record.recordDigest !== record.recordDigest) {
        throw new FlightConsumerOfferEvidenceRepositoryError();
      }
      return Object.freeze({
        decision: "already_stored",
        receiptDigest: envelope.receiptSha256,
        recordDigest: record.recordDigest,
      });
    }
    if (existing.decision === "invalid") throw new FlightConsumerOfferEvidenceRepositoryError();

    const parameters: FlightOfferEvidenceStoreRpcParameters = Object.freeze({
      p_customer_id: this.#binding.customerId,
      p_search_id: this.#binding.searchId,
      p_offer_id: this.#binding.offerId,
      p_execution_scope_sha256: this.#binding.executionScopeSha256,
      p_stage: record.stage,
      p_predecessor_receipt_sha256: record.predecessorReceiptDigest,
      p_observed_at: record.observedAt,
      p_retention_expires_at: record.retentionExpiresAt,
      p_raw_body_sha256: record.rawBodyDigest,
      p_evidence_sha256: record.evidenceDigest,
      p_snapshot_sha256: record.snapshotDigest,
      p_record_sha256: record.recordDigest,
      p_receipt_sha256: envelope.receiptSha256,
      p_key_version: envelope.keyVersion,
      p_iv_base64url: envelope.ivBase64Url,
      p_auth_tag_base64url: envelope.authTagBase64Url,
      p_ciphertext_base64url: envelope.ciphertextBase64Url,
      p_aad_sha256: envelope.aadSha256,
      p_record_hmac_sha256: envelope.recordHmacSha256,
    });

    let raw: unknown;
    try {
      raw = await this.#vault.store(parameters);
    } catch {
      const recovered = await this.#loadVerified(envelope.receiptSha256, expectedScope);
      if (recovered.decision === "verified" && recovered.record.recordDigest === record.recordDigest) {
        return Object.freeze({
          decision: "already_stored",
          receiptDigest: envelope.receiptSha256,
          recordDigest: record.recordDigest,
        });
      }
      throw new FlightConsumerOfferEvidenceRepositoryError();
    }
    const stored = storeResultSchema.safeParse(raw);
    if (!stored.success || stored.data[0]!.receipt_sha256 !== envelope.receiptSha256) {
      throw new FlightConsumerOfferEvidenceRepositoryError();
    }
    return Object.freeze({
      decision: stored.data[0]!.decision === "created" ? "stored" : "already_stored",
      receiptDigest: envelope.receiptSha256,
      recordDigest: record.recordDigest,
    });
  }

  async verifyAndLoadOfferEvidence(
    receiptDigest: string,
    untrustedExpectedScope: DuffelOfferEvidenceScope,
  ): Promise<DuffelAuthenticatedOfferEvidenceLoadResult> {
    if (!/^[0-9a-f]{64}$/.test(receiptDigest)) return Object.freeze({ decision: "invalid" });
    let expectedScope: DuffelOfferEvidenceScope;
    try {
      expectedScope = snapshotScope(untrustedExpectedScope);
    } catch {
      return Object.freeze({ decision: "invalid" });
    }
    if (!sameScope(expectedScope, this.#scope)) return Object.freeze({ decision: "invalid" });
    return this.#loadVerified(receiptDigest, expectedScope);
  }
}

export function createInjectedFlightConsumerPreviewOfferEvidenceRepository(
  binding: FlightConsumerOfferEvidenceRepositoryBinding,
  dependencies: FlightConsumerOfferEvidenceRepositoryDependencies,
): DuffelAuthenticatedOfferEvidenceRepository {
  return Object.freeze(new DurableFlightConsumerOfferEvidenceRepository(binding, dependencies));
}

export function createInjectedFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository(
  binding: FlightConsumerOfferEvidenceRepositoryBinding,
  dependencies: FlightConsumerTerminalRecoveryOfferEvidenceRepositoryDependencies,
): FlightConsumerTerminalRecoveryOfferEvidenceReader {
  let attemptDispatchedAt: string;
  let currentTime: string;
  const readRecoveryCurrentTime = () => {
    try {
      return new Date(databaseInstantSchema.parse(dependencies.readCurrentTime())).toISOString();
    } catch {
      throw new FlightConsumerOfferEvidenceRepositoryError();
    }
  };
  try {
    attemptDispatchedAt = new Date(
      databaseInstantSchema.parse(dependencies.attemptDispatchedAt),
    ).toISOString();
    currentTime = readRecoveryCurrentTime();
  } catch {
    throw new FlightConsumerOfferEvidenceRepositoryError();
  }
  const dispatchedAtMilliseconds = milliseconds(attemptDispatchedAt);
  const assertRecoveryWindow = (value: string) => {
    const currentTimeMilliseconds = milliseconds(value);
    if (
      dispatchedAtMilliseconds > currentTimeMilliseconds
      || currentTimeMilliseconds - dispatchedAtMilliseconds > 604_800_000
    ) throw new FlightConsumerOfferEvidenceRepositoryError();
  };
  assertRecoveryWindow(currentTime);
  if (typeof dependencies.vault?.load !== "function") {
    throw new FlightConsumerOfferEvidenceRepositoryError();
  }

  const readOnlyVault: FlightConsumerOfferEvidenceVault = Object.freeze({
    store: async (): Promise<never> => {
      throw new FlightConsumerOfferEvidenceRepositoryError();
    },
    load: (parameters: FlightOfferEvidenceLoadRpcParameters) => {
      // The evidence itself is evaluated at immutable dispatch time, but the
      // bounded recovery capability must not remain usable after its seven-day
      // operational window if a repository instance is retained in memory.
      assertRecoveryWindow(readRecoveryCurrentTime());
      return dependencies.vault.load(parameters);
    },
  });
  const repository = createInjectedFlightConsumerPreviewOfferEvidenceRepository(binding, {
    vault: readOnlyVault,
    keyring: dependencies.keyring,
    readTrustedTime: () => attemptDispatchedAt,
  });
  const load = (
    receiptDigest: string,
    expectedScope: DuffelOfferEvidenceScope,
  ) => repository.verifyAndLoadOfferEvidence(receiptDigest, expectedScope);
  return Object.freeze({
    verifyAndLoadTerminalOfferEvidence: load,
    projectTerminalOfferEvidence: async (
      receiptDigest: string,
      expectedScope: DuffelOfferEvidenceScope,
    ): Promise<FlightConsumerTerminalRecoveryOfferEvidenceProjectionResult> => {
      const loaded = await load(receiptDigest, expectedScope);
      if (loaded.decision !== "verified") return loaded;
      const loader: DuffelAuthenticatedOfferEvidenceLoader = Object.freeze({
        readOfferEvidencePolicy: () => repository.readOfferEvidencePolicy(),
        verifyAndLoadOfferEvidence: (
          candidateReceipt: string,
          candidateScope: DuffelOfferEvidenceScope,
        ) => (
          candidateReceipt === receiptDigest && sameScope(candidateScope, expectedScope)
            ? Promise.resolve(loaded)
            : load(candidateReceipt, candidateScope)
        ),
      });
      try {
        const offer = await projectDuffelSandboxTerminalRecoveryOfferEvidence(
          loader,
          receiptDigest,
          expectedScope,
        );
        if (
          offer.receiptDigest !== loaded.receiptDigest
          || offer.recordDigest !== loaded.record.recordDigest
        ) return Object.freeze({ decision: "invalid" });
        return deepFreeze({
          decision: "verified" as const,
          receiptDigest: loaded.receiptDigest,
          record: loaded.record,
          offer,
        });
      } catch {
        return Object.freeze({ decision: "invalid" });
      }
    },
  });
}

export async function createFlightConsumerPreviewOfferEvidenceRepository(input: Readonly<{
  customerId: string;
  searchId: string;
  offerId: string;
  localOfferId: string;
}>): Promise<DuffelAuthenticatedOfferEvidenceRepository> {
  const identity = z.object({
    customerId: uuidSchema,
    searchId: uuidSchema,
    offerId: uuidSchema,
    localOfferId: stableTokenSchema,
  }).strict().parse(canonicalSnapshot(input));
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const keyring = readFlightConsumerPreviewOfferEvidenceKeyring();
  return createInjectedFlightConsumerPreviewOfferEvidenceRepository({
    ...identity,
    executionScopeSha256: runtime.binding.executionScopeSha256,
    evidenceKeyVersion: runtime.binding.evidenceKeyVersion,
  }, {
    vault: Object.freeze(new SupabaseFlightConsumerOfferEvidenceVault()),
    keyring,
    readTrustedTime: () => new Date().toISOString(),
  });
}

/**
 * Constructs a recovery-only reader whose trusted time is the immutable
 * successful create-order observation. This is intentionally distinct from
 * shopping/reprice repositories: it can only decrypt evidence returned by the
 * recovery-only SQL gate and cannot create dispatch authority or persist data.
 */
export async function createFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository(
  input: Readonly<{
    customerId: string;
    orderId: string;
    searchId: string;
    offerId: string;
    attemptId: string;
    attemptDispatchedAt: string;
    receiptSha256: string;
  }>,
): Promise<FlightConsumerTerminalRecoveryOfferEvidenceReader> {
  const identity = z.object({
    customerId: uuidSchema,
    orderId: uuidSchema,
    searchId: uuidSchema,
    offerId: uuidSchema,
    attemptId: uuidSchema,
    attemptDispatchedAt: databaseInstantSchema,
    receiptSha256: sha256Schema,
  }).strict().parse(canonicalSnapshot(input));
  const attemptDispatchedAt = new Date(identity.attemptDispatchedAt).toISOString();

  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const localOfferId = await readFlightConsumerTerminalRecoveryLocalOfferId(Object.freeze({
    p_attempt_id: identity.attemptId,
    p_order_id: identity.orderId,
    p_customer_id: identity.customerId,
    p_execution_scope_sha256: runtime.binding.executionScopeSha256,
    p_receipt_sha256: identity.receiptSha256,
  }));
  const keyring = readFlightConsumerPreviewOfferEvidenceKeyring();
  return createInjectedFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository({
    customerId: identity.customerId,
    searchId: identity.searchId,
    offerId: identity.offerId,
    localOfferId,
    executionScopeSha256: runtime.binding.executionScopeSha256,
    evidenceKeyVersion: runtime.binding.evidenceKeyVersion,
  }, {
    vault: Object.freeze(new SupabaseFlightConsumerTerminalRecoveryOfferEvidenceVault({
      attemptId: identity.attemptId,
      orderId: identity.orderId,
    })),
    keyring,
    attemptDispatchedAt,
    readCurrentTime: () => new Date().toISOString(),
  });
}
