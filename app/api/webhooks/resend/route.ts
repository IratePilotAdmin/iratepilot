import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deliveryStatus = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
} as const;

type DeliveryEventType = keyof typeof deliveryStatus;

function getDeliveryDetail(event: ReturnType<Resend["webhooks"]["verify"]>) {
  switch (event.type) {
    case "email.bounced": return event.data.bounce.message;
    case "email.failed": return event.data.failed.reason;
    case "email.suppressed": return event.data.suppressed.message;
    default: return null;
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!webhookSecret || !id || !timestamp || !signature) {
    return NextResponse.json({ error: "Webhook configuration or signature is missing." }, { status: 503 });
  }

  const rawBody = await request.text();
  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload: rawBody,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
  }

  if (!(event.type in deliveryStatus) || !("email_id" in event.data)) {
    return NextResponse.json({ received: true, ignored: true, eventType: event.type });
  }

  const eventType = event.type as DeliveryEventType;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("email_delivery_events")
    .upsert({
      webhook_event_id: id,
      resend_email_id: event.data.email_id,
      event_type: eventType,
      payload: event,
      processing_status: "processing",
      occurred_at: event.created_at,
      updated_at: now,
    }, { onConflict: "webhook_event_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (claimError) {
    await reportOperationalError("resend_webhook_claim_failed", claimError, { webhookEventId: id, eventType });
    return NextResponse.json({ error: "Delivery event ledger unavailable." }, { status: 500 });
  }
  if (!claimed) {
    const existing = await admin.from("email_delivery_events")
      .select("processing_status,attempt_count")
      .eq("webhook_event_id", id)
      .single();
    if (existing.error) return NextResponse.json({ error: "Delivery event lookup failed." }, { status: 500 });
    if (existing.data.processing_status === "processed") {
      return NextResponse.json({ received: true, duplicate: true, eventType });
    }
    if (existing.data.processing_status === "processing") {
      return NextResponse.json({ error: "Delivery event is already processing.", retry: true }, { status: 409 });
    }
    const retry = await admin.from("email_delivery_events").update({
      processing_status: "processing",
      attempt_count: existing.data.attempt_count + 1,
      error_message: null,
      updated_at: now,
    }).eq("webhook_event_id", id).eq("processing_status", "failed").select("id").maybeSingle();
    if (retry.error || !retry.data) return NextResponse.json({ error: "Delivery event retry was not claimed." }, { status: 409 });
  }

  try {
    const status = deliveryStatus[eventType];
    const detail = getDeliveryDetail(event);

    const outbox = await admin.from("email_outbox").update({
      delivery_status: status,
      delivery_event_at: event.created_at,
      delivery_detail: detail,
      updated_at: now,
    }).eq("resend_email_id", event.data.email_id);
    if (outbox.error) throw outbox.error;

    if (["email.bounced", "email.complained", "email.suppressed"].includes(eventType)) {
      const reason = eventType === "email.bounced" ? "bounce"
        : eventType === "email.complained" ? "complaint" : "suppressed";
      for (const recipient of event.data.to) {
        const suppression = await admin.from("email_suppressions").upsert({
          recipient_email: recipient.trim().toLowerCase(),
          reason,
          source_event_id: id,
          updated_at: now,
        }, { onConflict: "recipient_email" });
        if (suppression.error) throw suppression.error;
      }
    }

    const completed = await admin.from("email_delivery_events").update({
      processing_status: "processed",
      error_message: null,
      processed_at: now,
      updated_at: now,
    }).eq("webhook_event_id", id).eq("processing_status", "processing");
    if (completed.error) throw completed.error;
    logOperationalEvent("info", "resend_delivery_event_processed", { webhookEventId: id, eventType });
    return NextResponse.json({ received: true, eventType });
  } catch (error) {
    await admin.from("email_delivery_events").update({
      processing_status: "failed",
      error_message: error instanceof Error ? error.message.slice(0, 500) : "Delivery event processing failed",
      updated_at: new Date().toISOString(),
    }).eq("webhook_event_id", id).eq("processing_status", "processing");
    await reportOperationalError("resend_webhook_processing_failed", error, { webhookEventId: id, eventType });
    return NextResponse.json({ error: "Delivery event processing failed." }, { status: 500 });
  }
}
