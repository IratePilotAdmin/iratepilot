import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAdminMarketplaceOverview, type AdminOverviewBooking, type AdminOverviewFinancial } from "@/lib/admin/marketplace-overview";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const count = (table: "properties" | "bookings" | "partner_applications" | "contact_messages", statusColumn: string, status: string | boolean) => admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(statusColumn, status);
    const [publishedProperties, pendingBookings, confirmedBookings, pendingPartners, newSupport, inProgressSupport, recentBookings, financials] = await Promise.all([
      count("properties", "active", true),
      count("bookings", "status", "pending"),
      count("bookings", "status", "confirmed"),
      count("partner_applications", "status", "pending"),
      count("contact_messages", "status", "new"),
      count("contact_messages", "status", "in_progress"),
      admin.from("bookings")
        .select("id,confirmation_code,check_in,check_out,total,status,created_at,properties(name),profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(8),
      admin.from("booking_financials")
        .select("gross_room_revenue,partner_commission,partner_net,status,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    const results = [publishedProperties, pendingBookings, confirmedBookings, pendingPartners, newSupport, inProgressSupport, recentBookings, financials];
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;

    return NextResponse.json({
      profileName: auth.profile.full_name,
      financialsTruncated: Number(financials.count || 0) > 500,
      ...buildAdminMarketplaceOverview(
        {
          publishedProperties: publishedProperties.count || 0,
          pendingBookings: pendingBookings.count || 0,
          confirmedBookings: confirmedBookings.count || 0,
          pendingPartners: pendingPartners.count || 0,
          openSupport: (newSupport.count || 0) + (inProgressSupport.count || 0),
        },
        (recentBookings.data || []) as unknown as AdminOverviewBooking[],
        (financials.data || []) as AdminOverviewFinancial[],
      ),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin marketplace overview failed", error);
    return NextResponse.json({ error: "Marketplace overview could not be loaded." }, { status: 503 });
  }
}
