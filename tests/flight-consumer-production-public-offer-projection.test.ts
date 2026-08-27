import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256,
  parseFlightConsumerProductionDuffelDurationMinutes,
  projectFlightConsumerProductionDuffelPublicOffers,
} from "../lib/flights/consumer-production/duffel-live-public-offer-projection.server";
import { deriveFlightConsumerProductionDuffelLiveOfferIdSha256 } from
  "../lib/flights/consumer-production/duffel-live-offer-reprice.server";

const digest = (character: string) => character.repeat(64);
const search = {
  adults: 1, cabin: "economy" as const, departureDate: "2026-09-10",
  destination: "LHR", origin: "ORD", returnDate: null,
};

describe("Flight Consumer Production Duffel public-offer projector", () => {
  it("accepts Duffel's official zero-padded ISO-8601 duration form", () => {
    expect(parseFlightConsumerProductionDuffelDurationMinutes("PT02H26M"))
      .toBe(146);
    expect(() => parseFlightConsumerProductionDuffelDurationMinutes("PT00H00M"))
      .toThrow();
  });
  it("rejects duplicate raw offer IDs that would omit a recorded Gate 105 source", async () => {
    const executionScopeSha256 = digest("1");
    const policySha256 = digest("2");
    const admissionPolicySha256 = digest("3");
    const cohortSha256 = digest("4");
    const subjectSha256 = digest("5");
    const requestSha256 =
      deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256({
        executionScopeSha256, policySha256, admissionPolicySha256,
        cohortSha256, subjectSha256, search,
      });
    const rawBody = new TextEncoder().encode(JSON.stringify({ data: {
      id: "orq_12345678", live_mode: true,
      offers: [{ id: "off_12345678" }, { id: "off_12345678" }],
    } }));
    const call = projectFlightConsumerProductionDuffelPublicOffers({
      admissionId: "00000000-0000-4000-8000-000000000001",
      admissionExecutionScopeSha256: executionScopeSha256,
      policySha256, admissionPolicySha256, cohortSha256, subjectSha256,
      idempotencySha256: digest("6"), requestSha256,
      admissionReceiptSha256: digest("7"),
      sourceShoppingAttemptId: "00000000-0000-4000-8000-000000000002",
      sourceShoppingExecutionScopeSha256: digest("8"),
      sourceResponseSha256: createHash("sha256").update(rawBody).digest("hex"),
      search, rawBody, observedAt: "2026-08-27T12:00:00.000Z",
      sources: ["off_12345678", "off_87654321"].map((id, index) => ({
        sourceId: `00000000-0000-4000-8000-00000000000${index + 3}`,
        offerIdSha256: deriveFlightConsumerProductionDuffelLiveOfferIdSha256(id),
        sourceOfferEvidenceSha256: index === 0 ? digest("9") : digest("a"),
        expiresAt: "2026-08-27T13:00:00.000Z",
      })),
      encryption: {
        version: "flight-consumer-live-duffel-offer-reference-encryption-v1",
        algorithm: "AES-256-GCM", ivBytes: 12, authTagBytes: 16,
        keyVersion: "kms-v1", logsPlaintext: false, persistsPlaintext: false,
        decryptImplemented: false, async encryptOfferReference() { throw new Error(); },
      },
    });
    await expect(call).rejects.toMatchObject({ reason: "source_binding_refused" });
  });
});
