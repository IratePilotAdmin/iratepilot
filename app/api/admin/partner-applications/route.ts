import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data, error } = await auth.supabase
      .from("partner_applications")
      .select("id,property_name,contact_name,email,property_type,status,created_at,star_rating,contact_role,phone,website_url,address_line1,city,region,postal_code,country,description,amenities,photo_source_url,additional_notes,hotel_authorized,content_rights_confirmed,information_accurate,property_id")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Partner applications could not be loaded." },
      { status: 503 }
    );
  }
}
