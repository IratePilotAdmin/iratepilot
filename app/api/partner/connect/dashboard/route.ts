import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeTestMode } from "@/lib/stripe";

export async function POST() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isStripeTestMode()) return NextResponse.json({ error: "Connect is limited to Stripe test mode." }, { status: 403 });
    const admin = createAdminClient();
    const { data: partner } = await admin.from("partners")
      .select("stripe_connect_account_id,stripe_connect_details_submitted")
      .eq("owner_id", auth.user.id).maybeSingle();
    if (!partner?.stripe_connect_account_id || !partner.stripe_connect_details_submitted) {
      return NextResponse.json({ error: "Complete Stripe onboarding first." }, { status: 409 });
    }
    const stripe = getStripe();
    const link = await stripe.accounts.createLoginLink(partner.stripe_connect_account_id);
    return NextResponse.json({ url: link.url });
  } catch {
    return NextResponse.json({ error: "The Stripe Express dashboard is unavailable." }, { status: 503 });
  }
}
