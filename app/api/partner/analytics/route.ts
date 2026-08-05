import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { buildPartnerAnalytics, type PartnerAnalyticsBooking, type PartnerAnalyticsFinancial, type PartnerAnalyticsProperty } from "@/lib/partner/analytics";

const ROW_LIMIT = 1000;

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
      return NextResponse.json({ error: "An approved partner account is required to view analytics." }, { status: 403 });
    }
    if (!partner) {
      return NextResponse.json({ businessName: null, dataTruncated: false, ...buildPartnerAnalytics([], [], []) }, { headers: { "Cache-Control": "no-store" } });
    }

    const [properties, bookings, financials] = await Promise.all([
      auth.supabase.from("properties").select("id,name,active").eq("partner_id", partner.id).order("name"),
      auth.supabase.from("bookings")
        .select("id,property_id,status,total,created_at,properties!inner(partner_id)", { count: "exact" })
        .eq("properties.partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT),
      auth.supabase.from("booking_financials")
        .select("booking_id,partner_net,status", { count: "exact" })
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(ROW_LIMIT),
    ]);
    const error = properties.error || bookings.error || financials.error;
    if (error) throw error;

    return NextResponse.json({
      businessName: partner.business_name,
      dataTruncated: Number(bookings.count || 0) > ROW_LIMIT || Number(financials.count || 0) > ROW_LIMIT,
      ...buildPartnerAnalytics(
        (properties.data || []) as PartnerAnalyticsProperty[],
        (bookings.data || []) as unknown as PartnerAnalyticsBooking[],
        (financials.data || []) as PartnerAnalyticsFinancial[],
      ),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Partner analytics failed", error);
    return NextResponse.json({ error: "Partner analytics could not be loaded." }, { status: 503 });
  }
}
