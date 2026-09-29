import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202608260131_flight_consumer_terminal_recovery_safety.sql";
const rollbackPath = "supabase/rollbacks/202608260131_flight_consumer_terminal_recovery_safety.rollback.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const rollback = readFileSync(resolve(process.cwd(), rollbackPath), "utf8");
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");

function functionBody(name: string, tag: string) {
  const start = migration.indexOf(`create function public.${name}(`);
  const replaceStart = migration.indexOf(`create or replace function public.${name}(`);
  const actualStart = start < 0 ? replaceStart : start;
  expect(actualStart).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf(`as $${tag}$`, actualStart);
  const bodyEnd = migration.indexOf(`$${tag}$;`, bodyStart + tag.length + 5);
  expect(bodyStart).toBeGreaterThan(actualStart);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return migration.slice(bodyStart, bodyEnd);
}

describe("Flight Consumer Preview terminal recovery safety migration", () => {
  it("is relocked, ordered after the completion lease, and mirrored exactly", () => {
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("flight_consumer_completion_leases");
    expect(migration).toContain("migration 092 requires relock before hardening");
    expect(migration).toContain("and not control.provider_live_traffic_enabled");
    const marker = `-- Mirrored from migrations/202608260131_flight_consumer_terminal_recovery_safety.sql.`;
    const markerIndex = schema.lastIndexOf(marker);
    const nextMarkerIndex = schema.indexOf("-- Mirrored from migrations/", markerIndex + marker.length);
    expect(markerIndex).toBeGreaterThan(0);
    expect(nextMarkerIndex).toBeGreaterThan(markerIndex);
    expect(schema.slice(markerIndex + marker.length, nextMarkerIndex).trim()).toBe(migration.trim());
  });

  it("atomically projects every adverse capture terminal and repairs predecessors", () => {
    const helper = functionBody(
      "ensure_flight_consumer_capture_review_case_092",
      "ensure_flight_consumer_capture_review_case_092",
    );
    const complete = functionBody(
      "complete_flight_consumer_payment_operation_v1",
      "complete_flight_consumer_payment_operation_092",
    );
    expect(helper).toContain("v_attempt.state = 'blocked' and v_attempt.revision = 1");
    expect(helper).toContain("v_attempt.state in ('failed', 'ambiguous') and v_attempt.revision = 2");
    expect(helper).toContain("insert into public.flight_reconciliation_cases");
    expect(helper).toContain("'ambiguous_order', 'flight_order'");
    expect(helper).toContain("then 'order_creating' else 'failed' end");
    expect(complete).toContain("complete_flight_consumer_payment_operation_pre092_v1");
    expect(complete).toContain("ensure_flight_consumer_capture_review_case_092");
    expect(migration).toContain("do $flight_consumer_preview_092_backfill$");
    const disabled = migration.indexOf(
      "disable trigger flight_reconciliation_cases_runtime_guard",
    );
    const backfill = migration.indexOf("do $flight_consumer_preview_092_backfill$");
    const enabled = migration.indexOf(
      "enable trigger flight_reconciliation_cases_runtime_guard",
    );
    expect(disabled).toBeGreaterThan(0);
    expect(backfill).toBeGreaterThan(disabled);
    expect(enabled).toBeGreaterThan(backfill);
    expect(migration).toContain("trigger_row.tgenabled = 'O'");
  });

  it("replays an exact active case after unrelated order timestamp advancement", () => {
    const helper = functionBody(
      "ensure_flight_consumer_capture_review_case_092",
      "ensure_flight_consumer_capture_review_case_092",
    );
    const replayStart = helper.indexOf("if found then");
    const replayEnd = helper.indexOf("return v_case.id;", replayStart);
    const replay = helper.slice(replayStart, replayEnd);
    expect(replay).toContain("v_case.expected_state_sha256");
    expect(replay).toContain("v_case.observed_state_sha256");
    expect(replay).toContain("v_case.target_state_sha256");
    expect(replay).not.toContain("source_revision_at is distinct from v_order.updated_at");
  });

  it("blocks Duffel claim behind any active order/payment reconciliation", () => {
    const claim = functionBody(
      "claim_flight_consumer_duffel_order_attempt_v1",
      "claim_flight_consumer_order_092",
    );
    const activeCase = claim.indexOf("reconciliation.status <> 'resolved'");
    const predecessor = claim.indexOf("claim_flight_consumer_duffel_order_attempt_pre092_v1");
    expect(claim).toContain("v_order.status <> 'order_creating'");
    expect(claim).toContain("reconciliation.subject_type = 'flight_order'");
    expect(claim).toContain("reconciliation.subject_type = 'flight_payment'");
    expect(claim).toContain("Active Flight reconciliation blocks Duffel dispatch");
    expect(activeCase).toBeGreaterThan(0);
    expect(predecessor).toBeGreaterThan(activeCase);
  });

  it("uses current binding only before terminality and never authorizes redispatch", () => {
    const recovery = functionBody(
      "get_flight_consumer_duffel_order_recovery_v1",
      "get_flight_consumer_duffel_order_recovery_092",
    );
    const mutableStart = recovery.indexOf("if v_attempt.state in ('prepared', 'dispatching') then");
    const mutableEnd = recovery.indexOf("end if;", mutableStart);
    const evidence = recovery.indexOf("select * into v_evidence", mutableEnd);
    expect(mutableStart).toBeGreaterThan(0);
    expect(recovery.slice(mutableStart, mutableEnd)).toContain("bound_provider_account_sha256");
    expect(evidence).toBeGreaterThan(mutableEnd);
    expect(recovery.slice(mutableEnd, evidence)).not.toContain("bound_provider_account_sha256");
    expect(recovery).toContain("v_attempt.state = 'succeeded'");
    expect(recovery).toContain("v_attempt.terminal_http_status between 200 and 299");
    expect(migration).toContain(`this RPC never
  -- authorizes a provider redispatch`);
  });

  it("keeps internal predecessors ungranted and rollback forward-only", () => {
    expect(migration).toContain(
      "revoke all on function public.ensure_flight_consumer_capture_review_case_092(uuid)",
    );
    expect(migration).toContain(
      "grant execute on function public.get_flight_consumer_duffel_order_recovery_v1(uuid, uuid)",
    );
    expect(rollback).toContain("Migration 092 is forward-only and cannot be rolled back safely");
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
