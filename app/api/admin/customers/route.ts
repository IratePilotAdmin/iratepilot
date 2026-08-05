import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCustomerDirectory, type CustomerBooking, type CustomerProfile } from "@/lib/admin/customer-directory";

const directoryLimit = 200;

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const { data: profiles, error: profileError, count } = await admin
      .from("profiles")
      .select("id,full_name,phone,membership_tier,membership_status,reward_points,created_at", { count: "exact" })
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .limit(directoryLimit);
    if (profileError) throw profileError;

    const customerIds = (profiles || []).map((profile) => profile.id);
    const bookingsPromise = customerIds.length
      ? admin.from("bookings").select("customer_id,status,total,created_at").in("customer_id", customerIds)
      : Promise.resolve({ data: [] as CustomerBooking[], error: null });
    const [bookingsResult, authUsersResult] = await Promise.all([
      bookingsPromise,
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (bookingsResult.error) throw bookingsResult.error;
    const { data: authUsers, error: authError } = authUsersResult;
    if (authError) throw authError;
    const emailById = new Map(authUsers.users.map((user) => [user.id, user.email || null]));
    const data = buildCustomerDirectory(
      (profiles || []) as CustomerProfile[],
      (bookingsResult.data || []) as CustomerBooking[],
      emailById,
    );
    const summary = data.reduce((totals, customer) => ({
      activeMembers: totals.activeMembers + (customer.membership_status === "active" ? 1 : 0),
      pendingBookings: totals.pendingBookings + customer.pending_booking_count,
      confirmedValue: totals.confirmedValue + customer.confirmed_value,
    }), { activeMembers: 0, pendingBookings: 0, confirmedValue: 0 });

    return NextResponse.json({
      data,
      summary: { totalCustomers: count || 0, ...summary },
      limit: directoryLimit,
      truncated: Number(count || 0) > directoryLimit,
    });
  } catch (error) {
    console.error("Admin customer directory failed", error);
    return NextResponse.json({ error: "Customer management could not be loaded." }, { status: 503 });
  }
}
