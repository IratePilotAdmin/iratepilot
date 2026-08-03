import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";
import { propertySchema } from "@/lib/validation";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let query = auth.supabase.from("properties").select("id,name,slug,type,star_rating,description,city,country,active,image_url,amenities,created_at,rooms(active,inventory(stay_date,available_units))").order("created_at", { ascending: false });
    if (auth.profile.role !== "admin") {
      const { data: partner } = await auth.supabase.from("partners").select("id").eq("owner_id", auth.user.id).maybeSingle();
      if (!partner) return NextResponse.json({ data: [] });
      query = query.eq("partner_id", partner.id);
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

    const partnerResult = await auth.supabase.from("partners").select("id,status").eq("owner_id", auth.user.id).maybeSingle();
    if (partnerResult.error) throw partnerResult.error;
    let partner = partnerResult.data;
    if (auth.profile.role !== "admin" && (!partner || partner.status !== "approved")) {
      return NextResponse.json({ error: "An approved partner account is required to submit properties." }, { status: 403 });
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
      active: false
    }).select("id,name,slug,type,star_rating,city,country,active,image_url,amenities,created_at").single();
    if (error?.code === "23505") return NextResponse.json({ error: "That property URL is already in use." }, { status: 409 });
    if (error) throw error;
    return NextResponse.json({ data, message: "Property submitted for administrator review." }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The property could not be submitted." }, { status: 503 });
  }
}
