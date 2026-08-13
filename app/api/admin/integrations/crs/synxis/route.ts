import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { isVerifiedActivationDetail } from "@/services/hotel-suppliers/priority-readiness";
import {
  buildSynxisReadiness,
  type SynxisActivationEvidence,
} from "@/services/hotel-suppliers/synxis";

export const dynamic = "force-dynamic";

const providerId = "sabre-synxis";
const evidenceColumns = "vendor_approved,certification_environment_approved,property_mapped,sandbox_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact,verification_notes,updated_at";
const emptyEvidence = {
  vendorApproved: false,
  certificationEnvironmentApproved: false,
  propertyMapped: false,
  sandboxValidated: false,
  productionSmokeValidated: false,
  liveEnabled: false,
  vendorApprovalReference: "",
  approvedEnvironment: "",
  propertyCode: "",
  supportContact: "",
  verificationNotes: "",
};

type SynxisEvidenceDetails = Pick<
  typeof emptyEvidence,
  | "vendorApprovalReference"
  | "approvedEnvironment"
  | "propertyCode"
  | "supportContact"
  | "verificationNotes"
>;

function mapEvidence(row: Record<string, unknown> | null) {
  if (!row) return { ...emptyEvidence };
  return {
    vendorApproved: row.vendor_approved === true,
    certificationEnvironmentApproved: row.certification_environment_approved === true,
    propertyMapped: row.property_mapped === true,
    sandboxValidated: row.sandbox_validated === true,
    productionSmokeValidated: row.production_smoke_validated === true,
    liveEnabled: row.live_enabled === true,
    vendorApprovalReference: typeof row.vendor_approval_reference === "string" ? row.vendor_approval_reference : "",
    approvedEnvironment: typeof row.approved_environment === "string" ? row.approved_environment : "",
    propertyCode: typeof row.property_code === "string" ? row.property_code : "",
    supportContact: typeof row.support_contact === "string" ? row.support_contact : "",
    verificationNotes: typeof row.verification_notes === "string" ? row.verification_notes : "",
  };
}

function noStore(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return noStore({ error: auth.error }, { status: auth.status });

    const result = await createAdminClient()
      .from("synxis_crs_launch_evidence")
      .select(evidenceColumns)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (result.error?.code === "42P01") {
      const evidence = { ...emptyEvidence };
      return noStore({
        evidence,
        readiness: buildSynxisReadiness(process.env, evidence),
        evidenceTrackingAvailable: false,
        updatedAt: null,
      });
    }
    if (result.error) throw result.error;

    const evidence = mapEvidence(result.data);
    return noStore({
      evidence,
      readiness: buildSynxisReadiness(process.env, evidence),
      evidenceTrackingAvailable: true,
      updatedAt: result.data?.updated_at ?? null,
    });
  } catch (error) {
    console.error("SynXis CRS launch evidence read failed", error);
    return noStore({ error: "SynXis CRS launch evidence could not be loaded." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return noStore({ error: auth.error }, { status: auth.status });

    const body = await request.json() as {
      evidence?: Partial<Record<keyof SynxisActivationEvidence, unknown>>;
      details?: Partial<Record<keyof SynxisEvidenceDetails, unknown>>;
    };
    const patch = body.evidence ?? {};
    const details = body.details ?? {};
    const allowedEvidenceKeys = [
      "vendorApproved",
      "certificationEnvironmentApproved",
      "propertyMapped",
      "sandboxValidated",
      "productionSmokeValidated",
      "liveEnabled",
    ] as const;
    const allowedDetailKeys = [
      "vendorApprovalReference",
      "approvedEnvironment",
      "propertyCode",
      "supportContact",
      "verificationNotes",
    ] as const;

    if ((Object.keys(patch).length === 0 && Object.keys(details).length === 0)
      || Object.keys(patch).some((key) => !allowedEvidenceKeys.includes(key as typeof allowedEvidenceKeys[number]))
      || Object.values(patch).some((value) => typeof value !== "boolean")) {
      return noStore({ error: "Evidence must contain supported boolean SynXis launch gates." }, { status: 400 });
    }
    if (Object.keys(details).some((key) => !allowedDetailKeys.includes(key as typeof allowedDetailKeys[number]))
      || Object.values(details).some((value) => typeof value !== "string")) {
      return noStore({ error: "Evidence details must contain supported text fields." }, { status: 400 });
    }
    const detailLimits = {
      vendorApprovalReference: 500,
      approvedEnvironment: 200,
      propertyCode: 200,
      supportContact: 500,
      verificationNotes: 4000,
    } as const;
    if (Object.entries(details).some(([key, value]) =>
      (value as string).trim().length > detailLimits[key as keyof typeof detailLimits])) {
      return noStore({ error: "One or more evidence details exceed the permitted length." }, { status: 400 });
    }

    const admin = createAdminClient();
    const currentResult = await admin
      .from("synxis_crs_launch_evidence")
      .select(evidenceColumns)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (currentResult.error?.code === "42P01") {
      return noStore({ error: "Apply SynXis CRS launch-evidence migration 040 before recording evidence." }, { status: 503 });
    }
    if (currentResult.error) throw currentResult.error;

    const current = mapEvidence(currentResult.data);
    const next = {
      vendorApproved: patch.vendorApproved as boolean | undefined ?? current.vendorApproved,
      certificationEnvironmentApproved: patch.certificationEnvironmentApproved as boolean | undefined ?? current.certificationEnvironmentApproved,
      propertyMapped: patch.propertyMapped as boolean | undefined ?? current.propertyMapped,
      sandboxValidated: patch.sandboxValidated as boolean | undefined ?? current.sandboxValidated,
      productionSmokeValidated: patch.productionSmokeValidated as boolean | undefined ?? current.productionSmokeValidated,
      liveEnabled: patch.liveEnabled as boolean | undefined ?? current.liveEnabled,
    };

    if (patch.certificationEnvironmentApproved === true && !next.vendorApproved) {
      return noStore({ error: "Vendor approval is required before certification-environment approval." }, { status: 409 });
    }
    if (patch.propertyMapped === true && (!next.vendorApproved || !next.certificationEnvironmentApproved)) {
      return noStore({ error: "Vendor and certification-environment approval are required before property mapping." }, { status: 409 });
    }
    if (patch.sandboxValidated === true && !next.propertyMapped) {
      return noStore({ error: "Property mapping is required before sandbox validation." }, { status: 409 });
    }
    if (patch.productionSmokeValidated === true && !next.sandboxValidated) {
      return noStore({ error: "Sandbox validation is required before the production smoke test." }, { status: 409 });
    }
    if (patch.liveEnabled === true && !next.productionSmokeValidated) {
      return noStore({ error: "The production smoke test must pass before live traffic is enabled." }, { status: 409 });
    }

    if (!next.vendorApproved) {
      next.certificationEnvironmentApproved = false;
      next.propertyMapped = false;
      next.sandboxValidated = false;
      next.productionSmokeValidated = false;
      next.liveEnabled = false;
    } else if (!next.certificationEnvironmentApproved) {
      next.propertyMapped = false;
      next.sandboxValidated = false;
      next.productionSmokeValidated = false;
      next.liveEnabled = false;
    } else if (!next.propertyMapped) {
      next.sandboxValidated = false;
      next.productionSmokeValidated = false;
      next.liveEnabled = false;
    } else if (!next.sandboxValidated) {
      next.productionSmokeValidated = false;
      next.liveEnabled = false;
    } else if (!next.productionSmokeValidated) {
      next.liveEnabled = false;
    }

    const nextDetails = {
      vendorApprovalReference: typeof details.vendorApprovalReference === "string" ? details.vendorApprovalReference : current.vendorApprovalReference,
      approvedEnvironment: typeof details.approvedEnvironment === "string" ? details.approvedEnvironment : current.approvedEnvironment,
      propertyCode: typeof details.propertyCode === "string" ? details.propertyCode : current.propertyCode,
      supportContact: typeof details.supportContact === "string" ? details.supportContact : current.supportContact,
    };
    if (patch.liveEnabled === true
      && Object.values(nextDetails).some((value) => !isVerifiedActivationDetail(value))) {
      return noStore({ error: "Verified vendor approval, certification environment, real property code, and support contact details are required before live traffic is enabled." }, { status: 409 });
    }

    const updateResult = await admin.from("synxis_crs_launch_evidence").upsert({
      provider_id: providerId,
      vendor_approved: next.vendorApproved,
      certification_environment_approved: next.certificationEnvironmentApproved,
      property_mapped: next.propertyMapped,
      sandbox_validated: next.sandboxValidated,
      production_smoke_validated: next.productionSmokeValidated,
      live_enabled: next.liveEnabled,
      vendor_approval_reference: typeof details.vendorApprovalReference === "string" ? details.vendorApprovalReference.trim() || null : current.vendorApprovalReference || null,
      approved_environment: typeof details.approvedEnvironment === "string" ? details.approvedEnvironment.trim() || null : current.approvedEnvironment || null,
      property_code: typeof details.propertyCode === "string" ? details.propertyCode.trim() || null : current.propertyCode || null,
      support_contact: typeof details.supportContact === "string" ? details.supportContact.trim() || null : current.supportContact || null,
      verification_notes: typeof details.verificationNotes === "string" ? details.verificationNotes.trim() || null : current.verificationNotes || null,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }).select(evidenceColumns).single();
    if (updateResult.error) throw updateResult.error;

    const evidence = mapEvidence(updateResult.data);
    return noStore({
      evidence,
      readiness: buildSynxisReadiness(process.env, evidence),
      evidenceTrackingAvailable: true,
      updatedAt: updateResult.data.updated_at,
    });
  } catch (error) {
    console.error("SynXis CRS launch evidence update failed", error);
    return noStore({ error: "SynXis CRS launch evidence could not be updated." }, { status: 503 });
  }
}
