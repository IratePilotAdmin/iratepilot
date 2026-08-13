import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolvePartnerIntegrationAccess } from "@/lib/partner/integration-access";
import { synxisOnboardingRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: noStoreHeaders },
    );
    const accessResult = await resolvePartnerIntegrationAccess(auth);
    if (accessResult.migrationRequired) return NextResponse.json(
      { error: "Apply SynXis migrations through 046 before using delegated onboarding." },
      { status: 503, headers: noStoreHeaders },
    );
    if (!accessResult.access) return NextResponse.json(
      { error: "Approved partner integration access is required." },
      { status: 403, headers: noStoreHeaders },
    );
    const access = accessResult.access;

    const propertiesResult = await auth.supabase.from("properties")
      .select("id,name,active")
      .eq("partner_id", access.partnerId)
      .order("name");
    if (propertiesResult.error) throw propertiesResult.error;
    const propertyIds = (propertiesResult.data ?? []).map((property) => property.id);
    const requestsResult = propertyIds.length === 0
      ? { data: [], error: null }
      : await auth.supabase.from("property_synxis_onboarding_requests")
        .select("property_id,synxis_hotel_id,requester_role,hotel_authorized,connection_status,last_validated_at,updated_at")
        .in("property_id", propertyIds);
    if (requestsResult.error?.code === "42P01") {
      return NextResponse.json(
        { error: "Apply SynXis migration 045 before using property onboarding." },
        { status: 503, headers: noStoreHeaders },
      );
    }
    if (requestsResult.error) throw requestsResult.error;
    const requests = new Map((requestsResult.data ?? []).map((item) => [item.property_id, item]));

    return NextResponse.json({
      accessRole: access.role,
      properties: (propertiesResult.data ?? []).map((property) => ({
        ...property,
        synxisRequest: requests.get(property.id) ?? null,
      })),
    }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Partner SynXis onboarding requests could not be loaded", error);
    return NextResponse.json(
      { error: "SynXis onboarding requests could not be loaded." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: noStoreHeaders },
    );
    const accessResult = await resolvePartnerIntegrationAccess(auth);
    if (accessResult.migrationRequired) return NextResponse.json(
      { error: "Apply SynXis migrations through 046 before using delegated onboarding." },
      { status: 503, headers: noStoreHeaders },
    );
    if (!accessResult.access) return NextResponse.json(
      { error: "Approved partner integration access is required." },
      { status: 403, headers: noStoreHeaders },
    );
    const access = accessResult.access;

    const parsed = synxisOnboardingRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter valid SynXis onboarding details." },
      { status: 400, headers: noStoreHeaders },
    );
    if (access.role !== "owner" && parsed.data.requesterRole !== access.role) {
      return NextResponse.json(
        { error: "The requesting representative must match your assigned partner-team role." },
        { status: 403, headers: noStoreHeaders },
      );
    }

    const property = await auth.supabase.from("properties")
      .select("id")
      .eq("id", parsed.data.propertyId)
      .eq("partner_id", access.partnerId)
      .maybeSingle();
    if (property.error) throw property.error;
    if (!property.data) return NextResponse.json(
      { error: "Property not found." },
      { status: 404, headers: noStoreHeaders },
    );

    const stored = await auth.supabase.from("property_synxis_onboarding_requests").upsert({
      property_id: parsed.data.propertyId,
      synxis_hotel_id: parsed.data.synxisHotelId,
      requester_role: parsed.data.requesterRole,
      hotel_authorized: true,
      connection_status: "vendor_approval_pending",
      requested_by: auth.user.id,
      last_validated_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "property_id" })
      .select("property_id,synxis_hotel_id,requester_role,hotel_authorized,connection_status,last_validated_at,updated_at")
      .single();
    if (stored.error?.code === "42P01") return NextResponse.json(
      { error: "Apply SynXis migration 045 before using property onboarding." },
      { status: 503, headers: noStoreHeaders },
    );
    if (stored.error) throw stored.error;

    return NextResponse.json({
      data: stored.data,
      message: "SynXis onboarding request saved for administrator and Sabre review.",
    }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Partner SynXis onboarding request could not be saved", error);
    return NextResponse.json(
      { error: "The SynXis onboarding request could not be saved." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
