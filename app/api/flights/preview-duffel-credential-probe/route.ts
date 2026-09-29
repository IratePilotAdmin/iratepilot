import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  DUFFEL_PREVIEW_CREDENTIAL_PROBE_CONFIRMATION,
  executeDuffelPreviewCredentialProbe,
} from "@/lib/flights/duffel/preview-credential-probe.server";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function POST(request: Request) {
  if (
    process.env.VERCEL_ENV !== "preview"
    || process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED !== "true"
    || !hasExactExecutionNonce(request)
  ) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const length = Number(request.headers.get("content-length") ?? "0");
  if (contentType !== "application/json" || !Number.isSafeInteger(length) || length < 2 || length > 512) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (
    body === null
    || typeof body !== "object"
    || Array.isArray(body)
    || Object.getPrototypeOf(body) !== Object.prototype
    || Object.keys(body).length !== 1
    || !("confirmation" in body)
    || (body as { confirmation?: unknown }).confirmation !== DUFFEL_PREVIEW_CREDENTIAL_PROBE_CONFIRMATION
  ) return NextResponse.json({ error: "Exact credential-probe confirmation is required." }, { status: 400 });

  try {
    const result = await executeDuffelPreviewCredentialProbe(DUFFEL_PREVIEW_CREDENTIAL_PROBE_CONFIRMATION);
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const nestedFingerprint = error !== null && typeof error === "object"
      && "causeFingerprint" in error
      && typeof error.causeFingerprint === "string"
      && /^[0-9a-f]{16}$/.test(error.causeFingerprint)
      ? error.causeFingerprint
      : null;
    const failureFingerprint = createHash("sha256")
      .update(nestedFingerprint ?? (error instanceof Error ? error.message : "unknown-preview-probe-failure"), "utf8")
      .digest("hex")
      .slice(0, 16);
    return NextResponse.json({
      error: "Duffel Preview credential probe failed safely.",
      failureFingerprint,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
