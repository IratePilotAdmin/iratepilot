import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { getPropertyReadiness, type PropertyReadinessInput } from "@/lib/property-readiness";

const decisionSchema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid property ID." }, { status: 400 });
  const parsed = decisionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });

  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (parsed.data.active) {
      const { data: property, error: propertyError } = await auth.supabase.from("properties")
        .select("image_url,amenities,rooms(active,inventory(stay_date,available_units))")
        .eq("id", id).maybeSingle();
      if (propertyError) throw propertyError;
      if (!property) return NextResponse.json({ error: "Property not found." }, { status: 404 });
      const readiness = getPropertyReadiness(property as PropertyReadinessInput);
      if (!readiness.ready) {
        return NextResponse.json({
          error: `Complete the listing before approval: ${readiness.missing.join(", ")}.`,
          readiness
        }, { status: 409 });
      }
    }
    const { data, error } = await auth.supabase.from("properties").update({ active: parsed.data.active }).eq("id", id)
      .select("id,name,active").single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "The review decision could not be saved." }, { status: 503 });
  }
}
