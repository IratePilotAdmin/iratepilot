import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const moduleMocks = vi.hoisted(() => ({
  requireRuntime: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: moduleMocks.requireRuntime,
}));
vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: moduleMocks.rpc }),
}));

import type {
  DuffelDurableOfferEvidenceRecord,
  DuffelOfferEvidenceScope,
} from "../lib/flights/duffel-sandbox-contract";
import {
  createFlightConsumerOfferEvidenceKeyring,
} from "../lib/flights/consumer-preview/evidence-crypto.server";
import {
  FLIGHT_CONSUMER_OFFER_EVIDENCE_RETENTION_SECONDS,
  FLIGHT_CONSUMER_PREVIEW_TENANT_ID,
  FlightConsumerOfferEvidenceRepositoryError,
  buildFlightConsumerPreviewOfferEvidenceScope,
  createFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository,
  createInjectedFlightConsumerPreviewOfferEvidenceRepository,
  createInjectedFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository,
  type FlightConsumerOfferEvidenceVault,
  type FlightOfferEvidenceLoadRpcParameters,
  type FlightOfferEvidenceStoreRpcParameters,
} from "../lib/flights/consumer-preview/offer-evidence-repository.server";
import {
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../lib/flights/runtime-safety";

const customerId = "11111111-1111-4111-8111-111111111111";
const searchId = "22222222-2222-4222-8222-222222222222";
const offerId = "33333333-3333-4333-8333-333333333333";
const localOfferId = "offer_preview_00000001";
const executionScopeSha256 = "a".repeat(64);
const evidenceKeyVersion = "preview-evidence-v1";
const trustedTime = "2026-08-25T12:05:00.000Z";
const evidenceId = "44444444-4444-4444-8444-444444444444";
const orderId = "55555555-5555-4555-8555-555555555555";
const attemptId = "66666666-6666-4666-8666-666666666666";
const plaintextMarker = "DUFFEL_TEST_PROVIDER_SECRET_DO_NOT_STORE";

const keyring = createFlightConsumerOfferEvidenceKeyring({
  keyVersion: evidenceKeyVersion,
  encryptionKeyBase64Url: Buffer.alloc(32, 31).toString("base64url"),
  hmacKeyBase64Url: Buffer.alloc(32, 47).toString("base64url"),
});

const scope = buildFlightConsumerPreviewOfferEvidenceScope({ customerId, searchId });
const binding = Object.freeze({
  customerId,
  searchId,
  offerId,
  localOfferId,
  executionScopeSha256,
  evidenceKeyVersion,
});

type VaultRow = Readonly<{
  evidence_id: string;
  customer_id: string;
  search_id: string;
  offer_id: string;
  stage: "initial" | "refreshed";
  predecessor_receipt_sha256: string | null;
  observed_at: string;
  retention_expires_at: string;
  raw_body_sha256: string;
  evidence_sha256: string;
  snapshot_sha256: string;
  record_sha256: string;
  receipt_sha256: string;
  key_version: string;
  iv_base64url: string;
  auth_tag_base64url: string;
  ciphertext_base64url: string;
  aad_sha256: string;
  record_hmac_sha256: string;
}>;

function rowFrom(parameters: FlightOfferEvidenceStoreRpcParameters): VaultRow {
  return Object.freeze({
    evidence_id: evidenceId,
    customer_id: parameters.p_customer_id,
    search_id: parameters.p_search_id,
    offer_id: parameters.p_offer_id,
    stage: parameters.p_stage,
    predecessor_receipt_sha256: parameters.p_predecessor_receipt_sha256,
    observed_at: parameters.p_observed_at,
    retention_expires_at: parameters.p_retention_expires_at,
    raw_body_sha256: parameters.p_raw_body_sha256,
    evidence_sha256: parameters.p_evidence_sha256,
    snapshot_sha256: parameters.p_snapshot_sha256,
    record_sha256: parameters.p_record_sha256,
    receipt_sha256: parameters.p_receipt_sha256,
    key_version: parameters.p_key_version,
    iv_base64url: parameters.p_iv_base64url,
    auth_tag_base64url: parameters.p_auth_tag_base64url,
    ciphertext_base64url: parameters.p_ciphertext_base64url,
    aad_sha256: parameters.p_aad_sha256,
    record_hmac_sha256: parameters.p_record_hmac_sha256,
  });
}

class MemoryVault implements FlightConsumerOfferEvidenceVault {
  readonly storeCalls: FlightOfferEvidenceStoreRpcParameters[] = [];
  readonly loadCalls: FlightOfferEvidenceLoadRpcParameters[] = [];
  readonly rows = new Map<string, Readonly<{
    executionScopeSha256: string;
    row: VaultRow;
  }>>();
  commitThenThrow = false;
  malformedStoreResult: unknown | undefined;
  loadFailure = false;

  async store(parameters: FlightOfferEvidenceStoreRpcParameters) {
    this.storeCalls.push(structuredClone(parameters));
    const row = rowFrom(parameters);
    this.rows.set(parameters.p_receipt_sha256, Object.freeze({
      executionScopeSha256: parameters.p_execution_scope_sha256,
      row,
    }));
    if (this.commitThenThrow) throw new Error(`vault failure: ${plaintextMarker}`);
    if (this.malformedStoreResult !== undefined) return this.malformedStoreResult;
    return [{ decision: "created", evidence_id: evidenceId, receipt_sha256: parameters.p_receipt_sha256 }];
  }

  async load(parameters: FlightOfferEvidenceLoadRpcParameters) {
    this.loadCalls.push(structuredClone(parameters));
    if (this.loadFailure) throw new Error(`vault failure: ${plaintextMarker}`);
    const stored = this.rows.get(parameters.p_receipt_sha256);
    if (
      stored === undefined
      || stored.row.customer_id !== parameters.p_customer_id
      || stored.executionScopeSha256 !== parameters.p_execution_scope_sha256
    ) return [];
    return [structuredClone(stored.row)];
  }

  tamper(receiptDigest: string, changes: Partial<VaultRow>) {
    const stored = this.rows.get(receiptDigest)!;
    this.rows.set(receiptDigest, Object.freeze({
      ...stored,
      row: Object.freeze({ ...stored.row, ...changes }),
    }));
  }
}

function makeRecord(overrides: Partial<DuffelDurableOfferEvidenceRecord> = {}) {
  const rawBody = Buffer.from(JSON.stringify({
    offer: "off_TEST_ONLY_00000001",
    marker: plaintextMarker,
  }), "utf8");
  const base = {
    version: "duffel-durable-offer-evidence-record-v1" as const,
    stage: "initial" as const,
    scope,
    localOfferId,
    search: {
      origin: "ORD",
      destination: "LAX",
      departureDate: "2026-09-20",
      returnDate: null,
      cabin: "economy" as const,
      passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
    },
    observedAt: "2026-08-25T12:00:00.000Z",
    retentionExpiresAt: "2026-08-25T12:30:00.000Z",
    predecessorReceiptDigest: null,
    rawBodyBase64: rawBody.toString("base64"),
    rawBodyDigest: createHash("sha256").update(rawBody).digest("hex"),
    evidenceDigest: "b".repeat(64),
    snapshotDigest: "c".repeat(64),
    ...overrides,
  };
  const payload = {
    version: base.version,
    stage: base.stage,
    scope: base.scope,
    localOfferId: base.localOfferId,
    search: base.search,
    observedAt: base.observedAt,
    retentionExpiresAt: base.retentionExpiresAt,
    predecessorReceiptDigest: base.predecessorReceiptDigest,
    rawBodyBase64: base.rawBodyBase64,
    rawBodyDigest: base.rawBodyDigest,
    evidenceDigest: base.evidenceDigest,
    snapshotDigest: base.snapshotDigest,
  };
  rawBody.fill(0);
  return Object.freeze({
    ...base,
    recordDigest: sha256FlightEvidence(payload as unknown as FlightCanonicalJsonValue),
  }) as DuffelDurableOfferEvidenceRecord;
}

function createSubject(vault = new MemoryVault(), now = trustedTime) {
  const repository = createInjectedFlightConsumerPreviewOfferEvidenceRepository(binding, {
    vault,
    keyring,
    readTrustedTime: () => now,
  });
  return { repository, vault };
}

function flip(value: string) {
  const bytes = Buffer.from(value, "base64url");
  bytes[0] ^= 1;
  return bytes.toString("base64url");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  moduleMocks.requireRuntime.mockReset();
  moduleMocks.rpc.mockReset();
});

describe("Flight Consumer Preview durable offer-evidence repository", () => {
  it("exposes the exact narrow policy and customer/search scope", async () => {
    const { repository } = createSubject();
    expect(scope).toEqual({
      tenantId: FLIGHT_CONSUMER_PREVIEW_TENANT_ID,
      commerceId: searchId,
      actorId: customerId,
    });
    expect(await repository.readOfferEvidencePolicy()).toEqual({
      version: "duffel-offer-evidence-repository-policy-v1",
      decision: "accepted",
      dataClassification: "synthetic_fixture_only",
      realProviderDataAuthorized: false,
      rawBodyLoggingDisabled: true,
      tenantAccessControlRequired: true,
      retentionDeletionRequired: true,
      maximumRetentionSeconds: FLIGHT_CONSUMER_OFFER_EVIDENCE_RETENTION_SECONDS,
      trustedTime,
    });
  });

  it("stores only encrypted evidence and rehydrates the authenticated exact record", async () => {
    const { repository, vault } = createSubject();
    const record = makeRecord();
    const stored = await repository.storeOfferEvidence(record, scope);

    expect(stored).toEqual({
      decision: "stored",
      receiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      recordDigest: record.recordDigest,
    });
    expect(vault.storeCalls).toHaveLength(1);
    expect(vault.storeCalls[0]).toMatchObject({
      p_customer_id: customerId,
      p_search_id: searchId,
      p_offer_id: offerId,
      p_execution_scope_sha256: executionScopeSha256,
      p_stage: "initial",
      p_key_version: evidenceKeyVersion,
      p_raw_body_sha256: record.rawBodyDigest,
      p_record_sha256: record.recordDigest,
    });
    const serializedRpc = JSON.stringify(vault.storeCalls[0]);
    expect(serializedRpc).not.toContain(plaintextMarker);
    expect(serializedRpc).not.toContain(record.rawBodyBase64);

    expect(await repository.verifyAndLoadOfferEvidence(stored.receiptDigest, scope)).toEqual({
      decision: "verified",
      receiptDigest: stored.receiptDigest,
      record,
    });
  });

  it("is idempotent and does not rewrite an already authenticated receipt", async () => {
    const { repository, vault } = createSubject();
    const record = makeRecord();
    const first = await repository.storeOfferEvidence(record, scope);
    const second = await repository.storeOfferEvidence(record, scope);
    expect(first.decision).toBe("stored");
    expect(second).toEqual({
      decision: "already_stored",
      receiptDigest: first.receiptDigest,
      recordDigest: record.recordDigest,
    });
    expect(vault.storeCalls).toHaveLength(1);
  });

  it("recovers a committed write when the RPC response is lost", async () => {
    const vault = new MemoryVault();
    vault.commitThenThrow = true;
    const { repository } = createSubject(vault);
    const record = makeRecord();
    await expect(repository.storeOfferEvidence(record, scope)).resolves.toMatchObject({
      decision: "already_stored",
      recordDigest: record.recordDigest,
    });
    expect(vault.storeCalls).toHaveLength(1);
    expect(vault.loadCalls).toHaveLength(2);
  });

  it("rejects cross-customer, cross-search, cross-offer, and local-offer scope confusion", async () => {
    const cases: readonly [Partial<DuffelDurableOfferEvidenceRecord>, DuffelOfferEvidenceScope][] = [
      [{}, { ...scope, actorId: "55555555-5555-4555-8555-555555555555" }],
      [{}, { ...scope, commerceId: "66666666-6666-4666-8666-666666666666" }],
      [{ scope: { ...scope, actorId: "55555555-5555-4555-8555-555555555555" } }, scope],
      [{ localOfferId: "offer_preview_99999999" }, scope],
    ];
    for (const [changes, expectedScope] of cases) {
      const { repository, vault } = createSubject();
      await expect(repository.storeOfferEvidence(makeRecord(changes), expectedScope))
        .rejects.toBeInstanceOf(FlightConsumerOfferEvidenceRepositoryError);
      expect(vault.storeCalls).toHaveLength(0);
    }
  });

  it("fails closed for expired, future-observed, excessive-retention, and invalid raw evidence", async () => {
    const invalidRecords = [
      makeRecord({ retentionExpiresAt: trustedTime }),
      makeRecord({ observedAt: "2026-08-25T12:06:00.000Z" }),
      makeRecord({ retentionExpiresAt: "2026-08-25T13:05:00.001Z" }),
      makeRecord({ rawBodyDigest: "d".repeat(64) }),
    ];
    for (const record of invalidRecords) {
      const { repository, vault } = createSubject();
      await expect(repository.storeOfferEvidence(record, scope))
        .rejects.toBeInstanceOf(FlightConsumerOfferEvidenceRepositoryError);
      expect(vault.storeCalls).toHaveLength(0);
    }
  });

  it("returns invalid for database identity, digest, and envelope tampering", async () => {
    const tamperCases: Array<(row: VaultRow) => Partial<VaultRow>> = [
      () => ({ search_id: "66666666-6666-4666-8666-666666666666" }),
      () => ({ offer_id: "77777777-7777-4777-8777-777777777777" }),
      () => ({ record_sha256: "d".repeat(64) }),
      () => ({ raw_body_sha256: "d".repeat(64) }),
      () => ({ aad_sha256: "d".repeat(64) }),
      () => ({ record_hmac_sha256: "d".repeat(64) }),
      (row) => ({ ciphertext_base64url: flip(row.ciphertext_base64url) }),
      (row) => ({ auth_tag_base64url: flip(row.auth_tag_base64url) }),
    ];
    for (const tamper of tamperCases) {
      const { repository, vault } = createSubject();
      const stored = await repository.storeOfferEvidence(makeRecord(), scope);
      const row = vault.rows.get(stored.receiptDigest)!.row;
      vault.tamper(stored.receiptDigest, tamper(row));
      await expect(repository.verifyAndLoadOfferEvidence(stored.receiptDigest, scope))
        .resolves.toEqual({ decision: "invalid" });
    }
  });

  it("distinguishes absent evidence from malformed receipts without widening vault access", async () => {
    const { repository, vault } = createSubject();
    await expect(repository.verifyAndLoadOfferEvidence("d".repeat(64), scope))
      .resolves.toEqual({ decision: "not_found" });
    expect(vault.loadCalls).toHaveLength(1);
    await expect(repository.verifyAndLoadOfferEvidence("not-a-receipt", scope))
      .resolves.toEqual({ decision: "invalid" });
    await expect(repository.verifyAndLoadOfferEvidence("e".repeat(64), {
      ...scope,
      actorId: "55555555-5555-4555-8555-555555555555",
    })).resolves.toEqual({ decision: "invalid" });
    expect(vault.loadCalls).toHaveLength(1);
  });

  it("normalizes vault failures and malformed RPC results without leaking provider plaintext", async () => {
    const record = makeRecord();
    const malformedVault = new MemoryVault();
    malformedVault.malformedStoreResult = [{ decision: "created", evidence_id: "bad", receipt_sha256: "bad" }];
    const malformedRepository = createSubject(malformedVault).repository;
    const malformedError = await malformedRepository.storeOfferEvidence(record, scope).catch((error: unknown) => error);
    expect(malformedError).toBeInstanceOf(FlightConsumerOfferEvidenceRepositoryError);
    expect(String(malformedError)).not.toContain(plaintextMarker);

    const failedVault = new MemoryVault();
    failedVault.loadFailure = true;
    const failedRepository = createSubject(failedVault).repository;
    const failure = await failedRepository.storeOfferEvidence(record, scope).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FlightConsumerOfferEvidenceRepositoryError);
    expect(String(failure)).not.toContain(plaintextMarker);
  });

  it("rehydrates an expired record only as of its immutable dispatch time through a read-only vault", async () => {
    const { repository: writer, vault } = createSubject();
    const record = makeRecord();
    const stored = await writer.storeOfferEvidence(record, scope);
    const recovery = createInjectedFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository(
      binding,
      {
        vault,
        keyring,
        attemptDispatchedAt: "2026-08-25T12:10:00.000Z",
        readCurrentTime: () => "2026-08-26T12:10:00.000Z",
      },
    );

    await expect(recovery.verifyAndLoadTerminalOfferEvidence(stored.receiptDigest, scope))
      .resolves.toEqual({ decision: "verified", receiptDigest: stored.receiptDigest, record });

    expect("storeOfferEvidence" in recovery).toBe(false);
    expect(Reflect.get(recovery, "storeOfferEvidence")).toBeUndefined();
    expect(Object.keys(recovery).sort()).toEqual([
      "projectTerminalOfferEvidence",
      "verifyAndLoadTerminalOfferEvidence",
    ]);
    expect(vault.storeCalls).toHaveLength(1);
  });

  it("binds terminal recovery to the RPC-authenticated local offer identity and refreshed receipt", async () => {
    const { repository: writer, vault } = createSubject();
    const initial = await writer.storeOfferEvidence(makeRecord(), scope);
    const refreshedRecord = makeRecord({
      stage: "refreshed",
      predecessorReceiptDigest: initial.receiptDigest,
      observedAt: "2026-08-25T12:04:00.000Z",
      evidenceDigest: "8".repeat(64),
      snapshotDigest: "9".repeat(64),
    });
    const refreshed = await writer.storeOfferEvidence(refreshedRecord, scope);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:10:00.000Z"));
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("FLIGHT_CONSUMER_PREVIEW_ENABLED", "true");
    vi.stubEnv("FLIGHT_CONSUMER_PREVIEW_EVIDENCE_KEY_VERSION", evidenceKeyVersion);
    vi.stubEnv(
      "FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL",
      Buffer.alloc(32, 31).toString("base64url"),
    );
    vi.stubEnv(
      "FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL",
      Buffer.alloc(32, 47).toString("base64url"),
    );
    moduleMocks.requireRuntime.mockResolvedValue(Object.freeze({
      binding: Object.freeze({ executionScopeSha256, evidenceKeyVersion }),
    }));
    moduleMocks.rpc.mockImplementation(async (name: string, parameters: Record<string, string>) => {
      if (name === "get_flight_offer_local_identity_for_terminal_recovery_v1") {
        expect(parameters).toEqual({
          p_attempt_id: attemptId,
          p_order_id: orderId,
          p_customer_id: customerId,
          p_execution_scope_sha256: executionScopeSha256,
          p_receipt_sha256: refreshed.receiptDigest,
        });
        return { data: [{ local_offer_id: localOfferId }], error: null };
      }
      if (name === "load_flight_offer_evidence_for_terminal_recovery_v1") {
        expect(parameters).toMatchObject({
          p_attempt_id: attemptId,
          p_order_id: orderId,
          p_customer_id: customerId,
          p_execution_scope_sha256: executionScopeSha256,
        });
        if (parameters.p_receipt_sha256 !== refreshed.receiptDigest) {
          return { data: [], error: null };
        }
        return {
          data: [structuredClone(vault.rows.get(refreshed.receiptDigest)!.row)],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });

    const recovery = await createFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository({
      customerId,
      orderId,
      searchId,
      offerId,
      attemptId,
      attemptDispatchedAt: "2026-08-25T12:10:00.000Z",
      receiptSha256: refreshed.receiptDigest,
    });
    await expect(recovery.verifyAndLoadTerminalOfferEvidence(refreshed.receiptDigest, scope))
      .resolves.toEqual({
        decision: "verified",
        receiptDigest: refreshed.receiptDigest,
        record: refreshedRecord,
      });
    expect(moduleMocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "get_flight_offer_local_identity_for_terminal_recovery_v1",
      "load_flight_offer_evidence_for_terminal_recovery_v1",
    ]);

    expect("storeOfferEvidence" in recovery).toBe(false);
    expect(Reflect.get(recovery, "storeOfferEvidence")).toBeUndefined();
    expect(moduleMocks.rpc.mock.calls.some(([name]) => name === "store_flight_offer_evidence_v1"))
      .toBe(false);
  });

  it("rejects terminal recovery before dispatch and after the seven-day evidence ceiling", () => {
    const cases = [
      {
        attemptDispatchedAt: "2026-08-25T12:10:00.000Z",
        currentTime: "2026-08-25T12:09:59.999Z",
      },
      {
        attemptDispatchedAt: "2026-08-25T12:10:00.000Z",
        currentTime: "2026-09-01T12:10:00.001Z",
      },
    ];
    for (const item of cases) {
      expect(() => createInjectedFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository(
        binding,
        {
          vault: new MemoryVault(),
          keyring,
          attemptDispatchedAt: item.attemptDispatchedAt,
          readCurrentTime: () => item.currentTime,
        },
      )).toThrow(FlightConsumerOfferEvidenceRepositoryError);
    }
  });

  it("rechecks the seven-day terminal recovery ceiling on every evidence load", async () => {
    const { repository: writer, vault } = createSubject();
    const stored = await writer.storeOfferEvidence(makeRecord(), scope);
    let currentTime = "2026-08-26T12:10:00.000Z";
    const recovery = createInjectedFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository(
      binding,
      {
        vault,
        keyring,
        attemptDispatchedAt: "2026-08-25T12:10:00.000Z",
        readCurrentTime: () => currentTime,
      },
    );

    await expect(recovery.verifyAndLoadTerminalOfferEvidence(stored.receiptDigest, scope))
      .resolves.toMatchObject({ decision: "verified" });

    currentTime = "2026-09-01T12:10:00.001Z";
    await expect(recovery.verifyAndLoadTerminalOfferEvidence(stored.receiptDigest, scope))
      .rejects.toBeInstanceOf(FlightConsumerOfferEvidenceRepositoryError);
    expect(vault.loadCalls).toHaveLength(2);
  });
});
