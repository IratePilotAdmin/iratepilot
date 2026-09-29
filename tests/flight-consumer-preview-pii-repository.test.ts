import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import { createFlightConsumerPiiKeyring } from "../lib/flights/consumer-preview/pii-crypto.server";
import {
  FLIGHT_CONSUMER_PII_RETENTION_SECONDS,
  FLIGHT_CONSUMER_PREVIEW_PII_TENANT_ID,
  FlightConsumerPiiRepositoryError,
  createInjectedFlightConsumerPreviewPiiRepository,
  type FlightConsumerPiiLoadInput,
  type FlightConsumerPiiVault,
  type FlightSecurePiiLoadRpcParameters,
  type FlightSecurePiiStoreRpcParameters,
  type FlightSecurePiiTombstoneRpcParameters,
} from "../lib/flights/consumer-preview/pii-repository.server";

const customerId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const searchId = "33333333-3333-4333-8333-333333333333";
const executionScopeSha256 = "a".repeat(64);
const piiKeyVersion = "preview-pii-v1";
const trustedTime = "2026-08-25T12:00:00.000Z";
const plaintextMarkers = [
  "Synthetic",
  "Traveler",
  "1990-01-01",
  "flight-test+1@example.com",
  "+13125550121",
] as const;

const keyring = createFlightConsumerPiiKeyring({
  keyVersion: piiKeyVersion,
  encryptionKeyBase64Url: Buffer.alloc(32, 41).toString("base64url"),
  hmacKeyBase64Url: Buffer.alloc(32, 59).toString("base64url"),
});

const binding = Object.freeze({
  customerId,
  orderId,
  executionScopeSha256,
  piiKeyVersion,
});

const scope = Object.freeze({
  tenantId: FLIGHT_CONSUMER_PREVIEW_PII_TENANT_ID,
  commerceId: searchId,
  actorId: customerId,
});

const createInput = Object.freeze({
  travelerSequence: 1,
  providerPassengerId: "pas_TESTPASSENGER0001",
  departureDate: "2026-09-20",
  scope,
});

type VaultRow = Readonly<{
  secure_pii_record_ref: string;
  customer_id: string;
  order_id: string;
  execution_scope_sha256: string;
  traveler_type: "adult" | "child" | "infant_in_seat" | "infant_on_lap";
  pii_record_sha256: string;
  pii_authority_receipt_sha256: string;
  retention_expires_at: string;
  key_version: string;
  iv_base64url: string;
  auth_tag_base64url: string;
  ciphertext_base64url: string;
  aad_sha256: string;
  pii_hmac_sha256: string;
}>;

function rowFrom(parameters: FlightSecurePiiStoreRpcParameters): VaultRow {
  return Object.freeze({
    secure_pii_record_ref: parameters.p_secure_pii_record_ref,
    customer_id: parameters.p_customer_id,
    order_id: parameters.p_order_id,
    execution_scope_sha256: parameters.p_execution_scope_sha256,
    traveler_type: parameters.p_traveler_type,
    pii_record_sha256: parameters.p_pii_record_sha256,
    pii_authority_receipt_sha256: parameters.p_pii_authority_receipt_sha256,
    retention_expires_at: parameters.p_retention_expires_at,
    key_version: parameters.p_key_version,
    iv_base64url: parameters.p_iv_base64url,
    auth_tag_base64url: parameters.p_auth_tag_base64url,
    ciphertext_base64url: parameters.p_ciphertext_base64url,
    aad_sha256: parameters.p_aad_sha256,
    pii_hmac_sha256: parameters.p_pii_hmac_sha256,
  });
}

class MemoryVault implements FlightConsumerPiiVault {
  readonly rows = new Map<string, VaultRow>();
  readonly storeCalls: FlightSecurePiiStoreRpcParameters[] = [];
  readonly loadCalls: FlightSecurePiiLoadRpcParameters[] = [];
  readonly tombstoneCalls: FlightSecurePiiTombstoneRpcParameters[] = [];
  commitStoreThenThrow = false;
  commitTombstoneThenThrow = false;
  failLoad = false;
  malformedStoreResult: unknown | undefined;

  async store(parameters: FlightSecurePiiStoreRpcParameters) {
    this.storeCalls.push(structuredClone(parameters));
    const candidate = rowFrom(parameters);
    const existing = this.rows.get(parameters.p_secure_pii_record_ref);
    if (existing !== undefined) {
      if (JSON.stringify(existing) === JSON.stringify(candidate)) {
        return [{
          decision: "replay",
          secure_pii_record_ref: parameters.p_secure_pii_record_ref,
        }];
      }
      throw new Error("Flight secure PII reference collision");
    }
    this.rows.set(parameters.p_secure_pii_record_ref, candidate);
    if (this.commitStoreThenThrow) {
      throw new Error(`vault leaked ${plaintextMarkers.join("|")}`);
    }
    if (this.malformedStoreResult !== undefined) return this.malformedStoreResult;
    return [{
      decision: "created",
      secure_pii_record_ref: parameters.p_secure_pii_record_ref,
    }];
  }

  async load(parameters: FlightSecurePiiLoadRpcParameters) {
    this.loadCalls.push(structuredClone(parameters));
    if (this.failLoad) throw new Error(`vault leaked ${plaintextMarkers.join("|")}`);
    const row = this.rows.get(parameters.p_secure_pii_record_ref);
    if (
      row === undefined
      || row.customer_id !== parameters.p_customer_id
      || row.execution_scope_sha256 !== parameters.p_execution_scope_sha256
    ) return [];
    return [structuredClone(row)];
  }

  async tombstone(parameters: FlightSecurePiiTombstoneRpcParameters) {
    this.tombstoneCalls.push(structuredClone(parameters));
    const deleted = this.rows.delete(parameters.p_secure_pii_record_ref);
    if (this.commitTombstoneThenThrow) {
      throw new Error(`vault leaked ${plaintextMarkers.join("|")}`);
    }
    return deleted;
  }

  tamper(recordRef: string, changes: Partial<VaultRow>) {
    this.rows.set(recordRef, Object.freeze({ ...this.rows.get(recordRef)!, ...changes }));
  }
}

function createSubject(vault = new MemoryVault(), now = trustedTime) {
  const repository = createInjectedFlightConsumerPreviewPiiRepository(binding, {
    vault,
    keyring,
    readTrustedTime: () => now,
  });
  return { repository, vault };
}

function loadInput(
  providerBinding: Readonly<{ travelerRef: string; piiRecordDigest: string }>,
  overrides: Partial<FlightConsumerPiiLoadInput> = {},
): FlightConsumerPiiLoadInput {
  return {
    ...createInput,
    binding: providerBinding,
    ...overrides,
  };
}

function flip(value: string) {
  const bytes = Buffer.from(value, "base64url");
  bytes[0] ^= 1;
  return bytes.toString("base64url");
}

describe("Flight Consumer Preview encrypted PII repository", () => {
  it("creates only a server-owned fictional adult and persists no plaintext", async () => {
    const { repository, vault } = createSubject();
    const prepared = repository.create(createInput);
    expect(prepared).toMatchObject({
      version: "flight-consumer-pii-prepared-record-v1",
      travelerSequence: 1,
      travelerType: "adult",
      securePiiRecordRef: expect.stringMatching(/^fp_[A-Za-z0-9_-]{32}$/),
      piiRecordDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      retentionExpiresAt: "2026-08-25T13:00:00.000Z",
      providerBinding: {
        travelerRef: expect.stringMatching(/^fp_/),
        piiRecordDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });

    const stored = await repository.store(prepared);
    expect(stored).toMatchObject({
      decision: "stored",
      securePiiRecordRef: prepared.securePiiRecordRef,
      piiRecordDigest: prepared.piiRecordDigest,
      piiAuthorityReceiptDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(vault.storeCalls).toHaveLength(1);
    expect(vault.storeCalls[0]).toMatchObject({
      p_customer_id: customerId,
      p_order_id: orderId,
      p_execution_scope_sha256: executionScopeSha256,
      p_traveler_type: "adult",
      p_pii_record_sha256: prepared.piiRecordDigest,
      p_pii_authority_receipt_sha256: stored.piiAuthorityReceiptDigest,
      p_key_version: piiKeyVersion,
    });
    const serializedRpc = JSON.stringify(vault.storeCalls[0]);
    for (const marker of plaintextMarkers) expect(serializedRpc).not.toContain(marker);

    await expect(repository.load(loadInput(prepared.providerBinding))).resolves.toEqual({
      decision: "verified",
      securePiiRecordRef: prepared.securePiiRecordRef,
      travelerType: "adult",
      travelerSequence: 1,
      piiRecordDigest: prepared.piiRecordDigest,
      piiAuthorityReceiptDigest: stored.piiAuthorityReceiptDigest,
      retentionExpiresAt: prepared.retentionExpiresAt,
      traveler: {
        travelerRef: prepared.securePiiRecordRef,
        piiRecordDigest: prepared.piiRecordDigest,
        providerPassengerId: createInput.providerPassengerId,
        title: "ms",
        gender: "f",
        givenName: "Synthetic",
        familyName: "Traveler",
        bornOn: "1990-01-01",
        email: "flight-test+1@example.com",
        phoneNumber: "+13125550121",
      },
    });
  });

  it("refuses caller-created records and non-fictional scope substitution", async () => {
    const { repository, vault } = createSubject();
    const forged = {
      ...repository.create(createInput),
      piiRecordDigest: "f".repeat(64),
    };
    await expect(repository.store(forged)).rejects.toBeInstanceOf(
      FlightConsumerPiiRepositoryError,
    );
    expect(vault.storeCalls).toHaveLength(0);

    expect(() => repository.create({
      ...createInput,
      scope: { ...scope, actorId: "44444444-4444-4444-8444-444444444444" },
    })).toThrow(FlightConsumerPiiRepositoryError);
    expect(() => repository.create({
      ...createInput,
      travelerSequence: 5,
    })).toThrow(FlightConsumerPiiRepositoryError);
  });

  it("replays without rewriting and recovers a committed store whose response was lost", async () => {
    const { repository, vault } = createSubject();
    const prepared = repository.create(createInput);
    const first = await repository.store(prepared);
    const replay = await repository.store(prepared);
    expect(replay).toEqual({ ...first, decision: "already_stored" });
    expect(vault.storeCalls).toHaveLength(1);

    const recoveryVault = new MemoryVault();
    recoveryVault.commitStoreThenThrow = true;
    const recoveryRepository = createSubject(recoveryVault).repository;
    const recoveryPrepared = recoveryRepository.create(createInput);
    await expect(recoveryRepository.store(recoveryPrepared)).resolves.toMatchObject({
      decision: "already_stored",
      securePiiRecordRef: recoveryPrepared.securePiiRecordRef,
    });
    expect(recoveryVault.storeCalls).toHaveLength(1);
    expect(recoveryVault.loadCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("recovers two concurrent stores of the same prepared record without overwriting ciphertext", async () => {
    const { repository, vault } = createSubject();
    const prepared = repository.create(createInput);

    const results = await Promise.all([
      repository.store(prepared),
      repository.store(prepared),
    ]);

    expect(results.map(({ decision }) => decision).sort()).toEqual([
      "already_stored",
      "stored",
    ]);
    expect(new Set(results.map(({ piiAuthorityReceiptDigest }) => piiAuthorityReceiptDigest)).size)
      .toBe(1);
    expect(vault.storeCalls).toHaveLength(2);
    expect(vault.rows).toHaveLength(1);
  });

  it("fails closed for identity, digest, authority, envelope, and expiry tampering", async () => {
    const tamperCases: Array<Readonly<{
      tamper: (row: VaultRow) => Partial<VaultRow>;
      decision: "invalid" | "not_found";
    }>> = [
      {
        tamper: () => ({ customer_id: "44444444-4444-4444-8444-444444444444" }),
        decision: "not_found",
      },
      { tamper: () => ({ order_id: "55555555-5555-4555-8555-555555555555" }), decision: "invalid" },
      {
        tamper: () => ({ execution_scope_sha256: "b".repeat(64) }),
        decision: "not_found",
      },
      { tamper: () => ({ traveler_type: "child" }), decision: "invalid" },
      { tamper: () => ({ pii_record_sha256: "c".repeat(64) }), decision: "invalid" },
      { tamper: () => ({ pii_authority_receipt_sha256: "d".repeat(64) }), decision: "invalid" },
      { tamper: () => ({ aad_sha256: "e".repeat(64) }), decision: "invalid" },
      { tamper: () => ({ pii_hmac_sha256: "f".repeat(64) }), decision: "invalid" },
      { tamper: (row) => ({ ciphertext_base64url: flip(row.ciphertext_base64url) }), decision: "invalid" },
      { tamper: (row) => ({ auth_tag_base64url: flip(row.auth_tag_base64url) }), decision: "invalid" },
      { tamper: () => ({ retention_expires_at: trustedTime }), decision: "invalid" },
    ];

    for (const { tamper, decision } of tamperCases) {
      const { repository, vault } = createSubject();
      const prepared = repository.create(createInput);
      await repository.store(prepared);
      const row = vault.rows.get(prepared.securePiiRecordRef)!;
      vault.tamper(prepared.securePiiRecordRef, tamper(row));
      await expect(repository.load(loadInput(prepared.providerBinding)))
        .resolves.toEqual({ decision });
    }
  });

  it("rejects provider, date, sequence, scope, and binding confusion on load", async () => {
    const { repository } = createSubject();
    const stored = await repository.createAndStore(createInput);
    const cases: FlightConsumerPiiLoadInput[] = [
      loadInput(stored.providerBinding, { providerPassengerId: "pas_OTHERPASSENGER0002" }),
      loadInput(stored.providerBinding, { departureDate: "2026-09-21" }),
      loadInput(stored.providerBinding, { travelerSequence: 2 }),
      loadInput({ ...stored.providerBinding, piiRecordDigest: "f".repeat(64) }),
      loadInput(stored.providerBinding, {
        scope: { ...scope, commerceId: "66666666-6666-4666-8666-666666666666" },
      }),
    ];
    for (const candidate of cases) {
      await expect(repository.load(candidate)).resolves.toEqual({ decision: "invalid" });
    }
  });

  it("provides a strict trusted traveler resolver over verified vault evidence", async () => {
    const { repository } = createSubject();
    const stored = await repository.createAndStore(createInput);
    const context = loadInput(stored.providerBinding);
    const resolver = repository.createTravelerResolver([context]);

    await expect(resolver.resolveSyntheticAdultTraveler(stored.providerBinding)).resolves.toEqual({
      decision: "verified_synthetic_adult",
      traveler: expect.objectContaining({
        travelerRef: stored.securePiiRecordRef,
        piiRecordDigest: stored.piiRecordDigest,
        providerPassengerId: createInput.providerPassengerId,
        givenName: "Synthetic",
      }),
      piiAuthorityReceiptDigest: stored.piiAuthorityReceiptDigest,
    });
    await expect(resolver.resolveSyntheticAdultTraveler({
      ...stored.providerBinding,
      piiRecordDigest: "f".repeat(64),
    })).rejects.toBeInstanceOf(FlightConsumerPiiRepositoryError);
  });

  it("tombstones through the owner-bound RPC and recovers a lost response", async () => {
    const { repository, vault } = createSubject();
    const stored = await repository.createAndStore(createInput);
    await expect(repository.tombstone(stored.securePiiRecordRef)).resolves.toEqual({
      decision: "tombstoned",
      securePiiRecordRef: stored.securePiiRecordRef,
    });
    expect(vault.tombstoneCalls[0]).toEqual({
      p_secure_pii_record_ref: stored.securePiiRecordRef,
      p_customer_id: customerId,
      p_execution_scope_sha256: executionScopeSha256,
    });
    await expect(repository.load(loadInput(stored.providerBinding)))
      .resolves.toEqual({ decision: "not_found" });

    const recoveryVault = new MemoryVault();
    recoveryVault.commitTombstoneThenThrow = true;
    const recoveryRepository = createSubject(recoveryVault).repository;
    const recoveryStored = await recoveryRepository.createAndStore(createInput);
    await expect(recoveryRepository.tombstone(recoveryStored.securePiiRecordRef))
      .resolves.toMatchObject({ decision: "tombstoned" });
  });

  it("normalizes vault failures and malformed results without leaking plaintext", async () => {
    const failedVault = new MemoryVault();
    failedVault.failLoad = true;
    const failedRepository = createSubject(failedVault).repository;
    const prepared = failedRepository.create(createInput);
    const failure = await failedRepository.store(prepared).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FlightConsumerPiiRepositoryError);
    for (const marker of plaintextMarkers) expect(String(failure)).not.toContain(marker);

    const malformedVault = new MemoryVault();
    malformedVault.malformedStoreResult = [{ decision: "created", secure_pii_record_ref: "bad" }];
    const malformedRepository = createSubject(malformedVault).repository;
    const malformedPrepared = malformedRepository.create(createInput);
    await expect(malformedRepository.store(malformedPrepared)).resolves.toMatchObject({
      decision: "already_stored",
    });
  });

  it("uses the narrow one-hour retention policy", () => {
    expect(FLIGHT_CONSUMER_PII_RETENTION_SECONDS).toBe(3_600);
  });
});
