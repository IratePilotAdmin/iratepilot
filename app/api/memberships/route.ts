import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const [profileResult, ledgerResult] = await Promise.all([
      supabase.from("profiles").select("membership_tier,membership_status,membership_renews_at,reward_points,stripe_customer_id").eq("id", user.id).single(),
      supabase.from("reward_ledger").select("id,points,description,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50)
    ]);
    if (profileResult.error || ledgerResult.error) throw profileResult.error || ledgerResult.error;
    const profile = profileResult.data;
    return NextResponse.json({
      profile: {
        membership_tier: profile.membership_tier,
        membership_status: profile.membership_status,
        membership_renews_at: profile.membership_renews_at,
        reward_points: profile.reward_points,
        can_manage_billing: Boolean(profile.stripe_customer_id),
      },
      ledger: ledgerResult.data,
      mode: "test",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer membership lookup failed", error);
    return NextResponse.json({ error: "Membership records are not configured." }, { status: 503 });
  }
}
