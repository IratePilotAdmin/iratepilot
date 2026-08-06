import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isPartnerConnectEnabled, stripeMode } from "@/lib/stripe";

function connectStatus(account: {
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements?: { disabled_reason?: string | null };
}) {
  if (account.charges_enabled && account.payouts_enabled) return "ready";
  if (account.requirements?.disabled_reason) return "restricted";
  return account.details_submitted ? "pending" : "not_started";
}

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isPartnerConnectEnabled()) return NextResponse.json({ error: "Partner payouts are not enabled for this Stripe environment." }, { status: 403 });
    const mode = stripeMode();
    const admin = createAdminClient();
    const { data: partner, error } = await admin.from("partners")
      .select("id,business_name,status,stripe_connect_account_id,stripe_connect_mode,stripe_connect_status,stripe_connect_details_submitted,stripe_connect_charges_enabled,stripe_connect_payouts_enabled,stripe_connect_requirements_due")
      .eq("owner_id", auth.user.id).maybeSingle();
    if (error) throw error;
    if (auth.profile.role !== "admin" && (!partner || partner.status !== "approved")) {
      return NextResponse.json({ error: "An approved partner account is required to access Stripe Connect." }, { status: 403 });
    }
    if (!partner) return NextResponse.json({ partner: null, mode });
    if (!partner.stripe_connect_account_id || partner.stripe_connect_mode !== mode) return NextResponse.json({ partner: { ...partner, stripe_connect_account_id: null, stripe_connect_status: "not_started", stripe_connect_details_submitted: false, stripe_connect_charges_enabled: false, stripe_connect_payouts_enabled: false, stripe_connect_requirements_due: [] }, mode });

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(partner.stripe_connect_account_id);
    const requirementsDue = [
      ...(account.requirements?.currently_due || []),
      ...(account.requirements?.past_due || [])
    ].filter((item, index, all) => all.indexOf(item) === index);
    const updates = {
      stripe_connect_status: connectStatus(account),
      stripe_connect_details_submitted: account.details_submitted,
      stripe_connect_charges_enabled: account.charges_enabled,
      stripe_connect_payouts_enabled: account.payouts_enabled,
      stripe_connect_requirements_due: requirementsDue,
      stripe_connect_updated_at: new Date().toISOString()
    };
    await admin.from("partners").update(updates).eq("id", partner.id);
    return NextResponse.json({ partner: { ...partner, ...updates }, mode });
  } catch {
    return NextResponse.json({ error: "Stripe Connect status is unavailable." }, { status: 503 });
  }
}
