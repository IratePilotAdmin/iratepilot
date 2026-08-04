import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  if (process.env.ENABLE_TEST_CHECKOUT !== "true" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Partner subscription test billing is disabled." }, { status: 503 });
  }

  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: partner, error } = await auth.supabase.from("partners")
      .select("status,stripe_customer_id")
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!partner || partner.status !== "approved") {
      return NextResponse.json({ error: "An approved partner account is required to manage billing." }, { status: 403 });
    }
    if (!partner.stripe_customer_id?.startsWith("cus_")) {
      return NextResponse.json({ error: "No test billing account is available yet." }, { status: 409 });
    }

    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await getStripe().billingPortal.sessions.create({
      customer: partner.stripe_customer_id,
      return_url: `${base}/partner/settings?billing=returned`,
    });
    return NextResponse.json({ url: session.url, mode: "test" });
  } catch (error) {
    console.error("Partner billing portal failed", error);
    return NextResponse.json({ error: "The test billing portal could not be opened." }, { status: 503 });
  }
}
