import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { resolvePartnerHotelAccess } from "@/lib/partner/hotel-access";
import { propertyContentSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid property ID." }, { status: 400 });
  const parsed = propertyContentSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Add a detailed description, valid image URL, and 1–20 amenities." }, { status: 400 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let propertyQuery = auth.supabase.from("properties").select("id").eq("id", id);
    if (auth.profile.role !== "admin") {
      const resolved = await resolvePartnerHotelAccess(auth);
      if (!resolved.access) {
        return NextResponse.json({
          error: resolved.migrationRequired
            ? "Apply hotel-management migration 054 before using delegated property access."
            : "Approved hotel-management access is required.",
        }, { status: resolved.migrationRequired ? 503 : 403 });
      }
      propertyQuery = propertyQuery.eq("partner_id", resolved.access.partnerId);
    }
    const { data: property } = await propertyQuery.maybeSingle();
    if (!property) return NextResponse.json({ error: "Property not found." }, { status: 404 });

    const { data, error } = await auth.supabase.from("properties").update({
      description: parsed.data.description, image_url: parsed.data.imageUrl, amenities: parsed.data.amenities, active: false
    }).eq("id", id).select("id,name,active").single();
    if (error) throw error;
    return NextResponse.json({ data, message: "Property content saved and returned to review." });
  } catch {
    return NextResponse.json({ error: "Property content could not be saved." }, { status: 503 });
  }
}
