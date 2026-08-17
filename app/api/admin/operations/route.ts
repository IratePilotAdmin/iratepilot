import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildAutomationOperationsSnapshot,
  type AutomationActivity,
  type AutomationActivityState,
} from "@/lib/admin/automation-operations";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export const dynamic = "force-dynamic";

type QueryResult = { error: unknown; count?: number | null; data?: unknown };

const emailState = (status: string): AutomationActivityState => {
  if (["failed", "dead_letter"].includes(status)) return "failed";
  if (["pending", "processing"].includes(status)) return "processing";
  return "completed";
};

const ledgerState = (status: string): AutomationActivityState => {
  if (status === "failed") return "failed";
  if (["pending", "processing", "started"].includes(status)) return "processing";
  if (status === "ignored") return "attention";
  return "completed";
};

export async function GET() {
  const startedAt = Date.now();
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const count = (table: string, column: string, values: Array<string | boolean>) => admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, values);

    const results = await Promise.all([
      count("email_outbox", "status", ["pending"]),
      count("email_outbox", "status", ["processing"]),
      count("email_outbox", "status", ["failed"]),
      count("email_outbox", "status", ["dead_letter"]),
      count("email_delivery_events", "processing_status", ["failed"]),
      count("bookings", "status", ["pending"]),
      count("booking_cancellation_requests", "status", ["pending"]),
      count("partner_applications", "status", ["pending"]),
      count("contact_messages", "status", ["new", "in_progress"]),
      count("stripe_financial_events", "processing_status", ["processing"]),
      count("stripe_financial_events", "processing_status", ["failed"]),
      count("booking_financials", "stripe_transfer_status", ["pending"]),
      count("booking_financials", "stripe_transfer_status", ["failed"]),
      count("pms_connection_test_events", "result", ["failed"]),
      count("synxis_request_journal", "status", ["started"]),
      count("synxis_request_journal", "status", ["failed"]),
      count("priority_pms_launch_evidence", "live_enabled", [true]),
      count("synxis_crs_launch_evidence", "live_enabled", [true]),
      admin.from("email_outbox").select("id,status,template_name,updated_at").order("updated_at", { ascending: false }).limit(4),
      admin.from("stripe_financial_events").select("id,event_type,processing_status,updated_at").order("updated_at", { ascending: false }).limit(4),
      admin.from("pms_connection_test_events").select("id,validation_mode,result,detail_code,created_at").order("created_at", { ascending: false }).limit(3),
      admin.from("synxis_request_journal").select("id,operation,traffic_mode,status,started_at,completed_at").order("started_at", { ascending: false }).limit(3),
    ]) as QueryResult[];
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;

    const value = (index: number) => results[index].count || 0;
    const emailRows = (results[18].data || []) as Array<{ id: string; status: string; template_name: string; updated_at: string }>;
    const stripeRows = (results[19].data || []) as Array<{ id: string; event_type: string; processing_status: string; updated_at: string }>;
    const pmsRows = (results[20].data || []) as Array<{ id: string; validation_mode: string; result: string; detail_code: string; created_at: string }>;
    const synxisRows = (results[21].data || []) as Array<{ id: string; operation: string; traffic_mode: string; status: string; started_at: string; completed_at: string | null }>;

    const activity: AutomationActivity[] = [
      ...emailRows.map((row) => ({
        id: `email:${row.id}`,
        lane: "communications" as const,
        label: "Transactional email",
        detail: `${row.template_name.replaceAll("_", " ")} · ${row.status}`,
        state: emailState(row.status),
        createdAt: row.updated_at,
      })),
      ...stripeRows.map((row) => ({
        id: `stripe:${row.id}`,
        lane: "payments" as const,
        label: "Stripe event",
        detail: `${row.event_type} · ${row.processing_status}`,
        state: ledgerState(row.processing_status),
        createdAt: row.updated_at,
      })),
      ...pmsRows.map((row) => ({
        id: `pms:${row.id}`,
        lane: "suppliers" as const,
        label: "PMS validation",
        detail: `${row.validation_mode.replaceAll("_", " ")} · ${row.detail_code}`,
        state: ledgerState(row.result),
        createdAt: row.created_at,
      })),
      ...synxisRows.map((row) => ({
        id: `synxis:${row.id}`,
        lane: "suppliers" as const,
        label: "SynXis request receipt",
        detail: `${row.operation.replaceAll("_", " ")} · ${row.traffic_mode} · ${row.status}`,
        state: ledgerState(row.status),
        createdAt: row.completed_at || row.started_at,
      })),
    ];

    const snapshot = buildAutomationOperationsSnapshot({
      emailPending: value(0),
      emailProcessing: value(1),
      emailFailed: value(2),
      emailDeadLetters: value(3),
      emailWebhookFailures: value(4),
      pendingBookings: value(5),
      pendingCancellations: value(6),
      pendingPartners: value(7),
      openSupport: value(8),
      stripeProcessing: value(9),
      stripeFailures: value(10),
      payoutPending: value(11),
      payoutFailures: value(12),
      pmsTestFailures: value(13),
      synxisStarted: value(14),
      synxisFailures: value(15),
      livePmsConnections: value(16),
      liveSynxisConnections: value(17),
    }, {
      pilotMode: process.env.PILOT_MODE === "true",
      publicBookingEnabled: process.env.NEXT_PUBLIC_PUBLIC_BOOKING === "true",
      liveBookingPaymentsEnabled: process.env.ENABLE_LIVE_BOOKING_PAYMENTS === "true",
      liveStripeWebhooksEnabled: process.env.ENABLE_LIVE_STRIPE_WEBHOOKS === "true",
      livePartnerPayoutsEnabled: process.env.ENABLE_LIVE_PARTNER_PAYOUTS === "true",
      emailWorkerEnabled: process.env.EMAIL_WORKER_ENABLED === "true",
    }, activity);

    logOperationalEvent(snapshot.summary.attentionCount || snapshot.summary.failureCount ? "warning" : "info", "automation_operations_checked", {
      queueDepth: snapshot.summary.totalQueue,
      failureCount: snapshot.summary.failureCount,
      attentionCount: snapshot.summary.attentionCount,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await reportOperationalError("automation_operations_check_failed", error, { durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "Automation operations could not be loaded." }, { status: 503 });
  }
}
