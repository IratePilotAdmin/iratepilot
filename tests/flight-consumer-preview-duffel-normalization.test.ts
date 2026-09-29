import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeFlightConsumerPreviewDuffelOffer } from "../lib/flights/consumer-preview/duffel-normalization.server";
import { createFlightConsumerPreviewReferenceKeyring } from "../lib/flights/consumer-preview/reference-crypto.server";
import type { DuffelRehydratedOfferEvidence } from "../lib/flights/duffel-sandbox-contract";
import type { FlightOfferEvidenceStoreRpcParameters } from "../lib/flights/consumer-preview/offer-evidence-repository.server";

const sha = (character: string) => character.repeat(64);

describe("Flight Consumer Preview Duffel normalization", () => {
  it("projects encrypted provider identity and normalized digest-only offer evidence", () => {
    const customerId = randomUUID();
    const searchId = randomUUID();
    const offerId = randomUUID();
    const scopeSha = sha("a");
    const localOfferId = `duffel_offer_${"a".repeat(48)}`;
    const evidence = {
      version: "duffel-sanitized-offer-v1",
      providerOfferId: "off_000000000001",
      providerOfferIdDigest: sha("b"),
      requestDigest: sha("c"),
      requestPlanDigest: sha("d"),
      offerRequestIdDigest: sha("e"),
      cabin: "economy",
      liveMode: false,
      ownerName: "Duffel Airways",
      ownerIataCode: "ZZ",
      partial: false,
      requiresInstantPayment: true,
      paymentRequiredBy: null,
      priceGuaranteeExpiresAt: null,
      passengerIdentityDocumentsRequired: false,
      providerPassengerIdDigests: [sha("f")],
      total: { currency: "USD", amountMinor: 9442 },
      base: { currency: "USD", amountMinor: 7000 },
      tax: { currency: "USD", amountMinor: 2442 },
      retrievedAt: "2026-08-25T12:00:00.000Z",
      expiresAt: "2026-08-25T12:30:00.000Z",
      segments: [{ segmentId: "segment.00000001", marketingCarrier: "ZZ", marketingFlightNumber: "123", origin: "ORD", destination: "MIA", departsAt: "2026-11-05T10:00:00.000Z", arrivesAt: "2026-11-05T13:00:00.000Z" }],
      segmentIdentityDigests: [sha("1")],
      segmentPhaseIdentityDigests: [sha("2")],
      segmentOrderSharedTermsDigests: [sha("3")],
      sliceSegmentIdentityDigests: [[sha("1")]],
      slicePhaseIdentityDigests: [sha("4")],
      sliceTermsDigests: [sha("5")],
      operatingCarrierFlightNumbers: ["ZZ123"],
      carrierDisclosureDigests: [sha("6")],
      offerConditionsDigest: sha("7"),
      operatingCarrierDisclosures: [{ segmentId: "segment.00000001", operatingCarrierName: "Duffel Airways", operatingCarrierIataCode: "ZZ", marketingCarrierName: "Duffel Airways", marketingCarrierIataCode: "ZZ", operatingConditionsOfCarriageUrl: null, marketingConditionsOfCarriageUrl: null }],
      termsDigest: sha("8"),
      rawBodyDigest: sha("9"),
    } as const;
    const rehydrated = {
      stage: "initial",
      receiptDigest: sha("0"),
      recordDigest: sha("a"),
      scope: { tenantId: "tenant_iratepilot_preview_0001", commerceId: searchId, actorId: customerId },
      retentionExpiresAt: "2026-08-25T12:45:00.000Z",
      search: { origin: "ORD", destination: "MIA", departureDate: "2026-11-05", returnDate: null, cabin: "economy", passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 } },
      snapshot: { offerId: localOfferId, providerId: "duffel_sandbox_contract_v1", searchDigest: sha("c"), termsDigest: sha("8"), expiresAt: evidence.expiresAt, total: evidence.total, segments: evidence.segments, source: "provider_sandbox" },
      evidence,
    } as unknown as DuffelRehydratedOfferEvidence;
    const staged = {
      p_customer_id: customerId,
      p_search_id: searchId,
      p_offer_id: offerId,
      p_execution_scope_sha256: scopeSha,
      p_stage: "initial",
      p_predecessor_receipt_sha256: null,
      p_observed_at: evidence.retrievedAt,
      p_retention_expires_at: rehydrated.retentionExpiresAt,
      p_raw_body_sha256: evidence.rawBodyDigest,
      p_evidence_sha256: sha("b"),
      p_snapshot_sha256: sha("c"),
      p_record_sha256: rehydrated.recordDigest,
      p_receipt_sha256: rehydrated.receiptDigest,
      p_key_version: "preview-v1",
      p_iv_base64url: "A".repeat(16),
      p_auth_tag_base64url: "B".repeat(22),
      p_ciphertext_base64url: "C".repeat(32),
      p_aad_sha256: sha("d"),
      p_record_hmac_sha256: sha("e"),
    } satisfies FlightOfferEvidenceStoreRpcParameters;
    const normalized = normalizeFlightConsumerPreviewDuffelOffer({
      customerId,
      offerId,
      executionScopeSha256: scopeSha,
      rehydrated,
      stagedEvidence: staged,
      referenceKeyring: createFlightConsumerPreviewReferenceKeyring({
        keyVersion: "preview-v1",
        encryptionKeyBase64Url: Buffer.alloc(32, 3).toString("base64url"),
        hmacKeyBase64Url: Buffer.alloc(32, 4).toString("base64url"),
      }),
    });
    expect(normalized).toMatchObject({
      offer_id: offerId,
      local_offer_id: localOfferId,
      provider_offer_ref_ciphertext: expect.stringMatching(/^enc:v1:/),
      provider_payload_sha256: evidence.rawBodyDigest,
      currency: "USD",
      base_fare_cents: 7000,
      tax_cents: 2442,
      fee_cents: 0,
      total_cents: 9442,
      validating_carrier: "ZZ",
      segments: [{ duration_minutes: 180, journey_direction: "outbound", operating_carrier: "ZZ" }],
      evidence: { receipt_sha256: rehydrated.receiptDigest, ciphertext_base64url: staged.p_ciphertext_base64url },
    });
    expect(normalized.local_offer_id).not.toBe(normalized.offer_id);
    expect(JSON.stringify(normalized)).not.toContain(evidence.providerOfferId);
  });
});
