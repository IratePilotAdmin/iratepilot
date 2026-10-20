import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const RECENT_LIMIT = 100;

type ChannelConnection = {
  connection_id: string;
  property_id: string;
  environment: string;
  enabled: boolean;
  partner_approved: boolean;
  pii_compliance_approved: boolean;
  updated_at: string;
};
type InboxEvent = { connection_id: string; status: string; event_kind: string; result_code: string | null; received_at: string };
type AriJob = { connection_id: string; status: string; request_kind: string; last_http_status: number | null; updated_at: string };

function reviewReasonCounts(rows: InboxEvent[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "review" || !row.result_code || !/^[a-z0-9_-]{1,80}$/.test(row.result_code)) continue;
    counts.set(row.result_code, (counts.get(row.result_code) ?? 0) + 1);
  }
  return [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)).slice(0, 10);
}

function recentReviewEvents(rows: InboxEvent[]) {
  return rows.filter((row) => row.status === "review")
    .slice(0, 10)
    .map((row) => ({
      eventKind: ["new", "modified", "cancelled"].includes(row.event_kind) ? row.event_kind : "unknown",
      code: row.result_code && /^[a-z0-9_-]{1,80}$/.test(row.result_code) ? row.result_code : "unknown_review_reason",
      receivedAt: row.received_at,
    }));
}

function tally<T extends { status: string }>(rows: T[], allowed: readonly string[]) {
  const counts = Object.fromEntries(allowed.map((status) => [status, 0])) as Record<string, number>;
  for (const row of rows) if (Object.hasOwn(counts, row.status)) counts[row.status]++;
  return counts;
}

export async function GET() {
  try {
    const auth = await requireRole(["partner"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
    const partnerResult = await auth.supabase.from("partners")
      .select("id,status").eq("owner_id", auth.user.id).maybeSingle();
    if (partnerResult.error) return NextResponse.json({ error: "Partner access could not be verified." }, { status: 503, headers: NO_STORE });
    if (partnerResult.data?.status !== "approved") return NextResponse.json({ error: "An approved partner account is required." }, { status: 403, headers: NO_STORE });

    const propertiesResult = await auth.supabase.from("properties")
      .select("id,name,active").eq("partner_id", partnerResult.data.id);
    if (propertiesResult.error) throw new Error("property_lookup_failed");
    const properties = propertiesResult.data ?? [];
    const propertyIds = properties.map((property) => property.id);
    if (!propertyIds.length) return NextResponse.json({ properties, connections: [] }, { headers: NO_STORE });

    const admin = createAdminClient();
    const connectionsResult = await admin.from("irp_ota_channel_connections")
      .select("connection_id,property_id,environment,enabled,partner_approved,pii_compliance_approved,updated_at")
      .eq("provider", "booking_com").eq("environment", "test").in("property_id", propertyIds)
      .order("updated_at", { ascending: false }).limit(100);
    if (connectionsResult.error) throw new Error("connection_lookup_failed");
    const connections = (connectionsResult.data ?? []) as ChannelConnection[];
    const connectionIds = connections.map((connection) => connection.connection_id);
    if (!connectionIds.length) return NextResponse.json({ properties, connections: [] }, { headers: NO_STORE });

    const [inboxResult, ariResult] = await Promise.all([
      admin.from("irp_ota_reservation_inbox")
        .select("connection_id,status,event_kind,result_code,received_at")
        .in("connection_id", connectionIds).order("received_at", { ascending: false }).limit(RECENT_LIMIT),
      admin.from("irp_ota_ari_outbox")
        .select("connection_id,status,request_kind,last_http_status,updated_at")
        .in("connection_id", connectionIds).order("updated_at", { ascending: false }).limit(RECENT_LIMIT),
    ]);
    if (inboxResult.error?.code === "42P01" || ariResult.error?.code === "42P01") {
      return NextResponse.json({ error: "Booking.com health migrations are not installed." }, { status: 503, headers: NO_STORE });
    }
    if (inboxResult.error || ariResult.error) throw new Error("queue_lookup_failed");

    const inbox = (inboxResult.data ?? []) as InboxEvent[];
    const ari = (ariResult.data ?? []) as AriJob[];
    return NextResponse.json({
      properties,
      scope: `most_recent_${RECENT_LIMIT}_total_items_per_queue`,
      connections: connections.map((connection) => {
        const inboxRows = inbox.filter((row) => row.connection_id === connection.connection_id);
        const ariRows = ari.filter((row) => row.connection_id === connection.connection_id);
        return {
          connectionId: connection.connection_id,
          propertyId: connection.property_id,
          environment: connection.environment,
          enabled: connection.enabled,
          partnerApproved: connection.partner_approved,
          piiComplianceApproved: connection.pii_compliance_approved,
          updatedAt: connection.updated_at,
          reservations: {
            recentCount: inboxRows.length,
            statuses: tally(inboxRows, ["received", "leased", "imported", "review"]),
            latestAt: inboxRows[0]?.received_at ?? null,
            reviewReasons: reviewReasonCounts(inboxRows),
            recentReviewEvents: recentReviewEvents(inboxRows),
          },
          availabilityAndRates: {
            recentCount: ariRows.length,
            statuses: tally(ariRows, ["queued", "retry", "processing", "sent", "review"]),
            latestAt: ariRows[0]?.updated_at ?? null,
            lastHttpStatus: ariRows[0]?.last_http_status ?? null,
          },
        };
      }),
      privacy: "Queue metadata only; no guest names, contact information, reservation IDs, or payloads are returned.",
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Booking.com health status could not be loaded." }, { status: 503, headers: NO_STORE });
  }
}
