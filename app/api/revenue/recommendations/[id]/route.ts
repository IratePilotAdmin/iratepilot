import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { isApprovedRevenueOwner } from "@/lib/revenue-access";

const schema = z.object({ decision: z.enum(["approve", "reject"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.REVENUE_AI_ENABLED !== "true") return NextResponse.json({ error: "Revenue review is disabled until the hotel data and database release are verified." }, { status: 503 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { data: recommendation } = await auth.supabase.from("revenue_recommendations").select("*,properties(partner_id,pms_only,partners(owner_id,status))").eq("id", id).single();
    if (!recommendation || (auth.profile.role !== "admin" && !isApprovedRevenueOwner(recommendation.properties?.partners, auth.user.id))) return NextResponse.json({ error: "Approved recommendation access is required." }, { status: 403 });
    if (parsed.data.decision === "approve" && recommendation.properties?.pms_only) return NextResponse.json({ error: "PMS-only properties are read-only in Revenue AI." }, { status: 409 });
    if (recommendation.status !== "pending") return NextResponse.json({ error: "This recommendation has already been reviewed." }, { status: 409 });
    const result = await auth.supabase.rpc("review_revenue_recommendation", { p_recommendation_id: id, p_decision: parsed.data.decision });
    if (result.error) throw result.error;
    return NextResponse.json({ message: parsed.data.decision === "approve" ? "Recommendation approved and inventory rate updated." : "Recommendation rejected." });
  } catch {
    return NextResponse.json({ error: "Recommendation could not be reviewed." }, { status: 503 });
  }
}
