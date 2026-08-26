import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  createInjectedStagedFlightConsumerPreviewOfferEvidenceRepository,
} from "../lib/flights/consumer-preview/offer-evidence-staging.server";
import { createFlightConsumerOfferEvidenceKeyring } from "../lib/flights/consumer-preview/evidence-crypto.server";
import { sha256FlightEvidence } from "../lib/flights/runtime-safety";

const now = "2026-08-25T12:00:00.000Z";
const expires = "2026-08-25T12:45:00.000Z";
const raw = Buffer.from('{"data":{"offers":[]}}', "utf8");

describe("Flight Consumer Preview offer-evidence staging", () => {
  it("captures only the encrypted RPC envelope and supports one-time take", async () => {
    const customerId = randomUUID();
    const searchId = randomUUID();
    const offerId = randomUUID();
    const scope = { tenantId: "tenant_iratepilot_preview_0001", commerceId: searchId, actorId: customerId } as const;
    const search = {
      origin: "ORD",
      destination: "MIA",
      departureDate: "2026-11-05",
      returnDate: null,
      cabin: "economy" as const,
      passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
    };
    const rawBodyBase64 = raw.toString("base64");
    const rawBodyDigest = createHash("sha256").update(raw).digest("hex");
    const base = {
      version: "duffel-durable-offer-evidence-record-v1" as const,
      stage: "initial" as const,
      scope,
      localOfferId: "offer.local.00000001",
      search,
      observedAt: now,
      retentionExpiresAt: expires,
      predecessorReceiptDigest: null,
      rawBodyBase64,
      rawBodyDigest,
      evidenceDigest: "a".repeat(64),
      snapshotDigest: "b".repeat(64),
    };
    const record = {
      ...base,
      recordDigest: sha256FlightEvidence(base as never),
    };
    const staged = createInjectedStagedFlightConsumerPreviewOfferEvidenceRepository({
      identity: {
        customerId,
        searchId,
        offerId,
        localOfferId: record.localOfferId,
        executionScopeSha256: "c".repeat(64),
        evidenceKeyVersion: "preview-v1",
      },
      keyring: createFlightConsumerOfferEvidenceKeyring({
        keyVersion: "preview-v1",
        encryptionKeyBase64Url: Buffer.alloc(32, 1).toString("base64url"),
        hmacKeyBase64Url: Buffer.alloc(32, 2).toString("base64url"),
      }),
      loader: { async load() { return []; } },
      readTrustedTime: () => now,
    });
    const stored = await staged.repository.storeOfferEvidence(record, scope);
    expect(stored.decision).toBe("stored");
    const parameters = staged.takePreparedEvidence();
    expect(parameters).toMatchObject({
      p_customer_id: customerId,
      p_search_id: searchId,
      p_offer_id: offerId,
      p_stage: "initial",
      p_receipt_sha256: stored.receiptDigest,
      p_key_version: "preview-v1",
    });
    expect(parameters.p_ciphertext_base64url).not.toContain(rawBodyBase64);
    expect(JSON.stringify(parameters)).not.toContain(raw.toString("utf8"));
    expect(() => staged.takePreparedEvidence()).toThrow("could not be staged");
  });
});
