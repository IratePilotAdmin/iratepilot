import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const [profileResult, ledgerResult] = await Promise.all([
      supabase.from("profiles").select("membership_tier,membership_status,membership_renews_at,reward_points").eq("id", user.id).single(),
      supabase.from("reward_ledger").select("id,points,description,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50)
    ]);
    if (profileResult.error || ledgerResult.error) throw profileResult.error || ledgerResult.error;
    return NextResponse.json({ profile: profileResult.data, ledger: ledgerResult.data });
  } catch {
    return NextResponse.json({ error: "Membership records are not configured." }, { status: 503 });
  }
}
