import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePartnerHotelAccess } from "@/lib/partner/hotel-access";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";
import { propertySchema } from "@/lib/validation";

const hotelAccessError = (migrationRequired: boolean) => NextResponse.json({
  error: migrationRequired
    ? "Apply hotel-management migration 054 before using delegated property access."
    : "Approved hotel-management access is required.",
}, { status: migrationRequired ? 503 : 403 });

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let query = auth.supabase.from("properties").select("id,name,slug,type,star_rating,description,city,country,active,image_url,amenities,created_at,rooms(active,inventory(stay_date,available_units))").order("created_at", { ascending: false });
    if (auth.profile.role !== "admin") {
      const resolved = await resolvePartnerHotelAccess(auth);
      if (!resolved.access) return hotelAccessError(resolved.migrationRequired);
      query = query.eq("partner_id", resolved.access.partnerId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({
      data: (data ?? []).map((property) => ({
        id: property.id,
        name: property.name,
        slug: property.slug,
        type: property.type,
        star_rating: property.star_rating,
        description: property.description,
        city: property.city,
        country: property.country,
        active: property.active,
        image_url: property.image_url,
        amenities: property.amenities,
        created_at: property.created_at,
        readiness: getPropertyReadiness(property as PropertyReadinessInput)
      }))
    });
  } catch {
    return NextResponse.json({ error: "Property records are not configured." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = propertySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const admin = createAdminClient();

    let partner: { id: string; status: string } | null = null;
    if (auth.profile.role === "admin") {
      const partnerResult = await auth.supabase.from("partners").select("id,status").eq("owner_id", auth.user.id).maybeSingle();
      if (partnerResult.error) throw partnerResult.error;
      partner = partnerResult.data;
    } else {
      const resolved = await resolvePartnerHotelAccess(auth);
      if (!resolved.access) return hotelAccessError(resolved.migrationRequired);
      partner = { id: resolved.access.partnerId, status: "approved" };
    }
    if (!partner) {
      const { data, error } = await admin.from("partners").insert({
        owner_id: auth.user.id,
        business_name: parsed.data.name,
        status: "pending"
      }).select("id,status").single();
      if (error) throw error;
      partner = data;
    }
    if (!partner) throw new Error("Partner account could not be resolved.");

    const { data, error } = await admin.from("properties").insert({
      partner_id: partner.id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      type: parsed.data.type,
      star_rating: parsed.data.starRating,
      description: parsed.data.description,
      city: parsed.data.city,
      region: parsed.data.region || null,
      country: parsed.data.country,
      image_url: parsed.data.imageUrl,
      amenities: parsed.data.amenities,
      active: false
    }).select("id,name,slug,type,star_rating,city,country,active,image_url,amenities,created_at").single();
    if (error?.code === "23505") return NextResponse.json({ error: "That property URL is already in use." }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ data, message: "Property draft created. Add an active room and future inventory to make it ready for administrator review." }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The property could not be submitted." }, { status: 503 });
  }
}
