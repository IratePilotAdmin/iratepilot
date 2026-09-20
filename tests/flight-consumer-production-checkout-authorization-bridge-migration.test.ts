import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forwardPath =
  "supabase/production-migrations/202608260110_flight_consumer_checkout_authorization_bridge.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260110_flight_consumer_checkout_authorization_bridge.rollback.sql";
const frozen109Path =
  "supabase/production-migrations/202608260109_flight_consumer_live_stripe_confirmation_journal.sql";
const forward = readFileSync(forwardPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

describe("Flight Consumer Production checkout authorization bridge 110", () => {
  it("is transactional and leaves the frozen 109 bytes unchanged", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    expect(createHash("sha256").update(readFileSync(frozen109Path)).digest("hex"))
      .toBe("60acdb04b44e980b778de1f997791d6ab773d656efc54a64231d6c8f635e9d68");
    for (const prerequisite of [
      "flight_consumer_live_stripe_payment_executions",
      "flight_consumer_live_stripe_payment_execution_receipts",
      "flight_consumer_live_checkout_evidence_aggregates",
      "flight_consumer_live_checkout_evidence_receipts",
      "flight_consumer_live_stripe_confirmation_attempts",
      "flight_consumer_live_stripe_confirmation_receipts",
      "flight_consumer_live_duffel_order_executions",
      "record_flight_consumer_live_stripe_confirmation_terminal_v1",
      "extensions.digest(bytea,text)",
    ]) {
      expect(forward).toContain(prerequisite);
    }
  });

  it("repairs expired durable 109 replay without weakening new-attempt deadlines", () => {
    const wrapperStart = forward.indexOf(
      "create function public.prepare_flight_consumer_live_stripe_confirmation_v1(",
    );
    const wrapperEnd = forward.indexOf(
      "$prepare_flight_consumer_live_stripe_confirmation_v1$;",
      wrapperStart,
    );
    const wrapper = forward.slice(wrapperStart, wrapperEnd);
    const replayLookup = wrapper.indexOf("select count(*), coalesce(bool_and(row(");
    const delegate = wrapper.indexOf(
      "prepare_flight_consumer_live_stripe_confirmation_frozen109(",
    );
    expect(forward).toContain(
      "rename to prepare_flight_consumer_live_stripe_confirmation_frozen109",
    );
    expect(replayLookup).toBeGreaterThan(-1);
    expect(delegate).toBeGreaterThan(replayLookup);
    expect(wrapper).toContain("'replay'::text");
    expect(wrapper).toContain("v_match_count <> 1 or not v_exact_match");
    expect(wrapper).toContain(
      "Only a genuinely new identity reaches frozen 109",
    );
    expect(wrapper).toContain("clock_timestamp() + interval '60 seconds'");
    expect(wrapper.indexOf("clock_timestamp() + interval '60 seconds'"))
      .toBeGreaterThan(replayLookup);
    expect(wrapper.indexOf("clock_timestamp() + interval '60 seconds'"))
      .toBeLessThan(delegate);
    const postDelegateFreshness = wrapper.indexOf(
      "new-attempt window expired during preparation",
    );
    expect(postDelegateFreshness).toBeGreaterThan(delegate);
    expect(wrapper.slice(delegate, postDelegateFreshness)).toContain(
      "clock_timestamp() + interval '60 seconds'",
    );
    expect(wrapper.slice(delegate, postDelegateFreshness)).toContain(
      "decision = 'created'",
    );
    expect(rollback).toContain(
      "rename to prepare_flight_consumer_live_stripe_confirmation_v1",
    );
  });

  it("finalizes only from exact structured live authorization evidence", () => {
    const start = forward.indexOf(
      "create or replace function public.finalize_flight_consumer_live_checkout_evidence_v1(",
    );
    const end = forward.indexOf(
      "$finalize_flight_consumer_live_checkout_evidence_v1$;",
      start,
    );
    const body = forward.slice(start, end);
    for (const binding of [
      "v_confirmation.checkout_aggregate_id <> v_aggregate.id",
      "v_confirmation.stripe_execution_attempt_id <> v_execution.id",
      "v_confirmation.customer_id <> v_aggregate.customer_id",
      "v_confirmation.order_id <> v_aggregate.order_id",
      "v_confirmation.checkout_binding_sha256",
      "v_confirmation.stripe_execution_completed_receipt_sha256",
      "v_confirmation.payment_binding_sha256",
      "v_confirmation.order_reference_sha256",
      "v_confirmation.customer_reference_sha256",
      "v_confirmation.payment_intent_reference_sha256",
      "v_confirmation.observed_payment_intent_reference_sha256",
    ]) {
      expect(body).toContain(binding);
    }
    expect(body).toContain("v_execution.attempt_state <> 'completed'");
    expect(body).toContain("v_execution.attempt_revision <> 2");
    expect(body).toContain("v_confirmation.confirmation_state = 'authorized_requires_capture'");
    expect(body).toContain("v_confirmation.confirmation_revision = 2");
    expect(body).toContain("v_confirmation.confirmation_state = 'reconciled'");
    expect(body).toContain("v_confirmation.confirmation_revision = 3");
    expect(body).toContain("v_confirmation.reconciled_outcome =");
    expect(body).toContain("'authorized_requires_capture'");
    expect(body).toContain("v_confirmation.observed_payment_intent_status <>");
    expect(body).toContain("'requires_capture'");
    expect(body).toContain("v_confirmation.observed_amount_cents <>");
    expect(body).toContain("v_confirmation.observed_currency <>");
    expect(body).toContain("v_confirmation.observed_livemode is distinct from true");
    expect(body).toContain("v_confirmation.confirmation_not_after <=");
    expect(body).toContain("v_now + interval '15 seconds'");
    const executionLock = body.indexOf(
      "from public.flight_consumer_live_stripe_payment_executions as execution",
    );
    const finalClockRefresh = body.lastIndexOf("v_now := clock_timestamp();");
    const finalDeadlineRecheck = body.indexOf(
      "finalization window expired while waiting for locks",
      finalClockRefresh,
    );
    const finalizeCas = body.indexOf(
      "update public.flight_consumer_live_checkout_evidence_aggregates as target",
    );
    expect(executionLock).toBeGreaterThan(-1);
    expect(finalClockRefresh).toBeGreaterThan(executionLock);
    expect(finalDeadlineRecheck).toBeGreaterThan(finalClockRefresh);
    expect(finalizeCas).toBeGreaterThan(finalDeadlineRecheck);
    const finalWindow = body.slice(finalClockRefresh, finalizeCas);
    expect(finalWindow).toContain(
      "v_aggregate.offer_expires_at <= v_now + interval '15 seconds'",
    );
    expect(finalWindow).toContain(
      "v_confirmation.confirmation_not_after <=",
    );
    expect(finalWindow).toContain(
      "v_confirmation.confirmation_not_after >",
    );
    expect(body).toContain(
      "target.latest_state_receipt_sha256 = v_previous_receipt",
    );
  });

  it("emits a distinct stable bridge receipt and binds it into the finalized checkout receipt", () => {
    expect(forward).toContain("authorization_bridge_receipt_sha256 text not null unique");
    expect(forward).toContain(
      "iratepilot:flight-consumer-production:checkout-authorization-bridge-receipt:v1",
    );
    expect(forward).toContain(
      "'authorization_bridge_receipt_sha256', v_bridge_receipt",
    );
    for (const receiptBinding of [
      "checkout_prepared_receipt_sha256",
      "checkout_finalized_receipt_sha256",
      "stripe_execution_completed_receipt_sha256",
      "confirmation_state_receipt_sha256",
      "provider_response_sha256",
      "confirmation_evidence_sha256",
      "observed_payment_intent_reference_sha256",
      "finalization_evidence_sha256",
    ]) {
      expect(forward).toContain(receiptBinding);
    }
  });

  it("hardens unchanged 108 inserts and prepared-to-dispatching claims", () => {
    const triggerStart = forward.indexOf(
      "create function public.enforce_flight_consumer_live_duffel_order_authorization_bridge_v1()",
    );
    const triggerEnd = forward.indexOf(
      "$enforce_flight_consumer_live_duffel_order_authorization_bridge_v1$;",
      triggerStart,
    );
    const guard = forward.slice(triggerStart, triggerEnd);
    expect(guard).toContain("tg_op = 'INSERT'");
    expect(guard).toContain("old.attempt_state = 'prepared'");
    expect(guard).toContain("new.attempt_state = 'dispatching'");
    expect(guard).toContain("checkout.checkout_state = 'finalized'");
    expect(guard).toContain("checkout.checkout_revision = 1");
    expect(guard).toContain("bridge.checkout_finalized_receipt_sha256");
    expect(guard).toContain("confirmation.latest_state_receipt_sha256");
    expect(guard).toContain("confirmation.observed_payment_intent_status =");
    expect(guard).toContain("confirmation.observed_livemode");
    expect(guard).toContain("bridge.authorization_not_after > v_now + interval '15 seconds'");
    expect(guard).toContain("new.dispatch_not_after <= bridge.authorization_not_after");
    expect(forward).toContain(
      "before insert or update\non public.flight_consumer_live_duffel_order_executions",
    );
  });

  it("keeps every provider, money, booking, ticket, and release authority false", () => {
    for (const authority of [
      "provider_dispatch_authorized",
      "stripe_dispatch_authorized",
      "confirmation_handoff_authorized",
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
    expect(forward).not.toMatch(/\b(?:http|fetch|stripe\.com|duffel\.com)\b/i);
  });

  it("has a guarded, data-preserving rollback that restores frozen behavior", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("in access exclusive mode");
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live checkout authorization bridge evidence exists",
    );
    expect(rollback).toContain(
      "iratepilot:flight-consumer-production:checkout-state-receipt:v1",
    );
    expect(rollback).toContain("execution.attempt_state = 'prepared'");
    expect(rollback).toContain("execution.attempt_revision = 0");
    expect(rollback).toContain(
      "drop trigger flight_consumer_live_duffel_order_authorization_bridge_110",
    );
    expect(rollback).toContain(
      "drop table public.flight_consumer_live_checkout_authorization_bridges",
    );
    expect(rollback).not.toMatch(/cascade|truncate|delete from/i);
  });
});
