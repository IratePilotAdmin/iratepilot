import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forwardPath =
  "supabase/production-migrations/202608260108_flight_consumer_live_duffel_order_execution_journal.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260108_flight_consumer_live_duffel_order_execution_journal.rollback.sql";
const forward = readFileSync(forwardPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

const rpcNames = [
  "prepare_flight_consumer_live_duffel_order_execution_v1",
  "claim_flight_consumer_live_duffel_order_execution_v1",
  "complete_flight_consumer_live_duffel_order_execution_v1",
  "reconcile_flight_consumer_live_duffel_order_execution_v1",
] as const;

describe("Flight Consumer Production Duffel live order migration 108", () => {
  it("is transactional and pinned to the exact 105 and 107 boundaries", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    expect(forward).toContain(
      "public.flight_consumer_live_duffel_offer_refresh_attempts",
    );
    expect(forward).toContain(
      "public.flight_consumer_live_checkout_evidence_aggregates",
    );
    expect(forward).toContain(
      "complete_flight_consumer_live_duffel_offer_refresh_attempt_v1(uuid,integer,text,text,text,text,integer,text,integer,text,text,bigint,timestamp with time zone,timestamp with time zone,text,text,text)",
    );
    expect(forward).toContain(
      "finalize_flight_consumer_live_checkout_evidence_v1(uuid,integer,text,text,text)",
    );
    expect(forward).toContain("checkout.checkout_state = 'finalized'");
    expect(forward).toContain("refresh.attempt_state = 'succeeded'");
    expect(forward).toContain("refresh.attempt_revision = 2");
  });

  it("forces RLS and exposes only four service-role RPCs", () => {
    expect(forward.match(/enable row level security;/g)).toHaveLength(2);
    expect(forward.match(/force row level security;/g)).toHaveLength(2);
    expect(forward.match(/grant execute on function/g)).toHaveLength(4);
    for (const rpcName of rpcNames) {
      const start = forward.indexOf(`create function public.${rpcName}(`);
      const next = forward.indexOf("\ncreate function public.", start + 1);
      const body = forward.slice(start, next === -1 ? forward.length : next);
      expect(start).toBeGreaterThan(-1);
      expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
      expect(forward).toContain(`public.${rpcName}(`);
      expect(rollback).toContain(`public.${rpcName}(`);
    }
    expect(forward).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+table/i);
    expect(forward).not.toMatch(/grant execute[\s\S]{0,700}\bto (?:public|anon|authenticated)\b/i);
  });

  it("stores provider identifiers only as bounded ciphertext plus digests", () => {
    expect(forward).toContain("provider_order_reference_ciphertext text");
    expect(forward).toContain("provider_order_reference_sha256 text unique");
    expect(forward).toContain("provider_booking_reference_ciphertext text");
    expect(forward).toContain("provider_booking_reference_sha256 text");
    expect(forward).toContain(
      "^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,}$",
    );
    for (const returnsBlock of forward.matchAll(
      /returns table \(([\s\S]*?)\)\s*language plpgsql/g,
    )) {
      expect(returnsBlock[1]).not.toContain("_ciphertext");
      expect(returnsBlock[1]).not.toContain("customer_id");
      expect(returnsBlock[1]).not.toContain("order_id");
    }
    expect(forward).not.toMatch(/\b(?:client_secret|payment_method|card|pan|cvc)\b/i);
  });

  it("enforces exactly one POST /air/orders with replay-safe CAS", () => {
    expect(forward).toContain("air_orders_post_count integer not null default 0");
    expect(forward).toContain("check (air_orders_post_count in (0, 1))");
    expect(forward).toContain(
      "check (provider_request_count = air_orders_post_count)",
    );
    expect(forward).toContain(
      "old.attempt_state = 'prepared' and new.attempt_state = 'dispatching'",
    );
    expect(forward).toContain(
      "old.attempt_state = 'dispatching'",
    );
    expect(forward).toContain(
      "new.attempt_state in ('succeeded', 'failed', 'ambiguous')",
    );
    expect(forward).toContain(
      "old.attempt_state = 'ambiguous'",
    );
    expect(forward).toContain("new.attempt_state = 'reconciled'");
    expect(forward).toContain("'replay'::text");
    expect(forward).toContain("dispatch_token_sha256");
    expect(forward).toContain("successful claim alone grants no dispatch authority");
    expect(forward).toContain(
      "separately frozen 109 authorized-requires-capture",
    );
    expect(forward).toContain(
      "rechecks dispatch_not_after plus offer expiry immediately",
    );
    expect(forward).not.toMatch(/set\s+attempt_state\s*=\s*'prepared'/i);
    expect(forward).not.toMatch(/\b(?:reset|requeue|reopen)_flight_consumer/i);
  });

  it("keeps ambiguity terminal and reconciliation non-dispatching", () => {
    const reconcileStart = forward.indexOf(
      "create function public.reconcile_flight_consumer_live_duffel_order_execution_v1",
    );
    const reconcileBody = forward.slice(reconcileStart);
    expect(reconcileBody).toContain("v_attempt.attempt_state <> 'ambiguous'");
    expect(reconcileBody).toContain("v_attempt.air_orders_post_count <> 1");
    expect(reconcileBody).toContain("set attempt_state = 'reconciled'");
    expect(reconcileBody).not.toContain("set attempt_state = 'dispatching'");
    expect(forward).toContain(
      "blind_retry_authorized boolean not null default false",
    );
    expect(forward).toContain("check (not blind_retry_authorized)");
  });

  it("hard-locks every payment, ticket, servicing, and release authority", () => {
    for (const authority of [
      "provider_dispatch_authorized",
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
    for (const count of [
      "payment_request_count",
      "capture_request_count",
      "refund_request_count",
      "settlement_request_count",
      "ticket_request_count",
      "servicing_request_count",
    ]) {
      expect(forward).toContain(`check (${count} = 0)`);
    }
  });

  it("provides a data-preserving, dependency-ordered rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live Duffel order execution evidence exists",
    );
    expect(rollback.indexOf("lock table")).toBeLessThan(
      rollback.indexOf("Refusing rollback"),
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
