import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractVerifiedDuffelPreviewPassengerIds } from "../lib/flights/consumer-preview/duffel-evidence.server";
import { sha256FlightEvidence } from "../lib/flights/runtime-safety";

const passengerId = "pas_previewPassenger0001";
const digest = sha256FlightEvidence({ version: "duffel-passenger-id-v1", value: passengerId });
const rawBody = new TextEncoder().encode(JSON.stringify({
  data: { passengers: [{ id: passengerId, type: "adult" }] },
}));

describe("Flight Consumer Preview Duffel passenger evidence", () => {
  it("returns only passenger IDs covered by the sanitized evidence digests", () => {
    expect(extractVerifiedDuffelPreviewPassengerIds({
      rawBody,
      expectedPassengerIdDigests: [digest],
      expectedCount: 1,
    })).toEqual([passengerId]);
  });

  it("rejects substitutions, duplicates, count changes, and malformed JSON", () => {
    expect(() => extractVerifiedDuffelPreviewPassengerIds({
      rawBody,
      expectedPassengerIdDigests: ["a".repeat(64)],
      expectedCount: 1,
    })).toThrow();
    expect(() => extractVerifiedDuffelPreviewPassengerIds({
      rawBody: new TextEncoder().encode(JSON.stringify({ data: { passengers: [{ id: passengerId }, { id: passengerId }] } })),
      expectedPassengerIdDigests: [digest, digest],
      expectedCount: 2,
    })).toThrow();
    expect(() => extractVerifiedDuffelPreviewPassengerIds({
      rawBody,
      expectedPassengerIdDigests: [digest],
      expectedCount: 2,
    })).toThrow();
    expect(() => extractVerifiedDuffelPreviewPassengerIds({
      rawBody: new TextEncoder().encode("not-json"),
      expectedPassengerIdDigests: [digest],
      expectedCount: 1,
    })).toThrow();
  });
});
