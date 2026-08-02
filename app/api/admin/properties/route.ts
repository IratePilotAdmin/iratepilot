import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";
import { getLatestPropertyReview, type PropertyReview } from "@/lib/property-review";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase.from("properties")
      .select("id,name,slug,type,star_rating,city,country,active,image_url,amenities,created_at,partners(business_name),rooms(active,inventory(stay_date,available_units)),property_review_history(active,note,created_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({
      data: (data ?? []).map((property) => ({
        id: property.id,
        name: property.name,
        slug: property.slug,
        type: property.type,
        star_rating: property.star_rating,
        city: property.city,
        country: property.country,
        active: property.active,
        created_at: property.created_at,
        partners: property.partners,
        readiness: getPropertyReadiness(property as PropertyReadinessInput),
        latest_review: getLatestPropertyReview(property.property_review_history as PropertyReview[]),
      }))
    });
  } catch {
    return NextResponse.json({ error: "Property review is not configured." }, { status: 503 });
  }
}
