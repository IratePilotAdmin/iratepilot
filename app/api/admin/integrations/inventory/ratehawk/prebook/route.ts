import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { InventorySupplierResponseError } from "@/services/hotel-suppliers/inventory-response.server";
import { InventorySandboxTransportError } from "@/services/hotel-suppliers/inventory-sandbox-transport.server";
import { runRatehawkSandboxPrebookEvidence } from "@/services/hotel-suppliers/ratehawk-prebook-evidence.server";
import { RatehawkSandboxPrebookError } from "@/services/hotel-suppliers/ratehawk-prebook-validation.server";
import { RatehawkSandboxValidationError } from "@/services/hotel-suppliers/ratehawk-sandbox-validation.server";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

function deploymentRevision() {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return revision && /^[a-f0-9]{7,64}$/i.test(revision) ? revision : null;
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStoreHeaders });
  }

  const { data, error } = await createAdminClient()
    .from("inventory_supplier_validation_evidence")
    .select("tested_at,checkin,checkout,hotel_count,rate_count,price_changed,deployment_revision")
    .eq("supplier_id", "ratehawk")
    .eq("validation_kind", "hotel_prebook")
    .order("tested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Saved RateHawk prebook evidence could not be loaded." }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }
  return NextResponse.json({ evidenceAvailable: Boolean(data), latestEvidence: data ?? null }, {
    headers: noStoreHeaders,
  });
}

export async function POST() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStoreHeaders });
  }

  try {
    const result = await runRatehawkSandboxPrebookEvidence({ environment: process.env });
    const { error } = await createAdminClient()
      .from("inventory_supplier_validation_evidence")
      .insert({
        supplier_id: "ratehawk",
        environment: "sandbox",
        validation_kind: "hotel_prebook",
        result: "passed",
        checkin: result.checkin,
        checkout: result.checkout,
        hotel_count: result.hotelCount,
        rate_count: result.rateCount,
        price_changed: result.priceChanged,
        tested_by: auth.user.id,
        tested_at: result.testedAt,
        deployment_revision: deploymentRevision(),
      });
    if (error) {
      return NextResponse.json({
        ...result,
        validationPassed: true,
        evidenceRecorded: false,
        error: "RateHawk sandbox prebook passed, but its evidence could not be saved.",
      }, { status: 503, headers: noStoreHeaders });
    }
    return NextResponse.json({
      ...result,
      validationPassed: true,
      evidenceRecorded: true,
      message: "RateHawk sandbox search and prebook passed. No booking or payment was created.",
    }, { headers: noStoreHeaders });
  } catch (error) {
    const configurationError = (error instanceof RatehawkSandboxValidationError
      && error.code === "credentials_not_ready")
      || (error instanceof RatehawkSandboxPrebookError && error.code === "credentials_not_ready")
      || (error instanceof InventorySandboxTransportError
        && ["disabled", "invalid_enablement", "credentials_not_ready"].includes(error.code));
    const supplierRejected = error instanceof InventorySupplierResponseError
      || error instanceof InventorySandboxTransportError
      || error instanceof RatehawkSandboxValidationError
      || error instanceof RatehawkSandboxPrebookError;

    return NextResponse.json({
      error: configurationError
        ? "RateHawk sandbox prebook validation is not configured."
        : supplierRejected
          ? "RateHawk sandbox prebook validation did not pass. Try again later."
          : "RateHawk sandbox prebook validation could not be completed.",
    }, { status: configurationError ? 409 : 502, headers: noStoreHeaders });
  }
}
