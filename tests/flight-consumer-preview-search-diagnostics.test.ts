import { describe, expect, it } from "vitest";

import { safeFlightConsumerPreviewCompletionDiagnostic } from
  "../lib/flights/consumer-preview/search-diagnostics";

describe("Consumer Flight Preview search diagnostics", () => {
  it("reports only SQLSTATE and an allowlisted constraint identifier", () => {
    const diagnostic = safeFlightConsumerPreviewCompletionDiagnostic({
      code: "23514",
      message: "new row violates check constraint \"flight_offer_segments_arrival_check\"",
      details: "Failing row contains secret ciphertext and customer identifiers.",
    });

    expect(diagnostic).toEqual({
      code: "23514",
      category: "constraint:flight_offer_segments_arrival_check",
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/ciphertext|customer|failing row/i);
  });

  it("maps reviewed function errors without returning their raw message", () => {
    const diagnostic = safeFlightConsumerPreviewCompletionDiagnostic({
      code: "P0001",
      message: "Flight offer cannot outlive its search: internal context must not escape",
    });

    expect(diagnostic).toEqual({ code: "P0001", category: "offer_outlives_search" });
    expect(JSON.stringify(diagnostic)).not.toContain("internal context");
  });

  it("collapses unknown or malformed errors to fixed categorical values", () => {
    expect(safeFlightConsumerPreviewCompletionDiagnostic({
      code: "not-safe",
      message: "credential=never-log-this",
    })).toEqual({ code: "unknown", category: "unclassified" });
    expect(safeFlightConsumerPreviewCompletionDiagnostic(null)).toEqual({
      code: "unknown",
      category: "unclassified",
    });
  });
});
