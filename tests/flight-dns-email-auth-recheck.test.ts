import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const evidence = JSON.parse(
  readFileSync(
    new URL("../docs/evidence/FLIGHT_DNS_EMAIL_AUTH_RECHECK_2026-09-24.json", import.meta.url),
    "utf8",
  ),
).evidence;

describe("Flight DNS and email-authentication recheck", () => {
  it("keeps the read-only evidence sanitized and truthful", () => {
    expect(evidence.sanitized).toBe(true);
    expect(evidence.secretValuesIncluded).toBe(false);
    expect(evidence.publicRecordValuesIncluded).toBe(false);
    expect(evidence.readOnly).toBe(true);
    expect(evidence.dnsObservations).toMatchObject({
      apexARecordPresent: true,
      wwwCnamePresent: true,
      mxRecordPresent: true,
      spfTxtPresent: true,
      resendDkimTxtPresent: true,
      dmarcTxtPresent: false,
    });
  });

  it("never converts DNS observations into authority", () => {
    expect(evidence.authorityBoundary).toEqual({
      dnsMutated: false,
      emailSent: false,
      consumerReleaseEnabled: false,
      providerTrafficEnabled: false,
      bookingEnabled: false,
      paymentEnabled: false,
    });
    expect(evidence.remainingRequirement).toContain("approved DMARC policy");
  });
});
