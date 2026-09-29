import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608250077_flight_consumer_preview_async_finalization.sql";
const rollbackPath =
  "supabase/rollbacks/202608250077_flight_consumer_preview_async_finalization.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

function functionBody(name: string) {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("\ncreate ", start + 20);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("flight consumer Preview async finalization migration", () => {
  it("requires the complete 076 encrypted recovery control plane", () => {
    for (const dependency of [
      "public.flight_order_recovery_evidence_vault",
      "public.flight_consumer_webhook_ledger",
      "public.flight_offer_evidence_vault",
      "public.assert_flight_consumer_preview_runtime_v1(text,text)",
      "public.flight_jsonb_has_exact_keys_v1(jsonb,text[])",
      "public.resolve_flight_consumer_admin_reconciliation_v1(uuid,timestamptz,text,text)",
      "extensions.digest(bytea,text)",
    ]) expect(migration).toContain(dependency);
  });

  it("records system convergence without impersonating an administrator", () => {
    expect(migration).toContain("add column resolution_actor_type text not null default 'administrator'");
    expect(migration).toContain("add column system_resolution_receipt_sha256 text");
    expect(migration).toContain("resolution_actor_type in ('administrator', 'system')");
    expect(migration).toContain("resolution_actor_type = 'system'");
    expect(migration).toContain("resolved_by is null");
    const validator = functionBody(
      "validate_flight_consumer_async_system_resolution_v1",
    );
    expect(validator).toContain("app.flight_consumer_async_system_resolution_authorized");
    expect(validator).toContain("old.case_type <> 'ambiguous_order'");
    expect(validator).toContain("old.target_status <> 'order_creating'");
    expect(validator).toContain("new.resolution_code <> 'provider_state_confirmed'");
    expect(validator).toContain("attempt.state = 'succeeded' and attempt.revision = 2");
    expect(validator).toContain("ledger.state = 'processed' and ledger.revision = 2");
    expect(validator).toContain("payment.status = 'captured'");
    expect(validator).not.toContain("auth.uid()");
  });

  it("preserves inherited guards outside the exact transaction-local exceptions", () => {
    expect(migration).toContain(
      "execute function public.validate_flight_order_child_mode()",
    );
    expect(migration).toContain(
      "execute function public.protect_flight_operational_evidence()",
    );
    expect(migration).toContain(
      "execute function public.validate_flight_order_transition()",
    );
    expect(migration).toContain("old.status = 'requires_review'");
    expect(migration).toContain("new.status = 'booked'");
    expect(migration).toContain("app.flight_consumer_async_finalization_authorized");
    const orderGuard = functionBody(
      "validate_flight_consumer_async_order_finalization_v1",
    );
    expect(orderGuard).toContain("Flight async provider-order binding is invalid");
    expect(orderGuard).toContain("attempt.state = 'succeeded'");
    expect(orderGuard).toContain("ledger.event_type = 'order.created'");
    expect(orderGuard).toContain("ledger.provider_live_mode is false");
    expect(orderGuard).toContain("payment.status = 'captured'");
    expect(orderGuard).toContain("reconciliation.resolution_actor_type = 'system'");
  });

  it("atomically completes the webhook lease and stores encrypted GET evidence", () => {
    const body = functionBody(
      "complete_flight_consumer_duffel_recovery_evidence_v1",
    );
    expect(body).toContain("p_expected_revision is distinct from 1");
    const complete = body.indexOf("complete_flight_consumer_webhook_lease_v1");
    const record = body.indexOf(
      "record_flight_consumer_duffel_order_recovery_evidence_v1",
    );
    expect(complete).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(complete);
    expect(body).toContain("'processed', p_outcome_sha256");
    expect(body).toContain("v_ledger.state = 'processing' and v_ledger.revision = 1");
    expect(body).toContain("v_ledger.state = 'processed' and v_ledger.revision = 2");
    expect(body).toContain("v_ledger.outcome_sha256 is not distinct from p_outcome_sha256");
    expect(body).toContain("Flight Duffel recovery completion replay collides");
    expect(body).toContain("p_recovery_evidence_receipt_sha256");
    expect(body).not.toContain("commit;");
  });

  it("exposes owner-scoped terminal replay context without ciphertext", () => {
    const body = functionBody(
      "get_flight_consumer_async_duffel_convergence_v1",
    );
    for (const field of [
      "provider_attempt_state text",
      "ledger_state text",
      "provider_order_ref_sha256 text",
      "recovery_evidence_receipt_sha256 text",
      "reconciliation_resolution_actor_type text",
      "reconciliation_system_receipt_sha256 text",
      "issued_ticket_count integer",
    ]) expect(body).toContain(field);
    expect(body).toContain("flight_order.customer_id = p_customer_id");
    expect(body).toContain("ledger.state = 'processing' and ledger.revision = 1");
    expect(body).toContain("ledger.state = 'processed' and ledger.revision = 2");
    expect(body).toContain("attempt.state = 'succeeded' and attempt.revision = 2");
    expect(body).not.toContain("ciphertext_base64url");
    expect(body).not.toContain("provider_order_ref_ciphertext");
  });

  it("finalizes only exact processed async evidence without provider redispatch", () => {
    const body = functionBody(
      "finalize_flight_consumer_async_duffel_order_v1",
    );
    expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(body).toContain("for update");
    expect(body).toContain("assert_flight_consumer_preview_runtime_v1");
    expect(body).toContain("v_attempt.state <> 'succeeded' or v_attempt.revision <> 2");
    expect(body).toContain("v_attempt.retry_authorized");
    expect(body).toContain("v_ledger.event_type <> 'order.created'");
    expect(body).toContain("v_ledger.provider_live_mode is distinct from false");
    expect(body).toContain("v_payment.status <> 'captured'");
    expect(body).toContain("v_payment.refunded_cents <> 0");
    expect(body).toContain("v_recovery.webhook_verification_receipt_sha256");
    expect(body).not.toContain(
      "v_recovery.provider_response_sha256 is distinct from v_attempt.terminal_response_sha256",
    );
    expect(body).toContain("flight_jsonb_has_exact_keys_v1");
    expect(body).toContain("resolution_actor_type = 'system'");
    expect(body).toContain("system_resolution_receipt_sha256");
    expect(body).toContain("status = 'booked'");
    expect(body).toContain("status = 'ticketing_pending'");
    expect(body).toContain("status = 'ticketed'");
    expect(body).toContain("Exactly one async Duffel e-ticket is required per passenger");
    expect(body).not.toContain("insert into public.flight_provider_request_attempts");
    expect(body).not.toContain("state = 'dispatching'");
  });

  it("is stable under exact terminal replay and changing GET bytes are never refetched", () => {
    const finalizer = functionBody(
      "finalize_flight_consumer_async_duffel_order_v1",
    );
    expect(finalizer).toContain("if v_order.status = 'ticketed' then");
    expect(finalizer).toContain("Flight async finalization replay collides");
    expect(finalizer).toContain("Flight async system review replay collides");
    const canonical = finalizer.slice(
      finalizer.indexOf("select jsonb_agg(jsonb_build_object("),
      finalizer.indexOf("v_system_resolution_receipt_sha256 := encode"),
    );
    expect(canonical).toContain("provider_passenger_ref_sha256");
    expect(canonical).toContain("document_ref_sha256");
    expect(canonical).toContain("issuing_carrier");
    expect(canonical).not.toContain("provider_passenger_ref_ciphertext");
    expect(canonical).not.toContain("document_ref_ciphertext");
    const replay = finalizer.slice(
      finalizer.indexOf("if v_order.status = 'ticketed' then"),
      finalizer.indexOf("if v_order.provider_order_ref_ciphertext is not null"),
    );
    expect(replay).not.toContain(
      "provider_order_ref_ciphertext\n        is distinct from",
    );
    expect(replay).not.toContain(
      "provider_passenger_ref_ciphertext\n        is distinct from",
    );
    expect(replay).not.toContain(
      "document_ref_ciphertext\n          is distinct from",
    );
    const recovery = functionBody(
      "get_flight_consumer_async_duffel_convergence_v1",
    );
    expect(recovery).toContain("evidence.recovery_evidence_receipt_sha256");
    expect(recovery).not.toMatch(/(?:http|fetch|GET \/air\/orders)/i);
  });

  it("revokes every helper and grants only the three service RPCs", () => {
    for (const helper of [
      "validate_flight_consumer_async_system_resolution_v1",
      "validate_flight_consumer_async_order_finalization_v1",
    ]) {
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${helper}\\(\\)`),
      );
      expect(migration).not.toMatch(
        new RegExp(`grant execute on function public\\.${helper}`),
      );
    }
    for (const rpc of [
      "complete_flight_consumer_duffel_recovery_evidence_v1",
      "get_flight_consumer_async_duffel_convergence_v1",
      "finalize_flight_consumer_async_duffel_order_v1",
    ]) expect(migration).toMatch(
      new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?\\) to service_role;`),
    );
    expect(migration).not.toMatch(/grant [^;]+ on table/i);
  });

  it("uses an evidence-preserving forward-only rollback", () => {
    expect(rollback).toContain("Migration 077 is forward-only");
    expect(rollback).toContain("flight_order_recovery_evidence_vault");
    expect(rollback).toContain("flight_consumer_webhook_ledger");
    expect(rollback).toContain("relock_flight_consumer_preview_v1");
    expect(rollback).not.toMatch(/\b(?:drop|truncate|delete|update|insert)\b/i);
  });

  it("mirrors the exact reviewed migration bytes once in the bootstrap schema", () => {
    const marker =
      "-- Mirrored from migrations/202608250077_flight_consumer_preview_async_finalization.sql.";
    expect(schema.split(marker)).toHaveLength(2);
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
