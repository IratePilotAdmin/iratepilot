import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isPartnerConnectEnabled, stripeMode } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isPartnerConnectEnabled()) return NextResponse.json({ error: "Partner payouts are not enabled for this Stripe environment." }, { status: 403 });
    const mode = stripeMode();
    const admin = createAdminClient();
    const { data: partner, error } = await admin.from("partners")
      .select("id,business_name,status,stripe_connect_account_id,stripe_connect_mode")
      .eq("owner_id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (auth.profile.role !== "admin" && (!partner || partner.status !== "approved")) {
      return NextResponse.json({ error: "An approved partner account is required to start Stripe onboarding." }, { status: 403 });
    }
    if (!partner) return NextResponse.json({ error: "Create a partner account first." }, { status: 409 });

    if (partner.stripe_connect_account_id && partner.stripe_connect_mode === "live" && mode === "test") {
      return NextResponse.json({
        error: "A live payout account is already connected. Test-mode onboarding cannot replace it."
      }, { status: 409 });
    }

    const stripe = getStripe();
    let accountId = partner.stripe_connect_mode === mode ? partner.stripe_connect_account_id : null;
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
          environment: mode === "live" ? "production" : "private_pilot"
        }
      });
      accountId = account.id;
      const { error: updateError } = await admin.from("partners").update({
        stripe_connect_account_id: accountId,
        stripe_connect_mode: mode,
        stripe_connect_status: "not_started",
        stripe_connect_details_submitted: false,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false,
        stripe_connect_requirements_due: [],
        stripe_connect_updated_at: new Date().toISOString()
      }).eq("id", partner.id);
      if (updateError) throw updateError;
    }

    const origin = new URL(request.url).origin;
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/partner/payouts?connect=refresh`,
      return_url: `${origin}/partner/payouts?connect=returned`
    });
    return NextResponse.json({ url: link.url });
  } catch (error) {
    console.error("Stripe Connect onboarding failed", error);
    return NextResponse.json({ error: "Stripe Connect onboarding could not be started." }, { status: 503 });
  }
}
