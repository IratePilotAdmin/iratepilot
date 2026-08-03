import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { buildPartnerOverview, type PartnerOverviewBooking, type PartnerOverviewFinancial } from "@/lib/partner/overview";

export async function GET() {
  try {
    const auth = await requireRole(["partner", "admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: partner, error: partnerError } = await auth.supabase.from("partners")
      .select("id,status,business_name")
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (partnerError) throw partnerError;
    if (auth.profile.role !== "admin" && (!partner || partner.status !== "approved")) {
      return NextResponse.json({ error: "An approved partner account is required to view the portfolio overview." }, { status: 403 });
    }
    if (!partner) {
      return NextResponse.json({
        profileName: auth.profile.full_name,
        businessName: null,
        financialsTruncated: false,
        ...buildPartnerOverview({ properties: 0, publishedProperties: 0, pendingBookings: 0, confirmedBookings: 0 }, [], []),
      });
    }

    const partnerBookings = (status?: "pending" | "confirmed", head = false) => {
      let query = auth.supabase.from("bookings")
        .select(head ? "id,properties!inner(partner_id)" : "id,confirmation_code,check_in,check_out,total,status,created_at,properties!inner(name,partner_id),profiles(full_name)", { count: head ? "exact" : undefined, head })
        .eq("properties.partner_id", partner.id);
      if (status) query = query.eq("status", status);
      return query;
    };
    const [properties, publishedProperties, pendingBookings, confirmedBookings, recentBookings, financials] = await Promise.all([
      auth.supabase.from("properties").select("id", { count: "exact", head: true }).eq("partner_id", partner.id),
      auth.supabase.from("properties").select("id", { count: "exact", head: true }).eq("partner_id", partner.id).eq("active", true),
      partnerBookings("pending", true),
      partnerBookings("confirmed", true),
      partnerBookings().order("created_at", { ascending: false }).limit(8),
      auth.supabase.from("booking_financials")
        .select("booking_id,gross_room_revenue,partner_net,status,created_at", { count: "exact" })
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    const error = properties.error || publishedProperties.error || pendingBookings.error || confirmedBookings.error || recentBookings.error || financials.error;
    if (error) throw error;

    return NextResponse.json({
      profileName: auth.profile.full_name,
      businessName: partner.business_name,
      financialsTruncated: Number(financials.count || 0) > 500,
      ...buildPartnerOverview(
        {
          properties: properties.count || 0,
          publishedProperties: publishedProperties.count || 0,
          pendingBookings: pendingBookings.count || 0,
          confirmedBookings: confirmedBookings.count || 0,
        },
        (recentBookings.data || []) as unknown as PartnerOverviewBooking[],
        (financials.data || []) as PartnerOverviewFinancial[],
      ),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Partner overview failed", error);
    return NextResponse.json({ error: "Partner portfolio overview could not be loaded." }, { status: 503 });
  }
}
