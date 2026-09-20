import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { isHotelPublicationEnabled } from "@/lib/hotels/publication-gate";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase.from("properties")
      .select("id,name,slug,type,star_rating,city,country,active,image_url,amenities,created_at,partners(business_name,status),rooms(active,base_rate,max_guests,direct_rate_plan_code,direct_rate_plan_name,direct_currency_code,direct_cancellation_policy,direct_cancellation_policy_version,inventory(stay_date,available_units,rate,direct_tax_amount,direct_mandatory_fee_amount))")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const properties = data ?? [];
    const propertyIds = properties.map((property) => property.id);
    const commercialStateByProperty = new Map<string, boolean>();
    const commercialReviewByProperty = new Map<string, boolean>();
    let commercialStateAvailable = true;
    if (propertyIds.length > 0) {
      const { data: commercialControls, error: commercialControlsError } = await auth.supabase
        .from("properties")
        .select("id,listing_scope,direct_request_mode,commercial_terms_version,commercial_verified_at,commercial_verified_by,support_contact_email")
        .in("id", propertyIds);
      const { data: commercialStates, error: commercialStateError } = await auth.supabase.rpc(
        "get_hotel_commercial_agreement_admin_state",
        { p_property_ids: propertyIds },
      );
      if (commercialControlsError || commercialStateError) commercialStateAvailable = false;
      if (!commercialStateError) {
        for (const state of commercialStates ?? []) {
          commercialStateByProperty.set(
            state.property_id,
            state.commercial_agreement_effective === true,
          );
        }
      }
      if (!commercialControlsError) {
        for (const control of commercialControls ?? []) {
          commercialReviewByProperty.set(
            control.id,
            control.listing_scope === "commercial"
              && control.direct_request_mode === "request_only"
              && control.commercial_terms_version === "hotel_partner_fee_disclosure_13_3_2026-08-22_v1"
              && Boolean(control.commercial_verified_at)
              && Boolean(control.commercial_verified_by)
              && Boolean(control.support_contact_email?.trim()),
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
          reviewComplete: commercialReviewByProperty.get(property.id) === true,
        },
      }))
    });
  } catch {
    return NextResponse.json({ error: "Property review is not configured." }, { status: 503 });
  }
}
