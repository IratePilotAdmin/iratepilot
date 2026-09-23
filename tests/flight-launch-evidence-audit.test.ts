import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("flight launch evidence audit", () => {
  it("passes against the current sanitized evidence packet", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/audit-flight-launch-evidence.mjs"],
      { encoding: "utf8" },
    );
    expect(JSON.parse(output)).toEqual({
      version: "flight-launch-evidence-audit-v1",
      status: "pass",
      sanitized: true,
      candidateConnectors: 9,
      routePackets: 2,
      consumerReleaseAuthorized: false,
      providerTrafficEnabled: false,
      bookingEnabled: false,
      paymentEnabled: false,
      productionSourceIsFlightBranch: false,
      duffelResponseReceived: false,
    });
  });
});
