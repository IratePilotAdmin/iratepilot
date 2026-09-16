import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { partnerAcquisitionAttributionSchema } from "@/lib/partner/acquisition";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data, error } = await auth.supabase
      .from("partner_applications")
      .select("id,property_name,contact_name,email,property_type,status,created_at,star_rating,contact_role,phone,website_url,address_line1,city,region,postal_code,country,description,amenities,photo_source_url,additional_notes,hotel_authorized,content_rights_confirmed,information_accurate,property_id")
      .order("created_at", { ascending: false });

    if (error) throw error;
    const applications = data ?? [];
    const applicationIds = applications.map((application) => application.id);
    const attributionByApplication = new Map<string, unknown>();
    if (applicationIds.length > 0) {
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
    }
    return NextResponse.json({
      data: applications.map((application) => ({
        ...application,
        acquisition_attribution: attributionByApplication.get(application.id) ?? null,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Partner applications could not be loaded." },
      { status: 503 }
    );
  }
}
