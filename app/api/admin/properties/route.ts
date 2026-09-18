import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { isHotelPublicationEnabled } from "@/lib/hotels/publication-gate";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase.from("properties")
      .select("id,name,slug,type,star_rating,city,country,active,image_url,amenities,created_at,listing_scope,direct_request_mode,commercial_terms_version,commercial_verified_at,commercial_verified_by,support_contact_email,partners(business_name,status),rooms(active,inventory(stay_date,available_units))")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const properties = data ?? [];
    const propertyIds = properties.map((property) => property.id);
    const commercialStateByProperty = new Map<string, boolean>();
    let commercialStateAvailable = true;
    if (propertyIds.length > 0) {
      const { data: commercialStates, error: commercialStateError } = await auth.supabase.rpc(
        "get_hotel_commercial_agreement_admin_state",
        { p_property_ids: propertyIds },
      );
      if (commercialStateError) commercialStateAvailable = false;
      else {
        for (const state of commercialStates ?? []) {
          commercialStateByProperty.set(
            state.property_id,
            state.commercial_agreement_effective === true,
          );
        }
      }
    }

    return NextResponse.json({
      publicationEnabled: isHotelPublicationEnabled(),
      data: properties.map((property) => ({
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
        commercialRelease: {
          stateAvailable: commercialStateAvailable,
          agreementEffective: commercialStateByProperty.get(property.id) === true,
          reviewComplete: property.listing_scope === "commercial"
            && property.direct_request_mode === "request_only"
            && property.commercial_terms_version === "hotel_partner_fee_disclosure_13_3_2026-08-22_v1"
            && Boolean(property.commercial_verified_at)
            && Boolean(property.commercial_verified_by)
            && Boolean(property.support_contact_email?.trim()),
        },
      }))
    });
  } catch {
    return NextResponse.json({ error: "Property review is not configured." }, { status: 503 });
  }
}
