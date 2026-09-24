import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";

const schema = z.object({ propertyId: z.string().uuid() });

export async function POST(request: Request) {
  if (process.env.PILOT_MODE !== "true") return NextResponse.json({ error: "Revenue recommendations are disabled." }, { status: 503 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A valid property is required." }, { status: 400 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: property } = await auth.supabase.from("properties").select("id,partner_id,partners(owner_id,status)").eq("id", parsed.data.propertyId).single();
    const owner = property?.partners?.[0]?.owner_id;
    const partnerStatus = property?.partners?.[0]?.status;
    if (!property || (auth.profile.role !== "admin" && (owner !== auth.user.id || partnerStatus !== "approved"))) return NextResponse.json({ error: "Approved property access is required." }, { status: 403 });
    const startDate = new Date();
    const today = format(startDate, "yyyy-MM-dd");
    const end = format(addDays(startDate, 89), "yyyy-MM-dd");
    const { count, error } = await auth.supabase.from("revenue_daily_inputs").select("id", { count: "exact", head: true }).eq("property_id", property.id).gte("stay_date", today).lte("stay_date", end);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "Upload revenue data for the next 90 days first." }, { status: 409 });
    const result = await auth.supabase.rpc("generate_revenue_recommendations", {
      p_property_id: property.id,
      p_start_date: today,
      p_end_date: end,
    });
    if (result.error) throw result.error;
    const generatedCount = Number(result.data);
    if (!Number.isSafeInteger(generatedCount) || generatedCount < 1) throw new Error("Recommendation generation returned an invalid count.");
    return NextResponse.json({ message: `${generatedCount} pricing recommendations generated for the 90-day window.` });
  } catch {
    return NextResponse.json({ error: "Revenue recommendations could not be generated." }, { status: 503 });
  }
}
