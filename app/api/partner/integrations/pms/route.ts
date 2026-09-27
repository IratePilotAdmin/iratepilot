import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolvePartnerIntegrationAccess } from "@/lib/partner/integration-access";
import { pmsConnectionSchema } from "@/lib/validation";
import { pmsProviders } from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const integrationAccess = await resolvePartnerIntegrationAccess(auth);
    if (integrationAccess.migrationRequired) return NextResponse.json(
      { error: "Apply partner integration access migration 046 before configuring a PMS." },
      { status: 503 },
    );
    if (!integrationAccess.access) return NextResponse.json(
      { error: "Approved, owner-authorized partner integration access is required." },
      { status: 403 },
    );
    const partnerId = integrationAccess.access.partnerId;

    const [propertiesResult, connectionsResult] = await Promise.all([
      auth.supabase.from("properties").select("id,name,active").eq("partner_id", partnerId).order("name"),
      auth.supabase.from("property_pms_connections").select("property_id,provider_id,external_property_code,hotel_authorized,room_type_mapping,rate_plan_mapping,tax_fee_mapping,cancellation_policy_mapping,connection_status,last_validated_at,updated_at"),
    ]);
    if (propertiesResult.error) throw propertiesResult.error;
    if (connectionsResult.error) throw connectionsResult.error;
    const connections = new Map((connectionsResult.data ?? []).map((item) => [item.property_id, item]));

    return NextResponse.json({
      providers: pmsProviders.map(({ id, name, vendor, certificationRequired }) => ({ id, name, vendor, certificationRequired })),
      properties: (propertiesResult.data ?? []).map((property) => ({ ...property, connection: connections.get(property.id) ?? null })),
      accessRole: integrationAccess.access.role,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Partner PMS connections could not be loaded", error);
    return NextResponse.json({ error: "PMS connections could not be loaded." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const parsed = pmsConnectionSchema.safeParse(await request.json());
  if (!parsed.success) {
    const mappingIssue = parsed.error.issues.find((issue) => issue.message.includes("placeholder"));
    return NextResponse.json({
      error: mappingIssue?.message || "Choose a property, PMS provider, and valid property code.",
    }, { status: 400 });
  }

  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const integrationAccess = await resolvePartnerIntegrationAccess(auth);
    if (integrationAccess.migrationRequired) return NextResponse.json(
      { error: "Apply partner integration access migration 046 before configuring a PMS." },
      { status: 503 },
    );
    if (!integrationAccess.access) return NextResponse.json(
      { error: "Approved, owner-authorized partner integration access is required." },
      { status: 403 },
    );
    const property = await auth.supabase.from("properties").select("id").eq("id", parsed.data.propertyId).eq("partner_id", integrationAccess.access.partnerId).maybeSingle();
    if (property.error) throw property.error;
    if (!property.data) return NextResponse.json({ error: "Property not found." }, { status: 404 });

    const { data, error } = await auth.supabase.from("property_pms_connections").upsert({
      property_id: parsed.data.propertyId,
      provider_id: parsed.data.providerId,
      external_property_code: parsed.data.externalPropertyCode,
      hotel_authorized: parsed.data.hotelAuthorized,
      room_type_mapping: parsed.data.roomTypeMapping || null,
      rate_plan_mapping: parsed.data.ratePlanMapping || null,
      tax_fee_mapping: parsed.data.taxFeeMapping || null,
      cancellation_policy_mapping: parsed.data.cancellationPolicyMapping || null,
      connection_status: "credentials_pending",
      last_validated_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "property_id" }).select("property_id,provider_id,external_property_code,hotel_authorized,room_type_mapping,rate_plan_mapping,tax_fee_mapping,cancellation_policy_mapping,connection_status,last_validated_at,updated_at").single();
    if (error) throw error;
    return NextResponse.json({ data, message: "PMS details saved. iRatePilot will coordinate credentials and validation without storing secrets here." });
  } catch (error) {
    console.error("Partner PMS connection could not be saved", error);
    return NextResponse.json({ error: "The PMS connection could not be saved." }, { status: 503 });
  }
}

