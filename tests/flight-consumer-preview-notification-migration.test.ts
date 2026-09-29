import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/202608250078_flight_consumer_notification_delivery.sql",
), "utf8");
const rollback = readFileSync(resolve(
  process.cwd(),
  "supabase/rollbacks/202608250078_flight_consumer_notification_delivery.rollback.sql",
), "utf8");
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");

describe("Flight Consumer Preview notification migration", () => {
  it("projects only four authoritative Preview notification outcomes", () => {
    expect(migration).toContain("get_flight_consumer_notification_projection_v1");
    for (const event of ["order_pending", "ticketed", "order_failed", "refund_completed"]) {
      expect(migration).toContain(`'${event}'`);
    }
    expect(migration).toContain("consumer_flow_version = 1");
    expect(migration).toContain("flight_order.execution_mode = 'test'");
    expect(migration).toContain("flight_order.provider_code = 'duffel'");
    expect(migration).toContain("attempt.state = 'succeeded'");
    expect(migration).toContain("document.status = 'issued'");
  });

  it("requires reconciled full-refund evidence before refund-complete copy", () => {
    expect(migration).toContain("public.flight_payment_refund_evidence");
    expect(migration).toContain("evidence.terminal_receipt_sha256 = v_refund_attempt.terminal_receipt_sha256");
    expect(migration).toContain("reconciliation.status = 'resolved'");
    expect(migration).toContain("reconciliation.resolution_evidence_sha256 is not null");
    expect(migration).toContain("'payment_reversed', 'duplicate_suppressed'");
    expect(migration).toContain("reconciliation.subject_id = v_payment.id");
    expect(migration).toContain("v_payment.refunded_cents <> v_order.total_cents");
    expect(migration).toContain("v_order.provider_order_ref_sha256 is not null");
    expect(migration).toContain("Flight refund notification requires reconciled refund evidence");
  });

  it("resolves the recipient only from the authenticated order owner's auth record", () => {
    expect(migration).toContain("from auth.users as users");
    expect(migration).toContain("users.id = v_projection.customer_id");
    expect(migration).toContain("users.email_confirmed_at is not null");
    expect(migration).not.toContain("p_recipient_email");
  });

  it("queues atomically with durable business dedupe and no PII or provider references in template_data", () => {
    expect(migration).toContain("unique (order_id, event_type, event_receipt_id)");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("insert into public.email_outbox");
    expect(migration).toContain("'dedupe_key', p_dedupe_key");
    expect(migration).toContain("'message', p_message");
    expect(migration).toContain("'action_url', p_action_url");
    const outboxInsertStart = migration.indexOf("insert into public.email_outbox");
    const receiptInsertStart = migration.indexOf(
      "insert into public.flight_consumer_notification_outbox_receipts",
      outboxInsertStart,
    );
    expect(outboxInsertStart).toBeGreaterThan(-1);
    expect(receiptInsertStart).toBeGreaterThan(outboxInsertStart);
    const outboxInsert = migration.slice(outboxInsertStart, receiptInsertStart);
    expect(outboxInsert).toContain("jsonb_build_object(");
    expect(outboxInsert).not.toMatch(
      /booking_reference|provider_order|ticket_document|payment_id|customer_id/i,
    );
  });

  it("cannot mutate commerce state and exposes only service-role RPCs", () => {
    expect(migration).not.toMatch(/update\s+public\.flight_(orders|payments|ticket_documents)/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.flight_/i);
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("grant execute on function public.queue_flight_consumer_notification_v1");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain(
      "alter table public.flight_consumer_notification_outbox_receipts force row level security",
    );
  });

  it("has a matching rollback that preserves already-queued customer email", () => {
    expect(rollback).toContain("drop function public.queue_flight_consumer_notification_v1");
    expect(rollback).toContain("drop function public.get_flight_consumer_notification_projection_v1");
    expect(rollback).toContain("drop table public.flight_consumer_notification_outbox_receipts");
    expect(rollback).not.toMatch(/delete\s+from\s+public\.email_outbox/i);
  });

  it("mirrors the exact migration after async Duffel finalization in canonical schema", () => {
    const normalizedSchema = schema.replaceAll("\r\n", "\n");
    const normalizedMigration = migration.replaceAll("\r\n", "\n");
    expect(normalizedSchema).toContain(normalizedMigration);
    expect(normalizedSchema.indexOf("create function public.finalize_flight_consumer_async_duffel_order_v1"))
      .toBeLessThan(normalizedSchema.indexOf(
        "create function public.get_flight_consumer_notification_projection_v1",
      ));
    expect(normalizedSchema.match(
      /create function public\.get_flight_consumer_notification_projection_v1/g,
    )).toHaveLength(1);
  });
});
