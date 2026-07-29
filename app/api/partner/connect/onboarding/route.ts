import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeTestMode } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isStripeTestMode()) return NextResponse.json({ error: "Connect is limited to Stripe test mode." }, { status: 403 });
    const admin = createAdminClient();
    const { data: partner, error } = await admin.from("partners")
      .select("id,business_name,stripe_connect_account_id")
      .eq("owner_id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (!partner) return NextResponse.json({ error: "Create a partner account first." }, { status: 409 });

    const stripe = getStripe();
    let accountId = partner.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: auth.user.email,
        business_profile: {
          name: partner.business_name,
          url: "https://www.iratepilot.com"
        },
        capabilities: {
          transfers: { requested: true }
        },
        metadata: {
          iratepilot_partner_id: partner.id,
          environment: "private_pilot"
        }
      });
      accountId = account.id;
      await admin.from("partners").update({
        stripe_connect_account_id: accountId,
        stripe_connect_status: "not_started",
        stripe_connect_updated_at: new Date().toISOString()
      }).eq("id", partner.id);
    }

    const origin = new URL(request.url).origin;
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/partner/payouts?connect=refresh`,
      return_url: `${origin}/partner/payouts?connect=returned`
    });
    return NextResponse.json({ url: link.url });
  } catch {
    return NextResponse.json({ error: "Stripe Connect onboarding could not be started." }, { status: 503 });
  }
}
