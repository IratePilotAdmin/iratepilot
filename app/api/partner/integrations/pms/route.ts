import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { pmsConnectionSchema } from "@/lib/validation";
import { pmsProviders } from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

async function approvedPartner(auth: Awaited<ReturnType<typeof requireRole>>) {
  if ("error" in auth) return null;
  const result = await auth.supabase
    .from("partners")
    .select("id,status")
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.status === "approved" ? result.data : null;
}

export async function GET() {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const partner = await approvedPartner(auth);
    if (!partner) return NextResponse.json({ error: "An approved partner account is required." }, { status: 403 });

    const [propertiesResult, connectionsResult] = await Promise.all([
      auth.supabase.from("properties").select("id,name,active").eq("partner_id", partner.id).order("name"),
      auth.supabase.from("property_pms_connections").select("property_id,provider_id,external_property_code,connection_status,last_validated_at,updated_at"),
    ]);
    if (propertiesResult.error) throw propertiesResult.error;
    if (connectionsResult.error) throw connectionsResult.error;
    const connections = new Map((connectionsResult.data ?? []).map((item) => [item.property_id, item]));

    return NextResponse.json({
      providers: pmsProviders.map(({ id, name, vendor, certificationRequired }) => ({ id, name, vendor, certificationRequired })),
      properties: (propertiesResult.data ?? []).map((property) => ({ ...property, connection: connections.get(property.id) ?? null })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Partner PMS connections could not be loaded", error);
    return NextResponse.json({ error: "PMS connections could not be loaded." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const parsed = pmsConnectionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose a property, PMS provider, and valid property code." }, { status: 400 });

  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const partner = await approvedPartner(auth);
    if (!partner) return NextResponse.json({ error: "An approved partner account is required." }, { status: 403 });
    const property = await auth.supabase.from("properties").select("id").eq("id", parsed.data.propertyId).eq("partner_id", partner.id).maybeSingle();
    if (property.error) throw property.error;
    if (!property.data) return NextResponse.json({ error: "Property not found." }, { status: 404 });

    const { data, error } = await auth.supabase.from("property_pms_connections").upsert({
      property_id: parsed.data.propertyId,
      provider_id: parsed.data.providerId,
      external_property_code: parsed.data.externalPropertyCode,
      connection_status: "credentials_pending",
      last_validated_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "property_id" }).select("property_id,provider_id,external_property_code,connection_status,last_validated_at,updated_at").single();
    if (error) throw error;
    return NextResponse.json({ data, message: "PMS details saved. iRatePilot will coordinate credentials and validation without storing secrets here." });
  } catch (error) {
    console.error("Partner PMS connection could not be saved", error);
    return NextResponse.json({ error: "The PMS connection could not be saved." }, { status: 503 });
  }
}
