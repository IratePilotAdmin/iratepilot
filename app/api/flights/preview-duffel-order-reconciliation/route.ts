import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executeDuffelPreviewOrderReconciliation } from "@/lib/flights/duffel/preview-order-reconciliation.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function hasExactExecutionNonce(request: Request) {
  const expected = process.env.FLIGHT_DUFFEL_TEST_EXECUTION_NONCE;
  const supplied = request.headers.get("x-iratepilot-flight-test-nonce");
  if (
    typeof expected !== "string"
    || expected.length < 32
    || typeof supplied !== "string"
  ) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return suppliedBytes.length === expectedBytes.length
    && timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function GET(request: Request) {
  if (
    process.env.VERCEL_ENV !== "preview"
    || process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED !== "true"
    || process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED !== "false"
    || !hasExactExecutionNonce(request)
  ) return NextResponse.json(
    { error: "Not found." },
    { status: 404, headers: NO_STORE_HEADERS },
  );
  if (new URL(request.url).search !== "") {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const result = await executeDuffelPreviewOrderReconciliation();
    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const failureFingerprint = createHash("sha256")
      .update(
        error instanceof Error
          ? error.message
          : "unknown-preview-order-reconciliation-failure",
        "utf8",
      )
      .digest("hex")
      .slice(0, 16);
    return NextResponse.json({
      error: "Duffel Preview order reconciliation failed safely.",
      failureFingerprint,
    }, {
      status: 503,
      headers: NO_STORE_HEADERS,
    });
  }
}

export function HEAD() {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: "GET",
      "Cache-Control": "no-store",
    },
  });
}
