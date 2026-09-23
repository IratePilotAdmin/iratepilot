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
      status: "certification_required",
      providers: [],
    },
  }, { headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
