import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(
  root,
  "supabase/migrations/202608250079_flight_consumer_preview_support_intake.sql",
), "utf8").toLowerCase();
const rollback = readFileSync(join(
  root,
  "supabase/rollbacks/202608250079_flight_consumer_preview_support_intake.rollback.sql",
), "utf8").toLowerCase();
const schema = readFileSync(join(root, "supabase/schema.sql"), "utf8").toLowerCase();

function normalized(value: string) {
  return value.replaceAll("\r\n", "\n").trimEnd();
}

describe("Flight Consumer Preview support-intake migration", () => {
  it("creates strict owner-create, owner-list, and admin-list RPCs only", () => {
    for (const signature of [
      "create_flight_consumer_preview_service_request_v1",
      "list_flight_consumer_preview_service_requests_v1",
      "list_flight_consumer_admin_service_requests_v1",
    ]) expect(migration).toContain(`create function public.${signature}`);
    expect(migration).toContain("coalesce(auth.role(), '') <> 'authenticated'");
    expect(migration).toContain("v_order.customer_id <> v_actor");
    expect(migration).toContain("profile.role = 'admin'");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toMatch(/to anon\b/);
    expect(migration).not.toMatch(/to service_role\b/);
  });

  it("admits only finalized exact-scope test tickets while servicing stays disabled", () => {
    expect(migration).toContain("v_order.consumer_flow_version <> 1");
    expect(migration).toContain("v_order.execution_mode <> 'test'");
    expect(migration).toContain("v_order.provider_code <> 'duffel'");
    expect(migration).toContain("v_order.status <> 'ticketed'");
    expect(migration).toContain("payment.status = 'captured'");
    expect(migration).toContain("document.status = 'issued'");
    expect(migration).toContain("assert_flight_consumer_preview_runtime_v1(");
    expect(migration).toContain("'ticketing'");
    expect(migration).not.toContain("servicing_enabled = true");
    expect(migration).not.toMatch(/update\s+public\.flight_orders/);
    expect(migration).not.toMatch(/insert\s+into\s+public\.flight_provider/);
    expect(migration).not.toMatch(/net\.http|http_post|extensions\.http/);
  });

  it("binds UUID idempotency to owner/order/scope and rejects payload collisions", () => {
    expect(migration).toContain("'idempotency_key_sha256', p_idempotency_key_sha256");
    expect(migration).toContain("'customer_id', v_actor::text");
    expect(migration).toContain("'order_id', v_order.id::text");
    expect(migration).toContain("flight_service_requests_order_id_request_sha256_key do nothing");
    expect(migration).toContain("support idempotency key collides");
    expect(migration).toContain("using errcode = '23505'");
  });

  it("uses only bounded reason-code pairs and no freeform intake column", () => {
    for (const reason of [
      "plans_changed",
      "duplicate_test_booking",
      "travel_date_change",
      "route_change",
      "test_refund_review",
      "schedule_change_review",
      "connection_risk",
      "fictional_name_correction",
      "test_document_review",
    ]) expect(migration).toContain(`'${reason}'`);
    expect(migration).not.toMatch(/freeform|traveler_email|traveler_name|phone_number|message_body/);
  });

  it("restores the original servicing trigger without deleting request evidence", () => {
    expect(rollback).toContain("public.enforce_flight_runtime_capability('servicing')");
    expect(rollback).toContain("drop function public.enforce_flight_consumer_preview_service_intake_v1()");
    expect(rollback).not.toMatch(/delete\s+from|truncate\s+table|drop\s+table/);
  });

  it("mirrors the exact 079 migration before activation control", () => {
    const supportMarker =
      "-- mirrored from migrations/202608250079_flight_consumer_preview_support_intake.sql.";
    const activationMarker =
      "-- mirrored from migrations/202608250080_flight_consumer_preview_activation_control.sql.";
    const supportStart = schema.indexOf(supportMarker);
    const activationStart = schema.indexOf(activationMarker);
    expect(supportStart).toBeGreaterThan(-1);
    expect(activationStart).toBeGreaterThan(supportStart);
    expect(normalized(
      schema.slice(supportStart + supportMarker.length, activationStart).trimStart(),
    )).toBe(normalized(migration));
    const asyncFinalization = schema.indexOf(
      "create function public.finalize_flight_consumer_async_duffel_order_v1",
    );
    const notifications = schema.indexOf(
      "create table public.flight_consumer_notification_outbox_receipts",
    );
    const support = schema.indexOf(
      "create function public.create_flight_consumer_preview_service_request_v1",
    );
    expect(asyncFinalization).toBeGreaterThan(0);
    expect(notifications).toBeGreaterThan(asyncFinalization);
    expect(support).toBeGreaterThan(notifications);
    expect(schema.match(/create function public\.create_flight_consumer_preview_service_request_v1/g))
      .toHaveLength(1);
  });
});
