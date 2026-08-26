import "server-only";

import { z } from "zod";

import type {
  DuffelSandboxTrustedTravelerResolver,
  DuffelSandboxVerifiedSyntheticAdultTraveler,
} from "../duffel-sandbox-bridge";
import {
  digestDuffelSandboxOrderTravelerPii,
  type DuffelSandboxAdultOrderTraveler,
} from "../duffel-sandbox-contract";
import type { FlightProviderTravelerBinding } from "../provider-adapter";
import {
  canonicalFlightJson,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import { createAdminClient } from "../../supabase/admin";
import {
  buildFlightConsumerPreviewFictionalTravelers,
  FLIGHT_CONSUMER_PREVIEW_MAX_FICTIONAL_TRAVELERS,
} from "./fictional-travelers";
import {
  createFlightConsumerPiiRecordRef,
  decryptFlightConsumerPii,
  encryptFlightConsumerPii,
  readFlightConsumerPreviewPiiKeyring,
  type FlightConsumerPiiKeyring,
} from "./pii-crypto.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

export const FLIGHT_CONSUMER_PII_RETENTION_SECONDS = 3_600 as const;
export const FLIGHT_CONSUMER_PREVIEW_PII_TENANT_ID = "tenant_iratepilot_preview_0001" as const;

const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const keyVersionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
const securePiiRecordRefSchema = z.string().regex(/^fp_[A-Za-z0-9_-]{16,200}$/);
const providerPassengerIdSchema = z.string().regex(/^pas_[A-Za-z0-9]{8,252}$/);
const canonicalBase64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}, "Use a real YYYY-MM-DD date.");
const exactInstantSchema = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}, "Use a normalized ISO-8601 instant.");
const databaseInstantSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Use a parseable database instant.",
);

const scopeSchema = z.object({
  tenantId: z.literal(FLIGHT_CONSUMER_PREVIEW_PII_TENANT_ID),
  commerceId: uuidSchema,
  actorId: uuidSchema,
}).strict();

const repositoryBindingSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema,
  executionScopeSha256: sha256Schema,
  piiKeyVersion: keyVersionSchema,
}).strict();

const createInputSchema = z.object({
  travelerSequence: z.number().int().min(1).max(FLIGHT_CONSUMER_PREVIEW_MAX_FICTIONAL_TRAVELERS),
  providerPassengerId: providerPassengerIdSchema,
  departureDate: localDateSchema,
  scope: scopeSchema,
}).strict();

const providerBindingSchema = z.object({
  travelerRef: securePiiRecordRefSchema,
  piiRecordDigest: sha256Schema,
}).strict();

const loadInputSchema = createInputSchema.extend({
  binding: providerBindingSchema,
}).strict();

const resolverContextSchema = createInputSchema.extend({
  binding: providerBindingSchema,
}).strict();

export type FlightConsumerPiiRepositoryBinding = z.infer<typeof repositoryBindingSchema>;
export type FlightConsumerPiiCreateInput = z.infer<typeof createInputSchema>;
export type FlightConsumerPiiLoadInput = z.infer<typeof loadInputSchema>;
export type FlightConsumerPiiResolverContext = z.infer<typeof resolverContextSchema>;

export type FlightSecurePiiStoreRpcParameters = Readonly<{
  p_secure_pii_record_ref: string;
  p_customer_id: string;
  p_order_id: string;
  p_execution_scope_sha256: string;
  p_traveler_type: "adult";
  p_pii_record_sha256: string;
  p_pii_authority_receipt_sha256: string;
  p_retention_expires_at: string;
  p_key_version: string;
  p_iv_base64url: string;
  p_auth_tag_base64url: string;
  p_ciphertext_base64url: string;
  p_aad_sha256: string;
  p_pii_hmac_sha256: string;
}>;

export type FlightSecurePiiLoadRpcParameters = Readonly<{
  p_secure_pii_record_ref: string;
  p_customer_id: string;
  p_execution_scope_sha256: string;
}>;

export type FlightSecurePiiTombstoneRpcParameters = FlightSecurePiiLoadRpcParameters;

export interface FlightConsumerPiiVault {
  store(parameters: FlightSecurePiiStoreRpcParameters): Promise<unknown>;
  load(parameters: FlightSecurePiiLoadRpcParameters): Promise<unknown>;
  tombstone(parameters: FlightSecurePiiTombstoneRpcParameters): Promise<unknown>;
}

export type FlightConsumerPiiRepositoryDependencies = Readonly<{
  vault: FlightConsumerPiiVault;
  keyring: FlightConsumerPiiKeyring;
  readTrustedTime: () => string;
}>;

export type FlightConsumerPiiPreparedRecord = Readonly<{
  version: "flight-consumer-pii-prepared-record-v1";
  travelerSequence: number;
  travelerType: "adult";
  securePiiRecordRef: string;
  piiRecordDigest: string;
  retentionExpiresAt: string;
  providerBinding: FlightProviderTravelerBinding;
}>;

export type FlightConsumerPiiStoreResult = Readonly<{
  decision: "stored" | "already_stored";
  securePiiRecordRef: string;
  travelerType: "adult";
  piiRecordDigest: string;
  piiAuthorityReceiptDigest: string;
  retentionExpiresAt: string;
  providerBinding: FlightProviderTravelerBinding;
}>;

export type FlightConsumerPiiLoadResult =
  | Readonly<{
    decision: "verified";
    securePiiRecordRef: string;
    travelerType: "adult";
    travelerSequence: number;
    piiRecordDigest: string;
    piiAuthorityReceiptDigest: string;
    retentionExpiresAt: string;
    traveler: DuffelSandboxAdultOrderTraveler;
  }>
  | Readonly<{ decision: "not_found" | "invalid" }>;

export type FlightConsumerPiiTombstoneResult = Readonly<{
  decision: "tombstoned" | "not_found";
  securePiiRecordRef: string;
}>;

export interface FlightConsumerPiiRepository {
  create(input: FlightConsumerPiiCreateInput): FlightConsumerPiiPreparedRecord;
  store(record: FlightConsumerPiiPreparedRecord): Promise<FlightConsumerPiiStoreResult>;
  createAndStore(input: FlightConsumerPiiCreateInput): Promise<FlightConsumerPiiStoreResult>;
  load(input: FlightConsumerPiiLoadInput): Promise<FlightConsumerPiiLoadResult>;
  tombstone(securePiiRecordRef: string): Promise<FlightConsumerPiiTombstoneResult>;
  createTravelerResolver(
    contexts: readonly FlightConsumerPiiResolverContext[],
  ): DuffelSandboxTrustedTravelerResolver;
}

const storeResultSchema = z.array(z.object({
  decision: z.enum(["created", "replay"]),
  secure_pii_record_ref: securePiiRecordRefSchema,
}).strict()).length(1);

const loadResultSchema = z.array(z.object({
  secure_pii_record_ref: securePiiRecordRefSchema,
  customer_id: uuidSchema,
  order_id: uuidSchema,
  execution_scope_sha256: sha256Schema,
  traveler_type: z.enum(["adult", "child", "infant_in_seat", "infant_on_lap"]),
  pii_record_sha256: sha256Schema,
  pii_authority_receipt_sha256: sha256Schema,
  retention_expires_at: databaseInstantSchema,
  key_version: keyVersionSchema,
  iv_base64url: canonicalBase64UrlSchema.length(16),
  auth_tag_base64url: canonicalBase64UrlSchema.length(22),
  ciphertext_base64url: canonicalBase64UrlSchema.min(16).max(6_000),
  aad_sha256: sha256Schema,
  pii_hmac_sha256: sha256Schema,
}).strict()).max(1);

type VaultRow = z.infer<typeof loadResultSchema>[number];

type PreparedState = Readonly<{
  binding: FlightConsumerPiiRepositoryBinding;
  input: FlightConsumerPiiCreateInput;
  passenger: ReturnType<typeof buildFlightConsumerPreviewFictionalTravelers>[number]["passenger"];
}>;

type VerifiedVaultRecord = Readonly<{
  row: VaultRow;
  passenger: PreparedState["passenger"];
  travelerSequence: number;
  normalizedRetentionExpiresAt: string;
}>;

const preparedStateByRecord = new WeakMap<object, PreparedState>();

export class FlightConsumerPiiRepositoryError extends Error {
  constructor() {
    super("Flight Consumer Preview passenger records are unavailable.");
    this.name = "FlightConsumerPiiRepositoryError";
  }
}

class SupabaseFlightConsumerPiiVault implements FlightConsumerPiiVault {
  async store(parameters: FlightSecurePiiStoreRpcParameters) {
    const { data, error } = await createAdminClient().rpc(
      "store_flight_secure_pii_record_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPiiRepositoryError();
    return data;
  }

  async load(parameters: FlightSecurePiiLoadRpcParameters) {
    const { data, error } = await createAdminClient().rpc(
      "load_flight_secure_pii_record_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPiiRepositoryError();
    return data;
  }

  async tombstone(parameters: FlightSecurePiiTombstoneRpcParameters) {
    const { data, error } = await createAdminClient().rpc(
      "tombstone_flight_secure_pii_record_v1",
      parameters,
    );
    if (error) throw new FlightConsumerPiiRepositoryError();
    return data;
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

function normalizedInstant(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new FlightConsumerPiiRepositoryError();
  return new Date(parsed).toISOString();
}

function milliseconds(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new FlightConsumerPiiRepositoryError();
  return parsed;
}

function authorityReceiptSha256(input: Readonly<{
  binding: FlightConsumerPiiRepositoryBinding;
  securePiiRecordRef: string;
  piiRecordSha256: string;
  retentionExpiresAt: string;
  keyVersion: string;
  aadSha256: string;
  piiHmacSha256: string;
}>) {
  return sha256FlightEvidence({
    version: "flight-consumer-pii-authority-receipt-v1",
    customerId: input.binding.customerId,
    orderId: input.binding.orderId,
    executionMode: "test",
    executionScopeSha256: input.binding.executionScopeSha256,
    travelerType: "adult",
    securePiiRecordRef: input.securePiiRecordRef,
    piiRecordSha256: input.piiRecordSha256,
    retentionExpiresAt: normalizedInstant(input.retentionExpiresAt),
    keyVersion: input.keyVersion,
    aadSha256: input.aadSha256,
    piiHmacSha256: input.piiHmacSha256,
  });
}

function passengerForSequence(sequence: number) {
  return buildFlightConsumerPreviewFictionalTravelers(sequence)[sequence - 1]!.passenger;
}

function fixedPassengerSequence(passenger: PreparedState["passenger"]) {
  const candidate = canonicalFlightJson(passenger as unknown as FlightCanonicalJsonValue);
  for (const fixture of buildFlightConsumerPreviewFictionalTravelers(
    FLIGHT_CONSUMER_PREVIEW_MAX_FICTIONAL_TRAVELERS,
  )) {
    if (canonicalFlightJson(fixture.passenger as unknown as FlightCanonicalJsonValue) === candidate) {
      return fixture.travelerSequence;
    }
  }
  return null;
}

function exactCreateInput(value: unknown, customerId: string) {
  const parsed = createInputSchema.parse(canonicalSnapshot(value));
  if (parsed.scope.actorId !== customerId) throw new FlightConsumerPiiRepositoryError();
  return deepFreeze(parsed) as FlightConsumerPiiCreateInput;
}

function exactLoadInput(value: unknown, customerId: string) {
  const parsed = loadInputSchema.parse(canonicalSnapshot(value));
  if (parsed.scope.actorId !== customerId) throw new FlightConsumerPiiRepositoryError();
  return deepFreeze(parsed) as FlightConsumerPiiLoadInput;
}

function buildProviderTraveler(input: Readonly<{
  passenger: PreparedState["passenger"];
  securePiiRecordRef: string;
  piiRecordDigest: string;
  providerPassengerId: string;
}>): DuffelSandboxAdultOrderTraveler {
  return deepFreeze({
    travelerRef: input.securePiiRecordRef,
    piiRecordDigest: input.piiRecordDigest,
    providerPassengerId: input.providerPassengerId,
    title: input.passenger.title,
    gender: input.passenger.gender,
    givenName: input.passenger.givenName,
    familyName: input.passenger.familyName,
    bornOn: input.passenger.bornOn,
    email: input.passenger.email,
    phoneNumber: input.passenger.phoneNumber,
  }) as DuffelSandboxAdultOrderTraveler;
}

class DurableFlightConsumerPiiRepository implements FlightConsumerPiiRepository {
  readonly #binding: FlightConsumerPiiRepositoryBinding;
  readonly #vault: FlightConsumerPiiVault;
  readonly #keyring: FlightConsumerPiiKeyring;
  readonly #readTrustedTime: () => string;

  constructor(
    binding: FlightConsumerPiiRepositoryBinding,
    dependencies: FlightConsumerPiiRepositoryDependencies,
  ) {
    try {
      this.#binding = Object.freeze(
        repositoryBindingSchema.parse(canonicalSnapshot(binding)),
      );
      if (
        dependencies.keyring.keyVersion !== this.#binding.piiKeyVersion
        || typeof dependencies.vault?.store !== "function"
        || typeof dependencies.vault?.load !== "function"
        || typeof dependencies.vault?.tombstone !== "function"
        || typeof dependencies.readTrustedTime !== "function"
      ) throw new Error();
      this.#vault = dependencies.vault;
      this.#keyring = dependencies.keyring;
      this.#readTrustedTime = dependencies.readTrustedTime;
    } catch {
      throw new FlightConsumerPiiRepositoryError();
    }
  }

  #trustedTime() {
    try {
      return exactInstantSchema.parse(this.#readTrustedTime());
    } catch {
      throw new FlightConsumerPiiRepositoryError();
    }
  }

  #loadParameters(securePiiRecordRef: string): FlightSecurePiiLoadRpcParameters {
    return Object.freeze({
      p_secure_pii_record_ref: securePiiRecordRef,
      p_customer_id: this.#binding.customerId,
      p_execution_scope_sha256: this.#binding.executionScopeSha256,
    });
  }

  async #readVaultRow(securePiiRecordRef: string) {
    let raw: unknown;
    try {
      raw = await this.#vault.load(this.#loadParameters(securePiiRecordRef));
    } catch {
      throw new FlightConsumerPiiRepositoryError();
    }
    const parsed = loadResultSchema.safeParse(raw);
    if (!parsed.success) return { decision: "invalid" as const };
    if (parsed.data.length === 0) return { decision: "not_found" as const };
    return { decision: "found" as const, row: parsed.data[0]! };
  }

  #verifyVaultRow(row: VaultRow): VerifiedVaultRecord | null {
    try {
      const normalizedRetentionExpiresAt = normalizedInstant(row.retention_expires_at);
      const trustedTime = milliseconds(this.#trustedTime());
      const retentionExpiresAt = milliseconds(normalizedRetentionExpiresAt);
      if (
        row.customer_id !== this.#binding.customerId
        || row.order_id !== this.#binding.orderId
        || row.execution_scope_sha256 !== this.#binding.executionScopeSha256
        || row.traveler_type !== "adult"
        || row.key_version !== this.#binding.piiKeyVersion
        || retentionExpiresAt <= trustedTime
        || retentionExpiresAt - trustedTime > FLIGHT_CONSUMER_PII_RETENTION_SECONDS * 1_000
        || row.pii_authority_receipt_sha256 !== authorityReceiptSha256({
          binding: this.#binding,
          securePiiRecordRef: row.secure_pii_record_ref,
          piiRecordSha256: row.pii_record_sha256,
          retentionExpiresAt: normalizedRetentionExpiresAt,
          keyVersion: row.key_version,
          aadSha256: row.aad_sha256,
          piiHmacSha256: row.pii_hmac_sha256,
        })
      ) return null;

      const passenger = decryptFlightConsumerPii({
        envelope: {
          version: "flight-consumer-pii-envelope-v1",
          algorithm: "aes-256-gcm",
          keyVersion: row.key_version,
          ivBase64Url: row.iv_base64url,
          ciphertextBase64Url: row.ciphertext_base64url,
          authTagBase64Url: row.auth_tag_base64url,
          aadSha256: row.aad_sha256,
          piiHmacSha256: row.pii_hmac_sha256,
        },
        context: {
          customerId: this.#binding.customerId,
          orderId: this.#binding.orderId,
          securePiiRecordRef: row.secure_pii_record_ref,
          executionScopeSha256: this.#binding.executionScopeSha256,
        },
        keyring: this.#keyring,
      });
      const travelerSequence = fixedPassengerSequence(passenger);
      if (travelerSequence === null) return null;
      return deepFreeze({
        row,
        passenger,
        travelerSequence,
        normalizedRetentionExpiresAt,
      }) as VerifiedVaultRecord;
    } catch {
      return null;
    }
  }

  async #loadVerifiedCore(securePiiRecordRef: string) {
    const loaded = await this.#readVaultRow(securePiiRecordRef);
    if (loaded.decision !== "found") return loaded;
    const verified = this.#verifyVaultRow(loaded.row);
    return verified === null
      ? { decision: "invalid" as const }
      : { decision: "verified" as const, verified };
  }

  #verifyPreparedAgainstStored(
    state: PreparedState,
    verified: VerifiedVaultRecord,
  ) {
    return verified.travelerSequence === state.input.travelerSequence
      && canonicalFlightJson(verified.passenger as unknown as FlightCanonicalJsonValue)
        === canonicalFlightJson(state.passenger as unknown as FlightCanonicalJsonValue)
      && verified.row.pii_record_sha256 === digestDuffelSandboxOrderTravelerPii({
        scope: state.input.scope,
        departureDate: state.input.departureDate,
        traveler: {
          travelerRef: verified.row.secure_pii_record_ref,
          providerPassengerId: state.input.providerPassengerId,
          ...state.passenger,
        },
      });
  }

  create(untrustedInput: FlightConsumerPiiCreateInput): FlightConsumerPiiPreparedRecord {
    try {
      const input = exactCreateInput(untrustedInput, this.#binding.customerId);
      const passenger = passengerForSequence(input.travelerSequence);
      const securePiiRecordRef = createFlightConsumerPiiRecordRef();
      const piiRecordDigest = digestDuffelSandboxOrderTravelerPii({
        scope: input.scope,
        departureDate: input.departureDate,
        traveler: {
          travelerRef: securePiiRecordRef,
          providerPassengerId: input.providerPassengerId,
          ...passenger,
        },
      });
      const retentionExpiresAt = new Date(
        milliseconds(this.#trustedTime()) + FLIGHT_CONSUMER_PII_RETENTION_SECONDS * 1_000,
      ).toISOString();
      const prepared = deepFreeze({
        version: "flight-consumer-pii-prepared-record-v1" as const,
        travelerSequence: input.travelerSequence,
        travelerType: "adult" as const,
        securePiiRecordRef,
        piiRecordDigest,
        retentionExpiresAt,
        providerBinding: Object.freeze({
          travelerRef: securePiiRecordRef,
          piiRecordDigest,
        }),
      }) as FlightConsumerPiiPreparedRecord;
      preparedStateByRecord.set(prepared, Object.freeze({
        binding: this.#binding,
        input,
        passenger,
      }));
      return prepared;
    } catch {
      throw new FlightConsumerPiiRepositoryError();
    }
  }

  async store(record: FlightConsumerPiiPreparedRecord): Promise<FlightConsumerPiiStoreResult> {
    const state = preparedStateByRecord.get(record as object);
    if (state === undefined || state.binding !== this.#binding) {
      throw new FlightConsumerPiiRepositoryError();
    }
    const trustedTime = milliseconds(this.#trustedTime());
    if (
      milliseconds(record.retentionExpiresAt) <= trustedTime
      || milliseconds(record.retentionExpiresAt) - trustedTime
        > FLIGHT_CONSUMER_PII_RETENTION_SECONDS * 1_000
    ) throw new FlightConsumerPiiRepositoryError();

    const existing = await this.#loadVerifiedCore(record.securePiiRecordRef);
    if (existing.decision === "invalid") throw new FlightConsumerPiiRepositoryError();
    if (existing.decision === "verified") {
      if (!this.#verifyPreparedAgainstStored(state, existing.verified)) {
        throw new FlightConsumerPiiRepositoryError();
      }
      return this.#storeResult("already_stored", record, existing.verified.row.pii_authority_receipt_sha256);
    }

    const envelope = encryptFlightConsumerPii({
      passenger: state.passenger,
      context: {
        customerId: this.#binding.customerId,
        orderId: this.#binding.orderId,
        securePiiRecordRef: record.securePiiRecordRef,
        executionScopeSha256: this.#binding.executionScopeSha256,
      },
      keyring: this.#keyring,
    });
    const piiAuthorityReceiptDigest = authorityReceiptSha256({
      binding: this.#binding,
      securePiiRecordRef: record.securePiiRecordRef,
      piiRecordSha256: record.piiRecordDigest,
      retentionExpiresAt: record.retentionExpiresAt,
      keyVersion: envelope.keyVersion,
      aadSha256: envelope.aadSha256,
      piiHmacSha256: envelope.piiHmacSha256,
    });
    const parameters: FlightSecurePiiStoreRpcParameters = Object.freeze({
      p_secure_pii_record_ref: record.securePiiRecordRef,
      p_customer_id: this.#binding.customerId,
      p_order_id: this.#binding.orderId,
      p_execution_scope_sha256: this.#binding.executionScopeSha256,
      p_traveler_type: "adult",
      p_pii_record_sha256: record.piiRecordDigest,
      p_pii_authority_receipt_sha256: piiAuthorityReceiptDigest,
      p_retention_expires_at: record.retentionExpiresAt,
      p_key_version: envelope.keyVersion,
      p_iv_base64url: envelope.ivBase64Url,
      p_auth_tag_base64url: envelope.authTagBase64Url,
      p_ciphertext_base64url: envelope.ciphertextBase64Url,
      p_aad_sha256: envelope.aadSha256,
      p_pii_hmac_sha256: envelope.piiHmacSha256,
    });

    let raw: unknown;
    try {
      raw = await this.#vault.store(parameters);
    } catch {
      return this.#recoverStore(record, state, piiAuthorityReceiptDigest);
    }
    const stored = storeResultSchema.safeParse(raw);
    if (
      !stored.success
      || stored.data[0]!.secure_pii_record_ref !== record.securePiiRecordRef
    ) return this.#recoverStore(record, state, piiAuthorityReceiptDigest);
    return this.#storeResult(
      stored.data[0]!.decision === "created" ? "stored" : "already_stored",
      record,
      piiAuthorityReceiptDigest,
    );
  }

  async #recoverStore(
    record: FlightConsumerPiiPreparedRecord,
    state: PreparedState,
    piiAuthorityReceiptDigest: string,
  ) {
    const recovered = await this.#loadVerifiedCore(record.securePiiRecordRef);
    if (
      recovered.decision === "verified"
      && recovered.verified.row.pii_authority_receipt_sha256 === piiAuthorityReceiptDigest
      && this.#verifyPreparedAgainstStored(state, recovered.verified)
    ) return this.#storeResult("already_stored", record, piiAuthorityReceiptDigest);
    throw new FlightConsumerPiiRepositoryError();
  }

  #storeResult(
    decision: FlightConsumerPiiStoreResult["decision"],
    record: FlightConsumerPiiPreparedRecord,
    piiAuthorityReceiptDigest: string,
  ) {
    return deepFreeze({
      decision,
      securePiiRecordRef: record.securePiiRecordRef,
      travelerType: "adult" as const,
      piiRecordDigest: record.piiRecordDigest,
      piiAuthorityReceiptDigest,
      retentionExpiresAt: record.retentionExpiresAt,
      providerBinding: record.providerBinding,
    }) as FlightConsumerPiiStoreResult;
  }

  async createAndStore(input: FlightConsumerPiiCreateInput) {
    return this.store(this.create(input));
  }

  async load(untrustedInput: FlightConsumerPiiLoadInput): Promise<FlightConsumerPiiLoadResult> {
    let input: FlightConsumerPiiLoadInput;
    try {
      input = exactLoadInput(untrustedInput, this.#binding.customerId);
    } catch {
      return Object.freeze({ decision: "invalid" });
    }
    const loaded = await this.#loadVerifiedCore(input.binding.travelerRef);
    if (loaded.decision !== "verified") return Object.freeze({ decision: loaded.decision });
    const { verified } = loaded;
    try {
      const expectedPassenger = passengerForSequence(input.travelerSequence);
      const expectedDigest = digestDuffelSandboxOrderTravelerPii({
        scope: input.scope,
        departureDate: input.departureDate,
        traveler: {
          travelerRef: input.binding.travelerRef,
          providerPassengerId: input.providerPassengerId,
          ...expectedPassenger,
        },
      });
      if (
        verified.travelerSequence !== input.travelerSequence
        || canonicalFlightJson(verified.passenger as unknown as FlightCanonicalJsonValue)
          !== canonicalFlightJson(expectedPassenger as unknown as FlightCanonicalJsonValue)
        || input.binding.piiRecordDigest !== expectedDigest
        || verified.row.pii_record_sha256 !== expectedDigest
      ) return Object.freeze({ decision: "invalid" });
      return deepFreeze({
        decision: "verified" as const,
        securePiiRecordRef: verified.row.secure_pii_record_ref,
        travelerType: "adult" as const,
        travelerSequence: verified.travelerSequence,
        piiRecordDigest: expectedDigest,
        piiAuthorityReceiptDigest: verified.row.pii_authority_receipt_sha256,
        retentionExpiresAt: verified.normalizedRetentionExpiresAt,
        traveler: buildProviderTraveler({
          passenger: verified.passenger,
          securePiiRecordRef: verified.row.secure_pii_record_ref,
          piiRecordDigest: expectedDigest,
          providerPassengerId: input.providerPassengerId,
        }),
      }) as FlightConsumerPiiLoadResult;
    } catch {
      return Object.freeze({ decision: "invalid" });
    }
  }

  async tombstone(untrustedSecurePiiRecordRef: string): Promise<FlightConsumerPiiTombstoneResult> {
    const parsedRef = securePiiRecordRefSchema.safeParse(untrustedSecurePiiRecordRef);
    if (!parsedRef.success) throw new FlightConsumerPiiRepositoryError();
    const existing = await this.#loadVerifiedCore(parsedRef.data);
    if (existing.decision === "not_found") {
      return Object.freeze({ decision: "not_found", securePiiRecordRef: parsedRef.data });
    }
    if (existing.decision === "invalid") throw new FlightConsumerPiiRepositoryError();

    try {
      const raw = await this.#vault.tombstone(this.#loadParameters(parsedRef.data));
      if (raw === true) {
        return Object.freeze({ decision: "tombstoned", securePiiRecordRef: parsedRef.data });
      }
      if (raw !== false) throw new Error();
    } catch {
      // A lost RPC response and a concurrent tombstone are recovered below.
    }
    const recovered = await this.#readVaultRow(parsedRef.data);
    if (recovered.decision === "not_found") {
      return Object.freeze({ decision: "tombstoned", securePiiRecordRef: parsedRef.data });
    }
    throw new FlightConsumerPiiRepositoryError();
  }

  createTravelerResolver(
    untrustedContexts: readonly FlightConsumerPiiResolverContext[],
  ): DuffelSandboxTrustedTravelerResolver {
    let contexts: FlightConsumerPiiResolverContext[];
    try {
      const parsed = z.array(resolverContextSchema)
        .min(1)
        .max(FLIGHT_CONSUMER_PREVIEW_MAX_FICTIONAL_TRAVELERS)
        .parse(canonicalSnapshot(untrustedContexts));
      if (
        parsed.some(({ scope }) => scope.actorId !== this.#binding.customerId)
        || new Set(parsed.map(({ binding }) => binding.travelerRef)).size !== parsed.length
        || new Set(parsed.map(({ binding }) => binding.piiRecordDigest)).size !== parsed.length
        || new Set(parsed.map(({ providerPassengerId }) => providerPassengerId)).size !== parsed.length
      ) throw new Error();
      contexts = parsed;
    } catch {
      throw new FlightConsumerPiiRepositoryError();
    }
    const byTravelerRef = new Map(contexts.map((context) => [context.binding.travelerRef, context]));
    const load = this.load.bind(this);
    return Object.freeze({
      async resolveSyntheticAdultTraveler(
        untrustedBinding: FlightProviderTravelerBinding,
      ): Promise<DuffelSandboxVerifiedSyntheticAdultTraveler> {
        let binding: FlightProviderTravelerBinding;
        try {
          binding = providerBindingSchema.parse(canonicalSnapshot(untrustedBinding));
        } catch {
          throw new FlightConsumerPiiRepositoryError();
        }
        const context = byTravelerRef.get(binding.travelerRef);
        if (
          context === undefined
          || context.binding.piiRecordDigest !== binding.piiRecordDigest
        ) throw new FlightConsumerPiiRepositoryError();
        const loaded = await load({ ...context, binding });
        if (loaded.decision !== "verified") throw new FlightConsumerPiiRepositoryError();
        return deepFreeze({
          decision: "verified_synthetic_adult" as const,
          traveler: loaded.traveler,
          piiAuthorityReceiptDigest: loaded.piiAuthorityReceiptDigest,
        }) as DuffelSandboxVerifiedSyntheticAdultTraveler;
      },
    });
  }
}

export function createInjectedFlightConsumerPreviewPiiRepository(
  binding: FlightConsumerPiiRepositoryBinding,
  dependencies: FlightConsumerPiiRepositoryDependencies,
): FlightConsumerPiiRepository {
  return Object.freeze(new DurableFlightConsumerPiiRepository(binding, dependencies));
}

export async function createFlightConsumerPreviewPiiRepository(input: Readonly<{
  customerId: string;
  orderId: string;
}>): Promise<FlightConsumerPiiRepository> {
  let identity: Readonly<{ customerId: string; orderId: string }>;
  try {
    identity = Object.freeze(z.object({
      customerId: uuidSchema,
      orderId: uuidSchema,
    }).strict().parse(canonicalSnapshot(input)));
  } catch {
    throw new FlightConsumerPiiRepositoryError();
  }
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const keyring = readFlightConsumerPreviewPiiKeyring();
  return createInjectedFlightConsumerPreviewPiiRepository({
    ...identity,
    executionScopeSha256: runtime.binding.executionScopeSha256,
    piiKeyVersion: runtime.binding.piiKeyVersion,
  }, {
    vault: Object.freeze(new SupabaseFlightConsumerPiiVault()),
    keyring,
    readTrustedTime: () => new Date().toISOString(),
  });
}
