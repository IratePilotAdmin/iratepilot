import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAdminAuditEvents, type BookingAuditRow, type RevenueAuditRow } from "@/lib/admin/audit-events";

const auditLimit = 200;

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const [bookingHistory, revenueAudit] = await Promise.all([
      admin.from("booking_status_history")
        .select("id,status,note,created_at,profiles(full_name),bookings(confirmation_code,properties(name))", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(auditLimit),
      admin.from("revenue_audit_log")
        .select("id,action,details,created_at,profiles(full_name),properties(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(auditLimit),
    ]);
    if (bookingHistory.error || revenueAudit.error) throw bookingHistory.error || revenueAudit.error;

    const bookingCount = bookingHistory.count || 0;
    const revenueCount = revenueAudit.count || 0;
    const data = buildAdminAuditEvents(
      (bookingHistory.data || []) as unknown as BookingAuditRow[],
      (revenueAudit.data || []) as unknown as RevenueAuditRow[],
      auditLimit,
    );
    return NextResponse.json({
      data,
      summary: { total: bookingCount + revenueCount, booking: bookingCount, revenue: revenueCount, displayed: data.length },
      limit: auditLimit,
      truncated: bookingCount + revenueCount > auditLimit,
    });
  } catch (error) {
    console.error("Admin audit timeline failed", error);
    return NextResponse.json({ error: "Audit history could not be loaded." }, { status: 503 });
  }
}
