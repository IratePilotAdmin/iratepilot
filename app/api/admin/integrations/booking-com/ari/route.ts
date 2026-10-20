import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const states = ["queued", "retry", "processing", "sent", "review"] as const;

function missingSchema(error: { code?: string } | null) {
  return Boolean(error && ["42P01", "42703", "PGRST205"].includes(error.code || ""));
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  try {
    const admin = createAdminClient();
    const checkedAt = new Date().toISOString();
    const [connections, recent, ...counts] = await Promise.all([
      admin.from("irp_ota_channel_connections")
        .select("connection_id,environment,enabled,partner_approved,ari_endpoint_approved,certification_complete")
        .eq("provider", "booking_com").order("connection_id").limit(100),
      admin.from("irp_ota_ari_outbox")
        .select("id,connection_id,sync_id,request_index,request_kind,status,attempt_count,created_at,available_at,lease_expires_at,last_http_status")
        .order("created_at", { ascending: false }).limit(100),
      ...states.map((state) => admin.from("irp_ota_ari_outbox")
        .select("id", { count: "exact", head: true }).eq("status", state)),
      admin.from("irp_ota_ari_outbox").select("id", { count: "exact", head: true })
        .in("status", ["queued", "retry"]).lte("available_at", checkedAt),
      admin.from("irp_ota_ari_outbox").select("id", { count: "exact", head: true })
        .eq("status", "processing").lte("lease_expires_at", checkedAt),
    ]);
    const error = connections.error || recent.error || counts.find((result) => result.error)?.error || null;
    if (missingSchema(error)) return NextResponse.json({ available: false, reason: "migration_not_installed" }, { headers: NO_STORE });
    if (error || !Array.isArray(connections.data) || !Array.isArray(recent.data)
      || counts.some((result) => typeof result.count !== "number" || result.count < 0)) {
      return NextResponse.json({ error: "Booking.com test ARI status is temporarily unavailable." }, { status: 503, headers: NO_STORE });
    }

    return NextResponse.json({
      available: true,
      checkedAt,
      workerEnabled: process.env.IRP_BOOKING_COM_ARI_SYNC_ENABLED === "true",
      totals: Object.fromEntries(states.map((state, index) => [state, counts[index]?.count ?? 0])),
      due: counts[states.length]?.count ?? 0,
      expiredLeases: counts[states.length + 1]?.count ?? 0,
      connections: (connections.data ?? []).map((row) => ({
        connectionId: row.connection_id,
        environment: row.environment,
        enabled: row.enabled,
        partnerApproved: row.partner_approved,
        endpointApproved: row.ari_endpoint_approved,
        certificationComplete: row.certification_complete,
      })),
      recent: (recent.data ?? []).map((row) => ({
        jobId: row.id,
        connectionId: row.connection_id,
        syncId: row.sync_id,
        requestIndex: row.request_index,
        kind: row.request_kind,
        state: row.status,
        attempts: row.attempt_count,
        createdAt: row.created_at,
        availableAt: row.available_at,
        leaseExpiresAt: row.lease_expires_at,
        httpStatus: row.last_http_status,
      })),
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Booking.com test ARI status is temporarily unavailable." }, { status: 503, headers: NO_STORE });
  }
}
