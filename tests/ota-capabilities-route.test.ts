import { afterEach, describe, expect, it } from "vitest";
import { GET, OPTIONS } from "../app/api/ota/capabilities/route";

const previousFlag = process.env.IRATEPILOT_PMS_ARI_ENABLED;

afterEach(() => {
  if (previousFlag === undefined) delete process.env.IRATEPILOT_PMS_ARI_ENABLED;
  else process.env.IRATEPILOT_PMS_ARI_ENABLED = previousFlag;
});

describe("public OTA capabilities route", () => {
  it("documents the native receiver without claiming traffic is enabled", async () => {
    delete process.env.IRATEPILOT_PMS_ARI_ENABLED;
    const response = GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.nativePmsAri).toMatchObject({
      endpoint: "/api/pms/ari",
      implementation: "available",
      trafficEnabled: false,
      currency: ["USD"],
      restrictions: false,
    });
    expect(body.nativePmsAri.activationRequires).toContain("authorized sandbox round trip");
    expect(body.externalOtaProviders).toMatchObject({
      status: "not_connected",
      providers: [
        { id: "booking_com", status: "development_only" },
        { id: "expedia", status: "not_implemented" },
        { id: "agoda", status: "not_implemented" },
        { id: "airbnb", status: "not_implemented" },
        { id: "google_hotel", status: "not_implemented" },
      ],
    });
    const bookingCom = body.externalOtaProviders.providers[0];
    expect(bookingCom.implemented).toContain("reservation parsing and encrypted inbox staging");
    expect(bookingCom.implemented).toContain("account-scoped database lease for serialized token refresh across app instances");
    expect(bookingCom.implemented).toContain("bearer-protected, disabled-by-default test poll-and-stage worker");
    expect(bookingCom.implemented).toContain("service-role leased inbox processing with bounded retry and review states");
    expect(bookingCom.implemented).toContain("guarded single-room and atomic multi-room create/modify imports for supported USD pay-at-property folios");
    expect(bookingCom.implemented).toContain("guarded cancellation handling and provider acknowledgement only after a matching durable PMS receipt");
    expect(bookingCom.implemented).toContain("fail-closed review for unsupported payment modes, currencies, tax/fee lines, and multi-room changes or cancellations");
    expect(bookingCom.missing).toContain("recurring reservation-poll schedule at a cadence suitable for channel operations");
    expect(bookingCom.missing).toContain("recurring PMS-import schedule at a cadence suitable for channel operations");
    expect(bookingCom.missing).toContain("operator tooling to resolve held OTA financial and mapping cases");
    expect(bookingCom.missing).toContain("hosted rehearsal migration verification and deployed worker schedules");
    expect(bookingCom.missing).toContain("provider certification and authorized end-to-end acceptance");
    expect(bookingCom.implemented).toContain("versioned credential encryption and single-envelope re-encryption helper");
    expect(bookingCom.implemented).toContain("bounded service-role credential rotation worker with per-account leases and compare-and-swap writes");
    expect(bookingCom.implemented).toContain("bounded 30-day PII purge for successfully imported reservation messages with a daily Vercel schedule (feature-flagged off by default)");
    expect(bookingCom.missing).toContain("rotation inventory and recovery-copy verification before old-key removal");
    expect(bookingCom.missing).toContain("property-specific retention policy and deployment/runtime enablement of the scheduled purge");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(body)).not.toContain("SIGNING_SECRET");
  });

  it("reports the server feature flag without exposing credentials", async () => {
    process.env.IRATEPILOT_PMS_ARI_ENABLED = "true";
    const body = await GET().json();
    expect(body.nativePmsAri.trafficEnabled).toBe(true);
    expect(JSON.stringify(body)).not.toContain(process.env.IRATEPILOT_PMS_ARI_SIGNING_SECRETS ?? "__no_secret__");
  });

  it("supports CORS preflight for the read-only capability document", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});
