import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";

export const dynamic = "force-dynamic";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });
const referenceSchema = z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/);

const versionSchema = z.object({
  action: z.literal("record_version"),
  agreementVersion: z.string().regex(/^[a-z0-9][a-z0-9._-]{7,119}$/),
  templateDocumentSha256: sha256Schema,
  counselApprovalReference: z.string().trim().min(8).max(160),
  counselApprovedAt: timestampSchema,
  effectiveAt: timestampSchema,
  reviewNotes: z.string().trim().min(20).max(2000),
  counselApprovalConfirmed: z.literal(true),
}).strict();

const receiptSchema = z.object({
  action: z.literal("record_receipt"),
  propertyId: z.string().uuid(),
  applicationId: z.string().uuid(),
  agreementVersion: z.string().regex(/^[a-z0-9][a-z0-9._-]{7,119}$/),
  executionReference: referenceSchema,
  agreementDocumentSha256: sha256Schema,
  hotelSignatoryName: z.string().trim().min(2).max(120),
  hotelSignatoryTitle: z.string().trim().min(2).max(120),
  hotelSignedAt: timestampSchema,
  iratepilotSignedAt: timestampSchema,
  effectiveAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  representativeAuthorityVerified: z.literal(true),
  executedAgreementVerified: z.literal(true),
  reviewNotes: z.string().trim().min(20).max(2000),
}).strict();

const requestSchema = z.discriminatedUnion("action", [versionSchema, receiptSchema]);
const feeDisclosureVersion = "hotel_partner_fee_disclosure_13_3_2026-08-22_v1";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [versions, availableVersions, agreements, applications, properties] = await Promise.all([
      auth.supabase.from("hotel_commercial_agreement_versions")
        .select("agreement_version,template_document_sha256,counsel_approval_reference,counsel_approved_at,effective_at,evidence_summary,created_at")
        .order("effective_at", { ascending: false }),
      auth.supabase.rpc("list_available_counsel_approved_hotel_commercial_agreement_versions"),
      auth.supabase.from("hotel_commercial_agreement_evidence")
        .select("id,application_id,property_id,agreement_version,execution_reference,hotel_legal_business_name,hotel_signatory_name,hotel_signatory_title,hotel_signed_at,iratepilot_signed_at,effective_at,expires_at,evidence_summary,created_at")
        .order("created_at", { ascending: false }),
      auth.supabase.from("partner_applications")
        .select("id,property_id,property_name,legal_business_name,email,status,commercial_terms_acknowledged,commercial_terms_version_acknowledged"),
      auth.supabase.from("properties").select("id,name,active"),
    ]);
    const error = versions.error ?? availableVersions.error ?? agreements.error ?? applications.error ?? properties.error;
    if (error) throw error;

    const propertyNames = new Map((properties.data ?? []).map((property) => [property.id, property.name]));
    const eligibleApplications = (applications.data ?? [])
      .filter((application) => application.status === "approved"
        && Boolean(application.property_id)
        && Boolean(application.legal_business_name?.trim())
        && application.commercial_terms_acknowledged === true
        && application.commercial_terms_version_acknowledged === feeDisclosureVersion)
      .map((application) => ({
        ...application,
        property_name: propertyNames.get(application.property_id!) ?? application.property_name,
      }));

    return NextResponse.json({
      versions: versions.data ?? [],
      availableVersions: availableVersions.data ?? [],
      agreements: agreements.data ?? [],
      eligibleApplications,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Hotel agreement administration failed", error);
    return NextResponse.json({ error: "Hotel agreement records are not available." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const decoded = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(decoded);
    if (!parsed.success) {
      return NextResponse.json({ error: "Complete every required agreement evidence field with valid values." }, { status: 400 });
    }

    if (parsed.data.action === "record_version") {
      const { data, error } = await auth.supabase.rpc(
        "record_counsel_approved_hotel_commercial_agreement_version",
        {
          p_agreement_version: parsed.data.agreementVersion,
          p_template_document_sha256: parsed.data.templateDocumentSha256,
          p_counsel_approval_reference: parsed.data.counselApprovalReference,
          p_counsel_approved_at: parsed.data.counselApprovedAt,
          p_effective_at: parsed.data.effectiveAt,
          p_review_notes: parsed.data.reviewNotes,
        },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ data, message: "Counsel-approved agreement version recorded." });
    }

    const { data, error } = await auth.supabase.rpc("record_hotel_commercial_agreement_receipt", {
      p_property_id: parsed.data.propertyId,
      p_application_id: parsed.data.applicationId,
      p_agreement_version: parsed.data.agreementVersion,
      p_fee_disclosure_version: feeDisclosureVersion,
      p_execution_reference: parsed.data.executionReference,
      p_agreement_document_sha256: parsed.data.agreementDocumentSha256,
      p_hotel_signatory_name: parsed.data.hotelSignatoryName,
      p_hotel_signatory_title: parsed.data.hotelSignatoryTitle,
      p_hotel_signed_at: parsed.data.hotelSignedAt,
      p_iratepilot_signed_at: parsed.data.iratepilotSignedAt,
      p_effective_at: parsed.data.effectiveAt,
      p_expires_at: parsed.data.expiresAt,
      p_representative_authority_verified: parsed.data.representativeAuthorityVerified,
      p_executed_agreement_verified: parsed.data.executedAgreementVerified,
      p_review_notes: parsed.data.reviewNotes,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ data, message: "Executed hotel agreement evidence recorded." });
  } catch (error) {
    console.error("Hotel agreement evidence update failed", error);
    return NextResponse.json({ error: "Hotel agreement evidence could not be recorded." }, { status: 503 });
  }
}
