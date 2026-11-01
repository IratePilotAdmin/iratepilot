import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { InventorySupplierResponseError } from "@/services/hotel-suppliers/inventory-response.server";
import {
  RatehawkProductionSmokeError,
  runRatehawkProductionSmoke,
} from "@/services/hotel-suppliers/ratehawk-production-smoke.server";
import { RatehawkProductionTransportError } from "@/services/hotel-suppliers/ratehawk-production-transport.server";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStoreHeaders });
  const result = await createAdminClient().from("inventory_supplier_validation_evidence")
    .select("tested_at,checkin,checkout,hotel_count,rate_count,deployment_revision")
    .eq("supplier_id", "ratehawk")
    .eq("environment", "production")
    .eq("validation_kind", "production_smoke")
    .eq("result", "passed")
    .order("tested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) return NextResponse.json({ error: "Saved RateHawk production smoke evidence could not be loaded." }, { status: 503, headers: noStoreHeaders });
  return NextResponse.json({ evidenceAvailable: Boolean(result.data), latestEvidence: result.data ?? null }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStoreHeaders });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: noStoreHeaders });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || (body as { confirmation?: unknown }).confirmation !== "RUN RATEHAWK PRODUCTION SMOKE") {
    return NextResponse.json({ error: "Explicit RateHawk production smoke confirmation is required." }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const result = await runRatehawkProductionSmoke({ environment: process.env });
    const evidence = {
      supplier_id: "ratehawk",
      environment: "production",
      validation_kind: "production_smoke",
      result: "passed",
      checkin: result.checkin,
      checkout: result.checkout,
      hotel_count: result.hotelCount,
      rate_count: result.rateCount,
      price_changed: null,
      configuration_fingerprint: result.configurationFingerprint,
      tested_by: auth.user.id,
      tested_at: result.testedAt,
      deployment_revision: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null,
    };
    const insert = await createAdminClient().from("inventory_supplier_validation_evidence").insert(evidence);
    const safeResult = {
      testedAt: result.testedAt,
      checkin: result.checkin,
      checkout: result.checkout,
      hotelCount: result.hotelCount,
      rateCount: result.rateCount,
      validationPassed: true,
    };
    if (insert.error) return NextResponse.json({ ...safeResult, evidenceRecorded: false, error: "RateHawk production search passed, but its evidence could not be saved." }, { status: 503, headers: noStoreHeaders });
    return NextResponse.json({ ...safeResult, evidenceRecorded: true, message: "RateHawk production availability search passed and its evidence was saved. No booking or payment was created." }, { headers: noStoreHeaders });
  } catch (error) {
    const configurationError = error instanceof RatehawkProductionSmokeError
      ? error.code === "configuration_not_ready"
      : error instanceof RatehawkProductionTransportError
        && (error.code === "certification_not_approved" || error.code === "credentials_not_ready");
    const supplierError = error instanceof InventorySupplierResponseError;
    return NextResponse.json({
      error: configurationError
        ? "RateHawk production smoke is not authorized or configured."
        : supplierError
          ? "RateHawk production availability did not pass. Try again later."
          : "RateHawk production smoke could not be completed.",
    }, { status: configurationError ? 409 : 502, headers: noStoreHeaders });
  }
}
