import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import {
  OracleOperaConnectionTestError,
  testOracleOperaSandboxConnection,
} from "@/services/hotel-suppliers/oracle-opera/connection-test";
import { loadOracleOperaConfig } from "@/services/hotel-suppliers/oracle-opera/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const ORACLE_OPERA_PREVIEW_PROBE_CONFIRMATION =
  "RUN_ORACLE_OHIP_PREVIEW_READ_ONLY_PROBE";

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return privateJson({ error: "Not found." }, 404);
  }
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return privateJson({ error: auth.error }, auth.status);
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length < 2 || rawBody.length > 128) {
      return privateJson({ error: "Invalid request." }, 400);
    }
    body = JSON.parse(rawBody);
  } catch {
    return privateJson({ error: "Invalid request." }, 400);
  }
  if (
    body === null
    || typeof body !== "object"
    || Array.isArray(body)
    || Object.getPrototypeOf(body) !== Object.prototype
    || Object.keys(body).length !== 1
    || !("confirmation" in body)
    || (body as { confirmation?: unknown }).confirmation !== ORACLE_OPERA_PREVIEW_PROBE_CONFIRMATION
  ) {
    return privateJson({ error: "Exact Preview probe confirmation is required." }, 400);
  }

  try {
    const hotelId = process.env.PMS_ORACLE_OPERA_HOTEL_ID?.trim();
    if (!hotelId) {
      return privateJson({
        passed: false,
        detailCode: "oracle_opera_configuration_invalid",
      }, 503);
    }

    const result = await testOracleOperaSandboxConnection({
      ...loadOracleOperaConfig(process.env),
      hotelId,
    });
    return privateJson({
      passed: true,
      detailCode: "oracle_opera_titles_read_succeeded",
      hotelCount: result.hotelCount,
    });
  } catch (error) {
    return privateJson({
      passed: false,
      detailCode: error instanceof OracleOperaConnectionTestError
        ? error.detailCode
        : "oracle_opera_configuration_invalid",
    }, 503);
  }
}
