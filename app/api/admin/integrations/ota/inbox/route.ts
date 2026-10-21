import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const states = ["received", "leased", "imported", "review"] as const;
type InboxState = typeof states[number];
const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const PROVIDERS = new Set(["booking_com", "expedia", "agoda", "airbnb", "iratepilot"]);
const RESULT_CODES = new Set([
  "payment_treatment_required", "currency_not_supported", "price_breakdown_missing",
  "guest_total_missing", "unknown_charge_type", "exclusive_charge_requires_review",
  "charges_exceed_guest_total", "hotel_fee_migration_required", "pms_connection_missing",
  "credential_or_payload_invalid", "provider_event_kind_mismatch",
  "multi_room_change_requires_review", "multi_room_cancellation_requires_review",
  "pms_signing_secret_invalid", "provider_token_unavailable", "pms_review_required",
  "pms_transport_or_storage_failure", "pms_rejected_event", "provider_ack_retry",
  "provider_ack_rejected", "pms_persisted_and_provider_acknowledged",
]);

type InboxRow = {
  id: string;
  connection_id: string;
  property_id: string;
  event_kind: string;
  status: string;
  received_at: string;
  attempt_count: number;
  result_code: string | null;
};

function publicEvent(row: InboxRow, providers: Map<string, string>) {
  return {
    id: row.id,
    connectionId: row.connection_id,
    propertyId: row.property_id,
    provider: providers.get(row.connection_id),
    eventKind: row.event_kind,
    status: row.status,
    receivedAt: row.received_at,
    attempts: row.attempt_count,
    resultCode: row.result_code === null ? null
      : RESULT_CODES.has(row.result_code) ? row.result_code : "unrecognized_result",
  };
}

function isMissingOtaSchema(error: { code?: string } | null) {
  return Boolean(error && ["42P01", "42703", "PGRST205"].includes(error.code || ""));
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  try {
    const admin = createAdminClient();
    const [recent, review, ...counts] = await Promise.all([
      admin.from("irp_ota_reservation_inbox")
        .select("id,connection_id,property_id,event_kind,status,received_at,attempt_count,result_code")
        .order("received_at", { ascending: false })
        .limit(100),
      admin.from("irp_ota_reservation_inbox")
        .select("id,connection_id,property_id,event_kind,status,received_at,attempt_count,result_code")
        .eq("status", "review").order("received_at", { ascending: false }).limit(100),
      ...states.map((status) => admin.from("irp_ota_reservation_inbox")
        .select("id", { count: "exact", head: true })
        .eq("status", status)),
    ]);

    const error = recent.error || review.error || counts.find((result) => result.error)?.error || null;
    if (isMissingOtaSchema(error)) {
      return NextResponse.json({ available: false, reason: "migration_not_installed" }, {
        headers: NO_STORE,
      });
    }
    if (error || !Array.isArray(recent.data) || !Array.isArray(review.data)
      || counts.some((result) => typeof result.count !== "number" || result.count < 0)) {
      return NextResponse.json({ error: "OTA inbox status is temporarily unavailable." }, { status: 503, headers: NO_STORE });
    }

    const connectionIds = [...new Set([...recent.data, ...review.data].map((row) => row.connection_id))];
    const providerResult = connectionIds.length ? await admin.from("irp_ota_channel_connections")
      .select("connection_id,provider").in("connection_id", connectionIds) : { data: [], error: null };
    if (isMissingOtaSchema(providerResult.error)) {
      return NextResponse.json({ available: false, reason: "migration_not_installed" }, { headers: NO_STORE });
    }
    if (providerResult.error || !Array.isArray(providerResult.data)
      || providerResult.data.length !== connectionIds.length) {
      return NextResponse.json({ error: "OTA inbox status is temporarily unavailable." }, { status: 503, headers: NO_STORE });
    }
    const providers = new Map<string, string>();
    for (const row of providerResult.data) {
      if (typeof row.connection_id !== "string" || typeof row.provider !== "string"
        || !PROVIDERS.has(row.provider) || providers.has(row.connection_id)) {
        return NextResponse.json({ error: "OTA inbox status is temporarily unavailable." }, { status: 503, headers: NO_STORE });
      }
      providers.set(row.connection_id, row.provider);
    }
    if (connectionIds.some((id) => !providers.has(id))) {
      return NextResponse.json({ error: "OTA inbox status is temporarily unavailable." }, { status: 503, headers: NO_STORE });
    }

    const totals = Object.fromEntries(states.map((status, index) => [status, counts[index].count])) as Record<InboxState, number>;
    return NextResponse.json({
      available: true,
      scope: "all_external_ota_connections",
      totals,
      recent: recent.data.map((row) => publicEvent(row, providers)),
      review: review.data.map((row) => publicEvent(row, providers)),
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "OTA inbox status is temporarily unavailable." }, { status: 503, headers: NO_STORE });
  }
}
