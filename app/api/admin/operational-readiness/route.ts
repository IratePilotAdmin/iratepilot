import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const count = (table: string, column: string, values: string[]) => admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, values);
    const [emailBacklog, emailDeadLetters, deliveryFailures, payoutExceptions, suppressions] = await Promise.all([
      count("email_outbox", "status", ["pending", "failed", "processing"]),
      count("email_outbox", "status", ["dead_letter"]),
      count("email_delivery_events", "processing_status", ["failed"]),
      count("booking_financials", "stripe_transfer_status", ["pending", "failed"]),
      admin.from("email_suppressions").select("recipient_email", { count: "exact", head: true }),
    ]);
    const error = emailBacklog.error || emailDeadLetters.error || deliveryFailures.error
      || payoutExceptions.error || suppressions.error;
    if (error) throw error;

    const metrics = {
      emailBacklog: emailBacklog.count || 0,
      emailDeadLetters: emailDeadLetters.count || 0,
      deliveryWebhookFailures: deliveryFailures.count || 0,
      payoutExceptions: payoutExceptions.count || 0,
      suppressedRecipients: suppressions.count || 0,
    };
    const alerts = [
      ...(metrics.emailDeadLetters ? ["email_dead_letters"] : []),
      ...(metrics.deliveryWebhookFailures ? ["delivery_webhook_failures"] : []),
      ...(metrics.payoutExceptions ? ["payout_exceptions"] : []),
    ];
    logOperationalEvent(alerts.length ? "warning" : "info", "operational_readiness_checked", {
      alertCount: alerts.length,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ ready: alerts.length === 0, metrics, alerts, checkedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    await reportOperationalError("operational_readiness_check_failed", error, { durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "Operational readiness could not be checked." }, { status: 503 });
  }
}
