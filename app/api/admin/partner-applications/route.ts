import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { partnerAcquisitionAttributionSchema } from "@/lib/partner/acquisition";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Authorization is established above. Use the server-only client for the
    // queue so a missing or stale production RLS policy cannot silently hide
    // submitted applications from an authorized administrator.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("partner_applications")
      .select("id,property_name,contact_name,email,property_type,status,created_at,star_rating,contact_role,phone,website_url,address_line1,city,region,postal_code,country,description,amenities,photo_source_url,additional_notes,hotel_authorized,content_rights_confirmed,information_accurate,commercial_terms_acknowledged,commercial_terms_version_acknowledged,property_id")
      .order("created_at", { ascending: false });

    if (error) throw error;
    const applications = data ?? [];
    const applicationIds = applications.map((application) => application.id);
    const attributionByApplication = new Map<string, unknown>();
    const verifiedApprovalApplicationIds = new Set<string>();
    if (applicationIds.length > 0) {
      // Drafts intentionally grant SELECT only to authenticated users. The
      // role check above and the draft RLS policy protect this attribution read.
      const { data: drafts, error: draftError } = await auth.supabase
        .from("partner_onboarding_drafts")
        .select("application_id,registration")
        .in("application_id", applicationIds);
      if (draftError) throw draftError;
      for (const draft of drafts ?? []) {
        if (!draft.application_id || attributionByApplication.has(draft.application_id)) continue;
        const registration = draft.registration && typeof draft.registration === "object"
          ? draft.registration as Record<string, unknown>
          : null;
        const parsed = partnerAcquisitionAttributionSchema.safeParse(registration?.attribution);
        if (parsed.success) attributionByApplication.set(draft.application_id, parsed.data);
      }

      const { data: reviewEvidence } = await auth.supabase
        .from("partner_application_review_evidence")
        .select("application_id,decision,legal_business_verified,representative_authority_verified,content_rights_verified,commercial_terms_acknowledgement_verified,inactive_draft_scope_confirmed")
        .in("application_id", applicationIds);
      for (const evidence of reviewEvidence ?? []) {
        if (evidence.decision === "approved"
          && evidence.legal_business_verified
          && evidence.representative_authority_verified
          && evidence.content_rights_verified
          && evidence.commercial_terms_acknowledgement_verified
          && evidence.inactive_draft_scope_confirmed) {
          verifiedApprovalApplicationIds.add(evidence.application_id);
        }
      }
    }
    return NextResponse.json({
      data: applications.map((application) => ({
        ...application,
        acquisition_attribution: attributionByApplication.get(application.id) ?? null,
        approval_evidence_verified: verifiedApprovalApplicationIds.has(application.id),
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Partner applications could not be loaded." },
      { status: 503 }
    );
  }
}
