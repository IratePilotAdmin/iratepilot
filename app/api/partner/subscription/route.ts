import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase.from("partners")
      .select("id,business_name,status,software_plan,subscription_status,subscription_renews_at")
      .eq("owner_id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (auth.profile.role !== "admin" && (!data || data.status !== "approved")) {
      return NextResponse.json({ error: "An approved partner account is required to view subscriptions." }, { status: 403 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Partner subscription is not configured." }, { status: 503 });
  }
}
