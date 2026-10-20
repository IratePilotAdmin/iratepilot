import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function GET() {
  return NextResponse.json({
    product: "iRatePilot OTA Connector API",
    contractVersion: 1,
    nativePmsAri: {
      endpoint: "/api/pms/ari",
      method: "POST",
      implementation: "available",
      trafficEnabled: process.env.IRATEPILOT_PMS_ARI_ENABLED === "true",
      authentication: "HMAC-SHA256 over timestamp, connection ID, and exact request body",
      maximumUpdatesPerBatch: 366,
      currency: ["USD"],
      restrictions: false,
      activationRequires: [
        "hosted receiver migration",
        "owner-approved property, room, and rate-plan mappings",
        "authorized sandbox round trip",
      ],
    },
    externalOtaProviders: {
      status: "not_connected",
      providers: [
        {
          id: "booking_com",
          status: "development_only",
          implemented: [
            "bounded ARI payload preparation and idempotent test outbox",
            "guarded Booking.com test transport",
            "encrypted, test-only machine-account credential vault and token exchange",
            "account-scoped database lease for serialized token refresh across app instances",
            "reservation parsing and encrypted inbox staging",
            "bearer-protected, disabled-by-default test poll-and-stage worker",
            "service-role leased inbox processing with bounded retry and review states",
            "guarded single-room and atomic multi-room create/modify imports for supported USD pay-at-property folios",
            "guarded cancellation handling and provider acknowledgement only after a matching durable PMS receipt",
            "fail-closed review for unsupported payment modes, currencies, tax/fee lines, and multi-room changes or cancellations",
            "versioned credential encryption and single-envelope re-encryption helper",
            "bounded service-role credential rotation worker with per-account leases and compare-and-swap writes",
            "bounded 30-day PII purge for successfully imported reservation messages with a daily Vercel schedule (feature-flagged off by default)",
          ],
          missing: [
            "approved Booking.com partner account and property credentials",
            "recurring reservation-poll schedule at a cadence suitable for channel operations",
            "recurring PMS-import schedule at a cadence suitable for channel operations",
            "operator tooling to resolve held OTA financial and mapping cases",
            "rotation inventory and recovery-copy verification before old-key removal",
            "property-specific retention policy and deployment/runtime enablement of the scheduled purge",
            "hosted rehearsal migration verification and deployed worker schedules",
            "provider certification and authorized end-to-end acceptance",
            "production transport and activation approval",
          ],
        },
        {
          id: "expedia",
          status: "not_implemented",
          implemented: [],
          missing: ["partner onboarding", "API adapter", "PMS booking import", "sandbox certification", "production deployment"],
        },
        ...["agoda", "airbnb", "google_hotel"].map((id) => ({
          id,
          status: "not_implemented",
          implemented: [],
          missing: ["provider-specific adapter", "partner approval", "end-to-end certification", "production deployment"],
        })),
      ],
    },
  }, { headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
