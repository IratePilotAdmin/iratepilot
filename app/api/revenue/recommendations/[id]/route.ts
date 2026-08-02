import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";

const schema = z.object({ decision: z.enum(["approve", "reject"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await context.params;
    const { data: recommendation } = await auth.supabase.from("revenue_recommendations").select("*,properties(partner_id,partners(owner_id,status))").eq("id", id).single();
    const partners = recommendation?.properties?.partners;
    const owner = Array.isArray(partners) ? partners[0]?.owner_id : partners?.owner_id;
    const partnerStatus = Array.isArray(partners) ? partners[0]?.status : partners?.status;
    if (!recommendation || (auth.profile.role !== "admin" && (owner !== auth.user.id || partnerStatus !== "approved"))) return NextResponse.json({ error: "Approved recommendation access is required." }, { status: 403 });
    if (recommendation.status !== "pending") return NextResponse.json({ error: "This recommendation has already been reviewed." }, { status: 409 });
    const result = await auth.supabase.rpc("review_revenue_recommendation", { p_recommendation_id: id, p_decision: parsed.data.decision });
    if (result.error) throw result.error;
    return NextResponse.json({ message: parsed.data.decision === "approve" ? "Recommendation approved and inventory rate updated." : "Recommendation rejected." });
  } catch {
    return NextResponse.json({ error: "Recommendation could not be reviewed." }, { status: 503 });
  }
}
