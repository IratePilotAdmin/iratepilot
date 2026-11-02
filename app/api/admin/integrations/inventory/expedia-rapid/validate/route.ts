import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { InventorySupplierResponseError } from "@/services/hotel-suppliers/inventory-response.server";
import { InventorySandboxTransportError } from "@/services/hotel-suppliers/inventory-sandbox-transport.server";
import {
  ExpediaRapidSandboxValidationError,
  runExpediaRapidSandboxValidation,
} from "@/services/hotel-suppliers/expedia-rapid-sandbox-validation.server";

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
    .select("tested_at,checkin,checkout,hotel_count,rate_count,deployment_revision")
    .eq("supplier_id", "expedia-rapid")
    .eq("validation_kind", "hotel_search")
    .order("tested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Saved Expedia Rapid validation evidence could not be loaded." }, {
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
    const result = await runExpediaRapidSandboxValidation({ environment: process.env });
    const { error } = await createAdminClient()
      .from("inventory_supplier_validation_evidence")
      .insert({
        supplier_id: "expedia-rapid",
        environment: "sandbox",
        validation_kind: "hotel_search",
        result: "passed",
        checkin: result.checkin,
        checkout: result.checkout,
        hotel_count: result.hotelCount,
        rate_count: result.rateCount,
        tested_by: auth.user.id,
        tested_at: result.testedAt,
        deployment_revision: deploymentRevision(),
      });
    if (error) {
      return NextResponse.json({
        ...result,
        validationPassed: true,
        evidenceRecorded: false,
        error: "Expedia Rapid sandbox search passed, but its evidence could not be saved.",
      }, { status: 503, headers: noStoreHeaders });
    }

    const { error: siteReviewError } = await createAdminClient()
      .from("expedia_b2c_site_review_receipts")
      .insert([
        {
          requirement_code: "SP1",
          decision: "verified",
          evidence_reference: `Expedia Rapid sandbox family-occupancy search ${result.testedAt.slice(0, 10)}`,
          verification_notes: `A successful read-only Expedia Rapid sandbox availability response was returned for ${result.adultCount} adults and ${result.childAgeCount} synthetic child ages. The request encoded and transmitted every supplied child age. No booking or payment was created.`,
          reviewed_by: auth.user.id,
          reviewed_at: result.testedAt,
          deployment_revision: deploymentRevision(),
        },
        {
          requirement_code: "TR2",
          decision: "verified",
          evidence_reference: `Expedia Rapid sandbox traveler-country search ${result.testedAt.slice(0, 10)}`,
          verification_notes: `A successful read-only Expedia Rapid sandbox availability response was returned after the request builder validated and transmitted traveler country_code=${result.travelerCountryCode}. No booking or payment was created.`,
          reviewed_by: auth.user.id,
          reviewed_at: result.testedAt,
          deployment_revision: deploymentRevision(),
        },
      ]);
    if (siteReviewError) {
      return NextResponse.json({
        ...result,
        validationPassed: true,
        evidenceRecorded: true,
        siteReviewEvidenceRecorded: false,
        error: "Expedia Rapid sandbox family search passed, but its SP1 and TR2 evidence could not be saved.",
      }, { status: 503, headers: noStoreHeaders });
    }
    return NextResponse.json({
      ...result,
      validationPassed: true,
      evidenceRecorded: true,
      siteReviewEvidenceRecorded: true,
      message: "Expedia Rapid sandbox family search passed, and its search, SP1, and TR2 evidence were saved. No booking or payment was created.",
    }, { headers: noStoreHeaders });
  } catch (error) {
    const configurationError = (error instanceof ExpediaRapidSandboxValidationError
      && error.code === "credentials_not_ready")
      || (error instanceof InventorySandboxTransportError
        && ["disabled", "invalid_enablement", "credentials_not_ready"].includes(error.code));
    const supplierRejected = error instanceof InventorySupplierResponseError
      || error instanceof InventorySandboxTransportError
      || error instanceof ExpediaRapidSandboxValidationError;

    return NextResponse.json({
      error: configurationError
        ? "Expedia Rapid sandbox validation is not configured. Partner approval and issued sandbox credentials are required."
        : supplierRejected
          ? "Expedia Rapid sandbox validation did not pass. Try again later."
          : "Expedia Rapid sandbox validation could not be completed.",
    }, {
      status: configurationError ? 409 : 502,
      headers: noStoreHeaders,
    });
  }
}
