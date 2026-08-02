import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { propertyContentSchema, propertySchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid property ID." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action =
    typeof body === "object" && body !== null && "action" in body
      ? (body as { action?: unknown }).action
      : "content";

  if (action !== "details" && action !== "content") {
    return NextResponse.json({ error: "Unknown property update action." }, { status: 400 });
  }

  let updates;
  let successMessage;
  if (action === "details") {
    const parsed = propertySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the property name, URL, type, rating, description, and location." },
        { status: 400 }
      );
    }
    updates = {
      name: parsed.data.name,
      slug: parsed.data.slug,
      type: parsed.data.type,
      star_rating: parsed.data.starRating,
      description: parsed.data.description,
      city: parsed.data.city,
      region: parsed.data.region || null,
      country: parsed.data.country,
      active: false
    };
    successMessage = "Listing details saved and returned to review.";
  } else {
    const parsed = propertyContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Add a valid image URL and 1–20 amenities." },
        { status: 400 }
      );
    }
    updates = {
      image_url: parsed.data.imageUrl,
      amenities: parsed.data.amenities,
      active: false
    };
    successMessage = "Property content saved and returned to review.";
  }

  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let propertyQuery = auth.supabase.from("properties").select("id").eq("id", id);
    if (auth.profile.role !== "admin") {
      const { data: partner } = await auth.supabase.from("partners").select("id").eq("owner_id", auth.user.id).maybeSingle();
      if (!partner) return NextResponse.json({ error: "Property not found." }, { status: 404 });
      propertyQuery = propertyQuery.eq("partner_id", partner.id);
    }
    const { data: property } = await propertyQuery.maybeSingle();
    if (!property) return NextResponse.json({ error: "Property not found." }, { status: 404 });

    const { data, error } = await auth.supabase.from("properties").update(updates)
      .eq("id", id).select("id,name,active").single();
    if (error?.code === "23505") {
      return NextResponse.json({ error: "That property URL is already in use." }, { status: 409 });
    }
    if (error) throw error;
    return NextResponse.json({ data, message: successMessage });
  } catch {
    return NextResponse.json({ error: "Property changes could not be saved." }, { status: 503 });
  }
}
