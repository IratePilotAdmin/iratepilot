import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const states = ["received", "leased", "imported", "review"] as const;
type InboxState = typeof states[number];

function isMissingOtaSchema(error: { code?: string } | null) {
  return Boolean(error && ["42P01", "42703", "PGRST205"].includes(error.code || ""));
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const admin = createAdminClient();
    const [recent, ...counts] = await Promise.all([
      admin.from("irp_ota_reservation_inbox")
        .select("id,connection_id,property_id,event_kind,status,received_at,attempt_count,result_code")
        .order("received_at", { ascending: false })
        .limit(100),
      ...states.map((status) => admin.from("irp_ota_reservation_inbox")
        .select("id", { count: "exact", head: true })
        .eq("status", status)),
    ]);

    const error = recent.error || counts.find((result) => result.error)?.error || null;
    if (isMissingOtaSchema(error)) {
      return NextResponse.json({ available: false, reason: "migration_not_installed" }, {
        headers: { "Cache-Control": "no-store, private" },
      });
    }
    if (error) return NextResponse.json({ error: "OTA inbox status is temporarily unavailable." }, { status: 503 });

    const totals = Object.fromEntries(states.map((status, index) => [status, counts[index]?.count || 0])) as Record<InboxState, number>;
    return NextResponse.json({
      available: true,
      provider: "booking_com",
      totals,
      recent: (recent.data || []).map((row) => ({
        id: row.id,
        connectionId: row.connection_id,
        propertyId: row.property_id,
        eventKind: row.event_kind,
        status: row.status,
        receivedAt: row.received_at,
        attempts: row.attempt_count,
        resultCode: row.result_code,
      })),
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "OTA inbox status is temporarily unavailable." }, { status: 503 });
  }
}
