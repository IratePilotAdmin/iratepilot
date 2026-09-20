import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608250075_flight_consumer_preview_orchestration.sql";
const rollbackPath =
  "supabase/rollbacks/202608250075_flight_consumer_preview_orchestration.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

function functionBody(name: string) {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("\ncreate ", start + 20);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("flight consumer Preview orchestration migration", () => {
  it("hydrates transaction authority before evaluating the 074 capability gate", () => {
    const authority = functionBody("assert_flight_consumer_preview_runtime_v1");
    const capability = authority.indexOf("flight_runtime_capability_enabled(");
    expect(capability).toBeGreaterThan(-1);
    for (const setting of [
      "app.flight_environment",
      "app.flight_project_ref",
      "app.flight_execution_authorized",
      "app.flight_activation_evidence_sha256",
    ]) {
      const hydrated = authority.search(
        new RegExp(`perform set_config\\(\\s*'${setting.replaceAll(".", "\\.")}'`),
      );
      expect(hydrated).toBeGreaterThan(-1);
      expect(hydrated).toBeLessThan(capability);
    }
  });

  it("links consumer orders and every refreshed vault record to one exact reprice", () => {
    expect(migration).toContain("add column reprice_receipt_id uuid");
    expect(migration).toContain("add column local_offer_id text");
    expect(migration).toContain("flight_offer_evidence_vault_reprice_fk");
    expect(migration).toContain("flight_offer_evidence_vault_reprice_stage_check");
    expect(migration).toMatch(
      /create unique index flight_orders_consumer_reprice_uidx[\s\S]*?where consumer_flow_version = 1;/,
    );
    expect(migration).toContain(
      "flight_order.reprice_receipt_id = evidence.reprice_receipt_id",
    );
    expect(migration).toContain(
      "evidence.reprice_receipt_id = v_order.reprice_receipt_id",
    );
    expect(migration).toContain(
      "create function public.get_flight_consumer_offer_evidence_context_v1(",
    );
    const context = functionBody("get_flight_consumer_offer_evidence_context_v1");
    for (const field of [
      "receipt_sha256 text",
      "local_offer_id text",
      "reprice_receipt_id uuid",
      "retention_expires_at timestamptz",
    ]) expect(context).toContain(field);
    expect(context).toContain("evidence.retention_expires_at > clock_timestamp()");
    expect(migration).toMatch(
      /grant execute on function public\.get_flight_consumer_offer_evidence_context_v1\([\s\S]*?\) to service_role;/,
    );
  });

  it("uses one immutable provider identity for search, reprice, and order", () => {
    expect(migration).toMatch(
      /create unique index flight_provider_attempt_consumer_search_uidx[\s\S]*?operation = 'create_offer_request';/,
    );
    expect(migration).toMatch(
      /create unique index flight_provider_attempt_consumer_reprice_uidx[\s\S]*?operation = 'retrieve_offer';/,
    );
    expect(migration).toContain("consumer_idempotency_key_sha256");
    expect(migration).toContain("consumer_idempotency_request_sha256");
    expect(migration).toContain("operation in ('create_order', 'list_orders_by_offer')");
    expect(migration).toContain(
      "create function public.protect_flight_consumer_provider_idempotency_v1()",
    );
  });

  it("materializes strict normalized search and reprice evidence atomically", () => {
    const search = functionBody("complete_flight_consumer_search_v1");
    expect(search).toContain("jsonb_array_length(p_normalized_offers) > 5");
    expect(search).toContain("flight_jsonb_has_exact_keys_v1(v_offer_json");
    expect(search).toContain("flight_jsonb_has_exact_keys_v1(v_segment_json");
    expect(search).toContain("flight_jsonb_has_exact_keys_v1(v_terms_json");
    expect(search).toContain("flight_jsonb_has_exact_keys_v1(v_evidence_json");
    expect(search).toContain("v_offer_json ->> 'local_offer_id'");
    expect(search).toContain("insert into public.flight_offers");
    expect(search).toContain("insert into public.flight_offer_segments");
    expect(search).toContain("insert into public.flight_offer_fare_terms");
    expect(search).toContain("insert into public.flight_offer_evidence_vault");
    expect(search).toContain("set status = 'complete'");

    const reprice = functionBody("complete_flight_consumer_reprice_v1");
    expect(reprice).toContain("insert into public.flight_reprice_receipts");
    expect(reprice).toContain("'refreshed'");
    expect(reprice).toContain("v_predecessor.local_offer_id");
    expect(reprice).toContain("resource_type = 'flight_reprice_receipt'");

    const searchFailure = functionBody("fail_flight_consumer_search_v1");
    expect(searchFailure).toContain(
      "v_attempt.state not in ('succeeded', 'failed', 'ambiguous', 'blocked')",
    );
    expect(searchFailure).toContain("exists (select 1 from public.flight_offers");
    expect(migration).toContain(
      "create function public.fail_flight_consumer_reprice_v1(",
    );
  });

  it("stores exact encrypted passengers and creates orders only after acceptance", () => {
    const acceptance = functionBody(
      "accept_flight_consumer_reprice_and_create_order_v1",
    );
    expect(acceptance).toContain("v_actor uuid := auth.uid()");
    expect(acceptance).toContain("v_reprice.status = 'price_changed'");
    expect(acceptance).toContain("customer_accepted_by = v_actor");
    expect(acceptance).toContain("consumer_flow_version");
    expect(acceptance).toContain("'pending_payment', 1");

    const checkout = functionBody("prepare_flight_consumer_checkout_v1");
    for (const key of [
      "traveler_sequence",
      "traveler_type",
      "secure_pii_record_ref",
      "pii_record_sha256",
      "pii_authority_receipt_sha256",
      "retention_expires_at",
      "key_version",
      "iv_base64url",
      "auth_tag_base64url",
      "ciphertext_base64url",
      "aad_sha256",
      "pii_hmac_sha256",
    ]) expect(checkout).toContain(`'${key}'`);
    expect(checkout).toContain("insert into public.flight_secure_pii_records");
    expect(checkout).toContain("insert into public.flight_passenger_refs");
    expect(checkout).toContain("generate_series(1, v_expected)");
    expect(checkout).toContain("operation, execution_scope_sha256");
    expect(checkout).toContain("'create_intent'");
  });

  it("journals Stripe with exact CAS before capture or compensation applies", () => {
    expect(migration).toContain("create table public.flight_payment_operation_attempts");
    expect(migration).not.toMatch(
      /\b(?:card_number|client_secret|cvc|raw_http|raw_response|stripe_secret)\s+(?:text|json|jsonb)\b/i,
    );
    const terminal = functionBody("complete_flight_consumer_payment_operation_v1");
    expect(terminal).toContain("v_attempt.state = 'prepared'");
    expect(terminal).toContain("p_expected_revision <> 0");
    expect(terminal).toContain("p_terminal_state <> 'blocked'");
    expect(terminal).toContain("v_attempt.state = 'dispatching'");
    expect(terminal).toContain("p_expected_revision <> 1");
    expect(terminal).toContain("p_terminal_state not in ('succeeded', 'failed', 'ambiguous')");
    expect(terminal).toContain("revision = revision + 1");
    const captureApply = functionBody("apply_flight_consumer_capture_v1");
    expect(captureApply).toContain(
      "v_attempt.state <> 'succeeded'",
    );
    expect(captureApply).toContain("v_payment.status = 'captured'");
    const refundApply = functionBody(
      "apply_flight_consumer_refund_compensation_v1",
    );
    expect(refundApply).toContain(
      "v_attempt.state <> 'succeeded'",
    );
    expect(refundApply).toContain("v_order.status = 'failed'");
    expect(refundApply).toContain("Flight refund application replay collides");
    const recovery = functionBody("get_flight_consumer_payment_operation_v1");
    for (const field of [
      "idempotency_key_sha256 text",
      "idempotency_request_sha256 text",
      "request_sha256 text",
      "dispatch_not_after timestamptz",
      "terminal_receipt_sha256 text",
      "payment_id uuid",
    ]) expect(recovery).toContain(field);
    expect(recovery).not.toContain("processor_object_ref_ciphertext");
    expect(recovery).toContain("v_attempt.adapter_source_sha256");
    expect(migration).toMatch(
      /grant execute on function public\.get_flight_consumer_payment_operation_v1\(\s*uuid, uuid, text\s*\) to service_role;/,
    );
  });

  it("locks order before attempt before control before liability evidence", () => {
    for (const name of [
      "claim_flight_consumer_duffel_order_attempt_v1",
      "apply_flight_consumer_capture_v1",
      "apply_flight_consumer_refund_compensation_v1",
    ]) {
      const body = functionBody(name);
      const order = body.indexOf("select * into v_order");
      const attempt = body.indexOf("select * into v_attempt");
      const control = body.indexOf("select * into v_control");
      const payment = body.indexOf("select * into v_payment");
      expect(order).toBeGreaterThan(-1);
      expect(attempt).toBeGreaterThan(order);
      expect(control).toBeGreaterThan(attempt);
      expect(payment).toBeGreaterThan(control);
    }
  });

  it("accepts an exact already-terminal Duffel transport replay and finalizes once", () => {
    const terminal = functionBody("record_flight_consumer_duffel_order_terminal_v1");
    expect(terminal).toContain("v_attempt.revision = 2");
    expect(terminal).toContain("p_expected_revision <> 2");
    expect(terminal).toContain("Flight Duffel terminal replay does not match the journal");
    expect(terminal).toContain("v_attempt.state = 'dispatching'");
    expect(terminal).toContain("insert into public.flight_order_response_evidence_vault");
    const recovery = functionBody(
      "get_flight_consumer_duffel_order_recovery_v1",
    );
    for (const field of [
      "attempt_id uuid",
      "attempt_revision integer",
      "attempt_state text",
      "request_sha256 text",
      "operation_authority_receipt_sha256 text",
      "terminal_response_sha256 text",
      "terminal_receipt_sha256 text",
      "response_evidence_receipt_sha256 text",
    ]) expect(recovery).toContain(field);
    expect(recovery).not.toContain("ciphertext_base64url");
    expect(recovery).toContain("v_attempt.retry_authorized");
    expect(migration).toMatch(
      /grant execute on function public\.get_flight_consumer_duffel_order_recovery_v1\(\s*uuid, uuid\s*\) to service_role;/,
    );
    const responseLoad = functionBody(
      "load_flight_consumer_order_response_evidence_v1",
    );
    expect(responseLoad).toContain("attempt.state = 'succeeded'");
    expect(responseLoad).toContain("attempt.revision = 2");
    expect(responseLoad).toContain(
      "evidence.retention_expires_at > clock_timestamp()",
    );
    expect(responseLoad).toContain("ciphertext_base64url text");
    expect(migration).toMatch(
      /grant execute on function public\.load_flight_consumer_order_response_evidence_v1\(\s*uuid, uuid, uuid, text\s*\) to service_role;/,
    );

    const finalize = functionBody("finalize_flight_consumer_duffel_order_v1");
    expect(finalize).toContain("v_attempt.state <> 'succeeded'");
    expect(finalize).toContain("v_order.status = 'ticketed'");
    expect(finalize).toContain("Flight Duffel finalization replay collides");
    const replay = finalize.slice(
      finalize.indexOf("if v_order.status = 'ticketed' then"),
      finalize.indexOf("if v_order.status <> 'order_creating'"),
    );
    expect(replay).not.toContain(
      "v_order.provider_order_ref_ciphertext\n        is distinct from p_provider_order_ref_ciphertext",
    );
    expect(replay).not.toContain(
      "v_passenger.provider_passenger_ref_ciphertext\n          is distinct from",
    );
    expect(replay).not.toContain(
      "v_ticket.document_ref_ciphertext\n          is distinct from",
    );
    expect(replay).toContain("v_order.provider_order_ref_sha256");
    expect(replay).toContain("v_passenger.provider_passenger_ref_sha256");
    expect(replay).toContain("v_ticket.document_ref_sha256");
    expect(finalize).toContain("status = 'captured'");
    expect(finalize).toContain("reprice_receipt_id = v_order.reprice_receipt_id");
    expect(finalize).toContain("status = 'booked'");
    expect(finalize).toContain("set status = 'ticketing_pending'");
    expect(finalize).toContain("status = 'issued'");
    expect(finalize).toContain("set status = 'ticketed'");
    expect(finalize).toContain(
      "Exactly one distinct Duffel e-ticket is required per passenger",
    );
  });

  it("makes ambiguity, no-order compensation, and webhook convergence durable", () => {
    expect(migration).toContain(
      "create function public.mark_flight_consumer_order_ambiguous_v1(",
    );
    const ambiguous = functionBody("mark_flight_consumer_order_ambiguous_v1");
    expect(ambiguous).toContain(
      "'prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked'",
    );
    expect(ambiguous).toContain(
      "v_attempt.state = 'prepared' and v_attempt.revision <> 0",
    );
    expect(ambiguous).toContain(
      "v_attempt.state in ('dispatching', 'blocked') and v_attempt.revision <> 1",
    );
    expect(ambiguous).toContain(
      "case when v_attempt.state in ('prepared', 'blocked')",
    );
    expect(migration).toContain(
      "create function public.resolve_flight_consumer_review_v1(",
    );
    const unstarted = functionBody(
      "mark_flight_consumer_captured_order_unstarted_v1",
    );
    expect(unstarted).toContain(
      "v_order.status not in ('payment_authorized', 'requires_review')",
    );
    expect(unstarted).toContain("attempt.operation = 'create_order'");
    expect(unstarted).toContain("v_capture_attempt.state <> 'succeeded'");
    expect(unstarted).toContain("v_capture_attempt.revision <> 2");
    expect(unstarted).toContain("payment.status = 'captured'");
    expect(unstarted).toContain("set status = 'requires_review'");
    expect(unstarted).toContain("'failed', v_target_sha256, 'open'");
    expect(migration).toMatch(
      /grant execute on function public\.mark_flight_consumer_captured_order_unstarted_v1\(\s*uuid, text, text\s*\) to service_role;/,
    );
    const refund = functionBody("prepare_flight_consumer_refund_compensation_v1");
    expect(refund).toContain("v_provider_attempt.id is not null and (");
    expect(refund).toContain(
      "'prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked'",
    );
    expect(refund).toContain("reconciliation.target_status = 'failed'");
    expect(migration).toContain("'requires_review'");
    expect(migration).toContain("'order_creating'");
    expect(migration).toContain("app.flight_consumer_compensated_failure_authorized");
    expect(migration).toContain("flight_payment_refund_evidence");
    expect(migration).toContain("create table public.flight_consumer_webhook_ledger");
    expect(migration).toContain(
      "create function public.record_flight_consumer_verified_webhook_v1(",
    );
    expect(migration).toContain("create function public.claim_flight_consumer_webhook_v1(");
    expect(migration).toContain(
      "create function public.complete_flight_consumer_webhook_v1(",
    );
    expect(migration).toContain(
      "processing must call the same business RPCs and cannot bypass lifecycle invariants",
    );
  });

  it("forces RLS and grants no direct access to encrypted or operation evidence", () => {
    for (const table of [
      "flight_payment_operation_attempts",
      "flight_order_response_evidence_vault",
      "flight_consumer_webhook_ledger",
      "flight_payment_state_observations",
      "flight_payment_refund_evidence",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toMatch(
        new RegExp(`revoke all on table public\\.${table}\\s+from public, anon, authenticated, service_role;`),
      );
      expect(migration).not.toMatch(
        new RegExp(`grant [^;]+ on table public\\.${table}`, "i"),
      );
    }
  });

  it("bumps parent order revisions for payment, ticket, refund, and webhook work", () => {
    expect(
      migration.match(
        /set updated_at = greatest\(clock_timestamp\(\), updated_at \+ interval '1 microsecond'\)/g,
      )?.length,
    ).toBeGreaterThanOrEqual(10);
  });

  it("uses an evidence-preserving fail-closed rollback", () => {
    for (const table of [
      "flight_payment_operation_attempts",
      "flight_order_response_evidence_vault",
      "flight_consumer_webhook_ledger",
      "flight_payment_state_observations",
      "flight_payment_refund_evidence",
    ]) expect(rollback).toContain(table);
    expect(rollback).toContain("consumer_flow_version = 1");
    expect(rollback).toContain("requires a separately reviewed fail-closed replacement");
    expect(rollback).not.toMatch(/\b(?:drop|truncate|delete|update|insert)\b/i);
  });

  it("mirrors the exact reviewed migration bytes once in the bootstrap schema", () => {
    const marker =
      "-- Mirrored from migrations/202608250075_flight_consumer_preview_orchestration.sql.";
    expect(schema.split(marker)).toHaveLength(2);
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
