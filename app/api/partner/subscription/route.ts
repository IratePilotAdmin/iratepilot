import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase.from("partners")
      .select("id,business_name,status,software_plan,subscription_status,subscription_renews_at,stripe_customer_id")
      .eq("owner_id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (auth.profile.role !== "admin" && (!data || data.status !== "approved")) {
      return NextResponse.json({ error: "An approved partner account is required to view subscriptions." }, { status: 403 });
    }
    return NextResponse.json({
      data: data ? {
        id: data.id,
        business_name: data.business_name,
        status: data.status,
        software_plan: data.software_plan,
        subscription_status: data.subscription_status,
        subscription_renews_at: data.subscription_renews_at,
        can_manage_billing: Boolean(data.stripe_customer_id),
      } : null,
      mode: "test",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Partner subscription lookup failed", error);
    return NextResponse.json({ error: "Partner subscription is not configured." }, { status: 503 });
  }
}
