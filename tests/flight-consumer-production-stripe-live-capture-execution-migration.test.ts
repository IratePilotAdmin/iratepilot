import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forwardPath =
  "supabase/production-migrations/202608260111_flight_consumer_live_stripe_capture_execution_journal.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260111_flight_consumer_live_stripe_capture_execution_journal.rollback.sql";
const forward = readFileSync(forwardPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

const rpcNames = [
  "prepare_flight_consumer_live_stripe_capture_v1",
  "claim_flight_consumer_live_stripe_capture_v1",
  "complete_flight_consumer_live_stripe_capture_v1",
  "reconcile_flight_consumer_live_stripe_capture_v1",
] as const;

describe("Flight Consumer Production Stripe live capture migration 111", () => {
  it("is transactional and pins the exact frozen 108 through 110 chain", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    expect(createHash("sha256").update(readFileSync(
      "supabase/production-migrations/202608260108_flight_consumer_live_duffel_order_execution_journal.sql",
    )).digest("hex")).toBe(
      "51688027dd052781981c12aa9e36c0bf66621e3937ac32e4b749faec12fa2093",
    );
    expect(createHash("sha256").update(readFileSync(
      "supabase/production-migrations/202608260109_flight_consumer_live_stripe_confirmation_journal.sql",
    )).digest("hex")).toBe(
      "60acdb04b44e980b778de1f997791d6ab773d656efc54a64231d6c8f635e9d68",
    );
    expect(createHash("sha256").update(readFileSync(
      "supabase/production-migrations/202608260110_flight_consumer_checkout_authorization_bridge.sql",
    )).digest("hex")).toBe(
      "c2c31d71640b95e5d3be59b266c5ca04ee0467188248345db4c7280935c9c309",
    );
    for (const prerequisite of [
      "flight_consumer_live_checkout_authorization_bridges",
      "flight_consumer_live_stripe_confirmation_attempts",
      "flight_consumer_live_stripe_payment_executions",
      "flight_consumer_live_duffel_order_executions",
      "flight_consumer_live_duffel_order_execution_receipts",
      "authorization_bridge_receipt_sha256",
      "checkout_finalized_receipt_sha256",
      "extensions.digest(bytea,text)",
    ]) {
      expect(forward).toContain(prerequisite);
    }
  });

  it("requires exact terminal successful or reconciled-successful 108 evidence", () => {
    const start = forward.indexOf(
      "create function public.prepare_flight_consumer_live_stripe_capture_v1(",
    );
    const end = forward.indexOf(
      "$prepare_flight_consumer_live_stripe_capture_v1$;",
      start,
    );
    const body = forward.slice(start, end);
    for (const binding of [
      "execution.checkout_evidence_aggregate_id = p_checkout_aggregate_id",
      "execution.checkout_binding_sha256",
      "execution.checkout_state_receipt_sha256",
      "execution.order_execution_binding_sha256",
      "execution.latest_state_receipt_sha256",
      "execution.provider_order_reference_sha256",
      "execution.provider_order_reference_ciphertext is not null",
      "execution.order_reference_sha256",
      "execution.customer_reference_sha256",
      "execution.amount_cents = p_amount_cents",
      "execution.currency = p_currency",
      "execution.provider_request_count = 1",
      "execution.air_orders_post_count = 1",
    ]) {
      expect(body).toContain(binding);
    }
    expect(body).toContain("execution.attempt_state = 'succeeded'");
    expect(body).toContain("execution.attempt_revision = 2");
    expect(body).toContain("execution.attempt_state = 'reconciled'");
    expect(body).toContain("execution.attempt_revision = 3");
    expect(body).toContain("execution.reconciliation_outcome = 'succeeded'");
    expect(body).toContain(
      "receipt.receipt_sha256 = p_duffel_order_state_receipt_sha256",
    );
  });

  it("requires exact structured 109 authorization plus the 110 bridge", () => {
    for (const binding of [
      "bridge.authorization_bridge_receipt_sha256",
      "bridge.stripe_confirmation_attempt_id",
      "bridge.payment_intent_reference_sha256",
      "bridge.authorization_not_after",
      "confirmation.latest_state_receipt_sha256",
      "confirmation.observed_payment_intent_status = 'requires_capture'",
      "confirmation.observed_amount_cents = p_amount_cents",
      "confirmation.observed_currency = lower(p_currency)",
      "confirmation.observed_livemode",
      "confirmation.capture_method = 'manual'",
      "confirmation.confirmation_state = 'authorized_requires_capture'",
      "confirmation.reconciled_outcome =",
      "'authorized_requires_capture'",
    ]) {
      expect(forward).toContain(binding);
    }
  });

  it("persists a separately signed one-shot authority without authority booleans", () => {
    for (const field of [
      "capture_authority_scope_sha256",
      "capture_authority_payload_sha256",
      "capture_authority_signature_sha256",
      "capture_authority_key_id",
      "capture_authority_not_after",
      "dispatch_not_after",
    ]) {
      expect(forward).toContain(field);
    }
    expect(forward).toContain(
      "capture_authority_not_after >= dispatch_not_after",
    );
    expect(forward).toContain(
      "p_capture_authority_not_after > v_now + interval '15 minutes'",
    );
    expect(forward).toContain(
      "successful claim grant no authority",
    );
  });

  it("uses durable-first replay and trusted-time rechecks around blocking work", () => {
    const prepareStart = forward.indexOf(
      "create function public.prepare_flight_consumer_live_stripe_capture_v1(",
    );
    const prepareEnd = forward.indexOf(
      "$prepare_flight_consumer_live_stripe_capture_v1$;",
      prepareStart,
    );
    const prepare = forward.slice(prepareStart, prepareEnd);
    const durableLookup = prepare.indexOf(
      "Resolve an exact durable identity before consulting freshness",
    );
    const bridgeLookup = prepare.indexOf("select bridge.* into v_bridge");
    const postPrerequisiteTime = prepare.indexOf(
      "Refresh trusted time after all prerequisite reads",
    );
    const insert = prepare.indexOf(
      "insert into public.flight_consumer_live_stripe_capture_attempts",
    );
    const postInsertTime = prepare.indexOf(
      "A uniqueness wait can outlive the authority",
    );
    expect(durableLookup).toBeGreaterThan(-1);
    expect(bridgeLookup).toBeGreaterThan(durableLookup);
    expect(postPrerequisiteTime).toBeGreaterThan(bridgeLookup);
    expect(insert).toBeGreaterThan(postPrerequisiteTime);
    expect(postInsertTime).toBeGreaterThan(insert);

    const claimStart = forward.indexOf(
      "create function public.claim_flight_consumer_live_stripe_capture_v1(",
    );
    const claimEnd = forward.indexOf(
      "$claim_flight_consumer_live_stripe_capture_v1$;",
      claimStart,
    );
    const claim = forward.slice(claimStart, claimEnd);
    expect(claim.indexOf("for update;")).toBeLessThan(
      claim.indexOf("FOR UPDATE can block"),
    );
    expect(claim.indexOf("FOR UPDATE can block")).toBeLessThan(
      claim.indexOf("v_attempt.dispatch_not_after >"),
    );
    const prerequisiteScan = claim.indexOf("or not exists (");
    const finalDeadlineLookup = claim.indexOf(
      "select bridge.authorization_not_after, confirmation.confirmation_not_after",
    );
    const finalTrustedTime = claim.indexOf(
      "v_now := clock_timestamp();",
      finalDeadlineLookup,
    );
    const claimCas = claim.indexOf(
      "update public.flight_consumer_live_stripe_capture_attempts as attempt",
    );
    expect(finalDeadlineLookup).toBeGreaterThan(prerequisiteScan);
    expect(finalTrustedTime).toBeGreaterThan(finalDeadlineLookup);
    expect(claimCas).toBeGreaterThan(finalTrustedTime);
    expect(claim.slice(finalTrustedTime, claimCas)).toContain(
      "v_confirmation_not_after <= v_now + interval '15 seconds'",
    );

    const completeStart = forward.indexOf(
      "create function public.complete_flight_consumer_live_stripe_capture_v1(",
    );
    const completeEnd = forward.indexOf(
      "$complete_flight_consumer_live_stripe_capture_v1$;",
      completeStart,
    );
    const complete = forward.slice(completeStart, completeEnd);
    expect(complete.indexOf("for update;")).toBeLessThan(
      complete.indexOf("completion chronology refused"),
    );
    const completeTrustedTime = complete.indexOf(
      "v_now := clock_timestamp();",
    );
    expect(completeTrustedTime).toBeGreaterThan(complete.indexOf("for update;"));
    expect(complete.indexOf("v_previous_receipt :=")).toBeGreaterThan(
      completeTrustedTime,
    );

    const reconcileStart = forward.indexOf(
      "create function public.reconcile_flight_consumer_live_stripe_capture_v1(",
    );
    const reconcileEnd = forward.indexOf(
      "$reconcile_flight_consumer_live_stripe_capture_v1$;",
      reconcileStart,
    );
    const reconcile = forward.slice(reconcileStart, reconcileEnd);
    expect(reconcile.indexOf("for update;")).toBeLessThan(
      reconcile.indexOf("reconciliation chronology refused"),
    );
    const reconcileTrustedTime = reconcile.indexOf(
      "v_now := clock_timestamp();",
    );
    expect(reconcileTrustedTime).toBeGreaterThan(
      reconcile.indexOf("for update;"),
    );
    expect(reconcile.indexOf("v_previous_receipt :=")).toBeGreaterThan(
      reconcileTrustedTime,
    );
    expect(forward).toContain("completed_at >= dispatch_started_at");
    expect(forward).toContain("reconciled_at >= completed_at");
  });

  it("enforces one capture mutation and retrieval-only ambiguity recovery", () => {
    expect(forward).toContain(
      "stripe_capture_request_count integer not null default 0",
    );
    expect(forward).toContain("check (stripe_capture_request_count in (0, 1))");
    expect(forward).toContain("check (stripe_mutation_count in (0, 1))");
    expect(forward).toContain(
      "check (stripe_capture_request_count = stripe_mutation_count)",
    );
    expect(forward).toContain(
      "stripe_retrieval_request_count integer not null default 0",
    );
    const reconcileStart = forward.indexOf(
      "create function public.reconcile_flight_consumer_live_stripe_capture_v1(",
    );
    const reconcile = forward.slice(reconcileStart);
    expect(reconcile).toContain("v_attempt.attempt_state <> 'ambiguous'");
    expect(reconcile).toContain("v_attempt.stripe_capture_request_count <> 1");
    expect(reconcile).toContain("v_attempt.stripe_mutation_count <> 1");
    expect(reconcile).toContain("p_stripe_retrieval_request_count");
    expect(reconcile).not.toContain("set attempt_state = 'dispatching'");
    expect(forward).not.toMatch(/\b(?:reset|requeue|reopen)_flight_consumer/i);
  });

  it("stores only encrypted/digested provider references and structured success", () => {
    expect(forward).toContain("payment_intent_reference_ciphertext text not null");
    expect(forward).toContain("payment_intent_reference_sha256 text not null unique");
    expect(forward).toContain("provider_order_reference_sha256 text not null unique");
    expect(forward).toContain("charge_reference_ciphertext text");
    expect(forward).toContain("charge_reference_sha256 text unique");
    expect(forward).toContain("observed_payment_intent_status = 'succeeded'");
    expect(forward).toContain(
      "observed_payment_intent_reference_sha256 =",
    );
    expect(forward).toContain(
      "p_observed_payment_intent_reference_sha256 <>\n      v_attempt.payment_intent_reference_sha256",
    );
    expect(forward).toContain("observed_amount_received_cents = amount_cents");
    expect(forward).toContain("observed_currency = lower(currency)");
    expect(forward).toContain("observed_livemode is true");
    expect(forward).toContain("observed_capture_method = capture_method");
    expect(forward).toContain("p_terminal_http_status = 200");
    expect(forward).toContain("p_charge_reference_ciphertext is null");
    for (const returnsBlock of forward.matchAll(
      /returns table \(([\s\S]*?)\)\s*language plpgsql/g,
    )) {
      expect(returnsBlock[1]).not.toContain("_ciphertext");
      expect(returnsBlock[1]).not.toContain("customer_id");
      expect(returnsBlock[1]).not.toContain("order_id");
    }
  });

  it("forces RLS and grants only four service-role RPCs", () => {
    expect(forward.match(/enable row level security;/g)).toHaveLength(2);
    expect(forward.match(/force row level security;/g)).toHaveLength(2);
    expect(forward.match(/grant execute on function/g)).toHaveLength(4);
    for (const rpcName of rpcNames) {
      const start = forward.indexOf(`create function public.${rpcName}(`);
      const next = forward.indexOf("\ncreate function public.", start + 1);
      const body = forward.slice(start, next === -1 ? forward.length : next);
      expect(start).toBeGreaterThan(-1);
      expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
      expect(rollback).toContain(`public.${rpcName}(`);
    }
    expect(forward).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)\s+on\s+table/i,
    );
    expect(forward).not.toMatch(
      /grant execute[\s\S]{0,700}\bto (?:public|anon|authenticated)\b/i,
    );
  });

  it("hard-locks every provider, money, order, ticket, and release authority", () => {
    for (const authority of [
      "provider_dispatch_authorized",
      "stripe_dispatch_authorized",
      "booking_authorized",
      "order_authorized",
      "payment_authorized",
      "capture_authorized",
      "refund_authorized",
      "settlement_authorized",
      "ticketing_authorized",
      "servicing_authorized",
      "consumer_release_enabled",
      "blind_retry_authorized",
    ]) {
      expect(forward).toContain(`check (not ${authority})`);
    }
    for (const sensitive of [
      "client_secret_stored",
      "payment_method_stored",
      "card_data_stored",
      "raw_provider_payload_stored",
      "pii_stored",
    ]) {
      expect(forward).toContain(`check (not ${sensitive})`);
    }
    for (const forbiddenCounter of [
      "payment_intent_create_count",
      "order_request_count",
      "refund_request_count",
      "settlement_request_count",
      "ticket_request_count",
      "servicing_request_count",
    ]) {
      expect(forward).toContain(`check (${forbiddenCounter} = 0)`);
    }
    expect(forward).not.toMatch(/\b(?:http|fetch|stripe\.com|duffel\.com)\b/i);
  });

  it("has a guarded dependency-ordered rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("in access exclusive mode");
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live Stripe capture evidence exists",
    );
    expect(rollback.indexOf("drop trigger")).toBeLessThan(
      rollback.indexOf("drop function"),
    );
    expect(rollback.indexOf("drop function")).toBeLessThan(
      rollback.indexOf("drop table"),
    );
    expect(rollback).not.toMatch(/cascade|truncate|delete from/i);
  });
});
