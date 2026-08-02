import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { propertyContentSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid property ID." }, { status: 400 });
  const parsed = propertyContentSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Add a valid image URL and 1–20 amenities." }, { status: 400 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let propertyQuery = auth.supabase.from("properties").select("id").eq("id", id);
    if (auth.profile.role !== "admin") {
      const { data: partner, error: partnerError } = await auth.supabase.from("partners").select("id,status").eq("owner_id", auth.user.id).maybeSingle();
      if (partnerError) throw partnerError;
      if (!partner || partner.status !== "approved") {
        return NextResponse.json({ error: "An approved partner account is required to edit properties." }, { status: 403 });
      }
      propertyQuery = propertyQuery.eq("partner_id", partner.id);
    }
    const { data: property } = await propertyQuery.maybeSingle();
    if (!property) return NextResponse.json({ error: "Property not found." }, { status: 404 });

    const { data, error } = await auth.supabase.from("properties").update({
      image_url: parsed.data.imageUrl, amenities: parsed.data.amenities, active: false
    }).eq("id", id).select("id,name,active").single();
    if (error) throw error;
    return NextResponse.json({ data, message: "Property content saved and returned to review." });
  } catch {
    return NextResponse.json({ error: "Property content could not be saved." }, { status: 503 });
  }
}
