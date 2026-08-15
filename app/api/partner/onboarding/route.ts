import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerHotelAccess, type PartnerHotelRole } from "@/lib/partner/hotel-access";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";
import { buildPartnerOnboarding, type OnboardingPartner, type OnboardingProperty } from "@/lib/partner/onboarding";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    let partnerId: string | null = null;
    let accessRole: PartnerHotelRole = "owner";
    if (auth.profile.role === "admin") {
      const owner = await auth.supabase.from("partners")
        .select("id")
        .eq("owner_id", auth.user.id)
        .maybeSingle();
      if (owner.error) throw owner.error;
      partnerId = owner.data?.id ?? null;
    } else {
      const resolved = await resolvePartnerHotelAccess(auth);
      if (!resolved.access) return NextResponse.json({
        error: resolved.migrationRequired
          ? "Apply hotel-management migration 054 before using delegated onboarding access."
          : "Approved hotel-management access is required.",
      }, { status: resolved.migrationRequired ? 503 : 403 });
      partnerId = resolved.access.partnerId;
      accessRole = resolved.access.role;
    }
    if (!partnerId) return NextResponse.json({ error: "A partner account is required to view onboarding." }, { status: 403 });

    const admin = createAdminClient();
    const { data: partner, error: partnerError } = await admin.from("partners")
      .select("id,business_name,status,stripe_connect_status,software_plan,subscription_status")
      .eq("id", partnerId)
      .maybeSingle();
    if (partnerError) throw partnerError;
    if (!partner) return NextResponse.json({ error: "A partner account is required to view onboarding." }, { status: 403 });

    const { data: properties, error: propertyError } = await auth.supabase.from("properties")
      .select("id,name,active,image_url,amenities,rooms(active,inventory(stay_date,available_units))")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: true });
    if (propertyError) throw propertyError;
    const prepared = (properties || []).map((property) => ({
      id: property.id,
      name: property.name,
      active: property.active,
      readiness: getPropertyReadiness(property as PropertyReadinessInput),
    })) as OnboardingProperty[];
    return NextResponse.json({
      businessName: partner.business_name,
      accessRole,
      ...buildPartnerOnboarding(partner as OnboardingPartner, prepared),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Partner onboarding failed", error);
    return NextResponse.json({ error: "Partner onboarding status could not be loaded." }, { status: 503 });
  }
}
