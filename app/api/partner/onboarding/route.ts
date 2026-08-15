import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerHotelAccess, type PartnerHotelAccessResult, type PartnerHotelRole } from "@/lib/partner/hotel-access";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";
import { buildPartnerOnboarding, type OnboardingPartner, type OnboardingProperty } from "@/lib/partner/onboarding";

export async function GET(request: Request) {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    let partnerId: string | null = null;
    let accessRole: PartnerHotelRole = "owner";
    let hotelAccess: PartnerHotelAccessResult | null = null;
    if (auth.profile.role === "admin") {
      const owner = await auth.supabase.from("partners")
        .select("id")
        .eq("owner_id", auth.user.id)
        .maybeSingle();
      if (owner.error) throw owner.error;
      partnerId = owner.data?.id ?? null;
    } else {
      const requestedPartnerId = new URL(request.url).searchParams.get("partnerId");
      hotelAccess = await resolvePartnerHotelAccess(auth, requestedPartnerId);
      if (hotelAccess.selectionRequired) return NextResponse.json({
        hotelAccess: {
          options: hotelAccess.options,
          selectedPartnerId: null,
          selectionRequired: true,
        },
      });
      if (!hotelAccess.access) return NextResponse.json({
        error: hotelAccess.migrationRequired
          ? "Apply hotel-management migration 055 before using delegated onboarding access."
          : "Approved hotel-management access is required.",
      }, { status: hotelAccess.migrationRequired ? 503 : 403 });
      partnerId = hotelAccess.access.partnerId;
      accessRole = hotelAccess.access.role;
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
      hotelAccess: hotelAccess ? {
        options: hotelAccess.options,
        selectedPartnerId: hotelAccess.access?.partnerId ?? null,
        selectionRequired: false,
      } : null,
      ...buildPartnerOnboarding(partner as OnboardingPartner, prepared),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Partner onboarding failed", error);
    return NextResponse.json({ error: "Partner onboarding status could not be loaded." }, { status: 503 });
  }
}
