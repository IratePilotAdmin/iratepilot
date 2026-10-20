import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { assessNativePmsDeliveryHealth } from "@/lib/native-pms-delivery-health";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const states = ["pending", "leased", "retry", "delivered", "review"] as const;

function missingSchema(error: { code?: string } | null) {
  return Boolean(error && ["42P01", "42703", "PGRST205"].includes(error.code || ""));
}

function safeResultCode(value: unknown) {
  if (typeof value !== "string") return null;
  return /^(?:pms_(?:applied|duplicate|stale|review-required|reservation-staged|cancellation-staged)|http_[45]\d\d|invalid_pms_ack|invalid_gateway_ack|connection_scope_mismatch|payload_too_large|transport_failure|lease_lost)$/.test(value)
    ? value : "unrecognized_result";
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  try {
    const admin = createAdminClient();
    const checkedAt = new Date().toISOString();
    const overdueAt = new Date(Date.parse(checkedAt) - 15 * 60 * 1000).toISOString();
    const [connections, recent, ...counts] = await Promise.all([
      admin.from("irp_pms_outbox_connections")
        .select("connection_id,property_id,environment,enabled,delivery_enabled")
        .order("connection_id").limit(100),
      admin.from("irp_pms_outbox")
        .select("event_id,connection_id,property_id,state,attempts,due_at,created_at,result_code")
        .order("created_at", { ascending: false }).limit(100),
      ...states.map((state) => admin.from("irp_pms_outbox")
        .select("event_id", { count: "exact", head: true }).eq("state", state)),
      admin.from("irp_pms_outbox").select("event_id", { count: "exact", head: true })
        .eq("state", "pending").lte("due_at", checkedAt),
      admin.from("irp_pms_outbox").select("event_id", { count: "exact", head: true })
        .eq("state", "retry").lte("due_at", checkedAt),
      admin.from("irp_pms_outbox").select("event_id", { count: "exact", head: true })
        .eq("state", "leased").lte("lease_until", checkedAt),
      admin.from("irp_pms_outbox").select("event_id", { count: "exact", head: true })
        .eq("state", "pending").lte("due_at", overdueAt),
      admin.from("irp_pms_outbox").select("event_id", { count: "exact", head: true })
        .eq("state", "retry").lte("due_at", overdueAt),
      admin.from("irp_pms_outbox_connections").select("connection_id", { count: "exact", head: true })
        .eq("delivery_enabled", true),
    ]);
    const error = connections.error || recent.error || counts.find((result) => result.error)?.error || null;
    if (missingSchema(error)) return NextResponse.json({ available: false, reason: "migration_not_installed" }, { headers: NO_STORE });
    if (error) return NextResponse.json({ error: "Native PMS delivery status is temporarily unavailable." }, { status: 503, headers: NO_STORE });

    const totals = Object.fromEntries(states.map((state, index) => [state, counts[index]?.count ?? 0]));
    const health = assessNativePmsDeliveryHealth({
      reviewEvents: totals.review,
      expiredLeases: counts[states.length + 2]?.count ?? 0,
      overduePending: counts[states.length + 3]?.count ?? 0,
      overdueRetry: counts[states.length + 4]?.count ?? 0,
      deliveryEnabledConnections: counts[states.length + 5]?.count ?? 0,
    }, checkedAt);
    return NextResponse.json({
      available: true,
      checkedAt,
      totals,
      due: (counts[states.length]?.count ?? 0) + (counts[states.length + 1]?.count ?? 0),
      health,
      connections: (connections.data ?? []).map((row) => ({
        connectionId: row.connection_id,
        propertyId: row.property_id,
        environment: row.environment,
        captureEnabled: row.enabled,
        deliveryEnabled: row.delivery_enabled,
      })),
      recent: (recent.data ?? []).map((row) => ({
        eventId: row.event_id,
        connectionId: row.connection_id,
        propertyId: row.property_id,
        state: row.state,
        attempts: row.attempts,
        dueAt: row.due_at,
        createdAt: row.created_at,
        resultCode: safeResultCode(row.result_code),
      })),
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Native PMS delivery status is temporarily unavailable." }, { status: 503, headers: NO_STORE });
  }
}
