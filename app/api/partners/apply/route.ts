import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hotelManagerIntakeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 25_000) {
    return NextResponse.json({ error: "The intake submission is too large." }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  const parsed = hotelManagerIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Please complete every required field and confirmation before submitting.",
    }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("partner_applications").insert({
      property_name: parsed.data.propertyName,
      contact_name: parsed.data.contactName,
      email: parsed.data.email,
      property_type: parsed.data.propertyType,
      star_rating: parsed.data.starRating,
      contact_role: parsed.data.contactRole,
      phone: parsed.data.phone,
      website_url: parsed.data.websiteUrl,
      address_line1: parsed.data.addressLine1,
      city: parsed.data.city,
      region: parsed.data.region || null,
      postal_code: parsed.data.postalCode,
      country: parsed.data.country,
      description: parsed.data.description,
      amenities: parsed.data.amenities,
      photo_source_url: parsed.data.photoSourceUrl,
      additional_notes: parsed.data.additionalNotes || null,
      hotel_authorized: parsed.data.hotelAuthorized,
      content_rights_confirmed: parsed.data.contentRightsConfirmed,
      information_accurate: parsed.data.informationAccurate,
      status: "pending",
    });
    if (error?.code === "23505") {
      return NextResponse.json({ status: "received" }, { status: 201 });
    }
    if (error) throw error;
    return NextResponse.json({ status: "received" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Partner applications are not configured yet." }, { status: 503 });
  }
}
