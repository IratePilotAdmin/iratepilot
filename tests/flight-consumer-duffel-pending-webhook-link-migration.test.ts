import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260129_flight_consumer_duffel_pending_webhook_link.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260129_flight_consumer_duffel_pending_webhook_link.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

function functionDefinition(name: string, dollarTag: string) {
  const start = migration.indexOf(`create function public.${name}(`);
  const end = migration.indexOf(`${dollarTag};`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + dollarTag.length + 1);
}

const disabledCapabilities = [
  "synthetic_execution_enabled",
  "provider_sandbox_traffic_enabled",
  "provider_live_traffic_enabled",
  "shopping_enabled",
  "order_enabled",
  "payment_enabled",
  "ticketing_enabled",
  "servicing_enabled",
  "provider_events_enabled",
  "production_release_enabled",
] as const;

describe("Consumer Flight Preview pending Duffel webhook linkage migration", () => {
  it("depends on the hardened predecessor and stays fully relocked", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("requires migrations 068 through 089");
    expect(migration).toContain("get_flight_consumer_duffel_order_recovery_v1");
    expect(migration).toContain("migration 090 requires relock before hardening");
    for (const capability of disabledCapabilities) {
      expect(migration).toContain(`and not control.${capability}`);
    }
  });

  it("stores only append-only digest associations and terminal resolutions", () => {
    expect(migration).toContain(
      "create table public.flight_consumer_duffel_webhook_pending_links",
    );
    expect(migration).toContain(
      "create table public.flight_consumer_duffel_webhook_pending_link_resolutions",
    );
    expect(migration).toContain("provider_offer_ref_sha256 text not null");
    expect(migration).toContain("provider_order_ref_sha256 text not null");
    expect(migration).toContain("association_receipt_sha256 text not null unique");
    expect(migration).toContain("resolution_receipt_sha256 text not null unique");
    expect(migration).toContain("before update or delete");
    expect(migration).toContain("pending webhook link evidence is append-only");
    expect(migration.match(/force row level security;/g)).toHaveLength(2);
    expect(migration).toMatch(
      /revoke all on table public\.flight_consumer_duffel_webhook_pending_links[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on table public\.flight_consumer_duffel_webhook_pending_link_resolutions[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).not.toMatch(/\b(raw_body|ciphertext|credential|secret)\b/i);
  });

  it("enqueues only the unique signed TEST candidate without rewriting the ledger", () => {
    const enqueue = functionDefinition(
      "enqueue_flight_consumer_duffel_pending_webhook_link_v1",
      "$enqueue_flight_consumer_duffel_pending_webhook_link$",
    );
    expect(enqueue).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(enqueue).toContain("v_ledger.provider_live_mode is distinct from false");
    expect(enqueue).toContain("v_ledger.order_id is not null");
    expect(enqueue).toContain("v_ledger.payment_id is not null");
    expect(enqueue).toContain("v_ledger.provider_attempt_id is not null");
    expect(enqueue).toContain("attempt.state = 'dispatching' and attempt.revision = 1");
    expect(enqueue).toContain("attempt.state in ('succeeded', 'failed', 'ambiguous')");
    expect(enqueue).toContain("payment.status = 'captured'");
    expect(enqueue).toContain("v_candidate_count <> 1");
    expect(enqueue).toContain("on conflict (ledger_id) do nothing");
    expect(enqueue).not.toMatch(/update\s+public\.flight_consumer_webhook_ledger/i);
    expect(enqueue).not.toMatch(/\b(create_order|retrieve_order)\s*\(/i);
  });

  it("CAS-resolves only a durably matching successful order and retains conflicts for review", () => {
    const resolve = functionDefinition(
      "resolve_flight_consumer_duffel_pending_webhook_link_v1",
      "$resolve_flight_consumer_duffel_pending_webhook_link$",
    );
    expect(resolve).toContain("p_expected_pending_revision not in (0, 1)");
    expect(resolve).toContain("v_attempt.state = 'dispatching' and v_attempt.revision = 1");
    expect(resolve).toContain("v_order.provider_order_ref_sha256 is null");
    expect(resolve).toContain(
      "v_order.provider_order_ref_sha256\n      = v_pending.provider_order_ref_sha256",
    );
    expect(resolve).toContain("v_outcome := 'linked'");
    expect(resolve).toContain("v_outcome := 'review'");
    expect(resolve).toContain(
      "v_attempt.state in ('failed', 'ambiguous') and v_attempt.revision = 2",
    );
    expect(resolve).toMatch(
      /provider_order_ref_sha256\s*= v_pending\.provider_order_ref_sha256 then[\s\S]*?v_outcome := 'linked';[\s\S]*?elsif v_attempt\.state = 'succeeded'[\s\S]*?v_outcome := 'review';/,
    );
    expect(resolve).toContain("v_attempt.terminal_receipt_sha256 is null");
    expect(resolve).toContain("on conflict (pending_link_id) do nothing");
    expect(resolve).toContain("v_ledger.provider_live_mode is distinct from false");
    expect(resolve).not.toMatch(/update\s+public\.flight_consumer_webhook_ledger/i);
    expect(resolve).not.toMatch(/update\s+public\.flight_(orders|payments)/i);
  });

  it("does not strand terminal association evidence after a delayed refund", () => {
    const enqueue = functionDefinition(
      "enqueue_flight_consumer_duffel_pending_webhook_link_v1",
      "$enqueue_flight_consumer_duffel_pending_webhook_link$",
    );
    const resolve = functionDefinition(
      "resolve_flight_consumer_duffel_pending_webhook_link_v1",
      "$resolve_flight_consumer_duffel_pending_webhook_link$",
    );
    const paymentBinding = resolve.slice(
      resolve.indexOf("select 1 from public.flight_payments as payment"),
      resolve.indexOf(") then", resolve.indexOf(
        "select 1 from public.flight_payments as payment",
      )),
    );
    expect(paymentBinding).toContain("payment.id = v_pending.payment_id");
    expect(paymentBinding).toContain("payment.authorized_cents = v_order.total_cents");
    expect(paymentBinding).not.toContain("payment.status = 'captured'");
    expect(paymentBinding).not.toContain("payment.refunded_cents = 0");
    expect(paymentBinding).not.toContain("payment.captured_cents = v_order.total_cents");
    const replayStart = enqueue.indexOf(
      "-- Exact replay consults the append-only association",
    );
    const candidateStart = enqueue.indexOf(
      "select count(*)::integer into v_candidate_count",
    );
    expect(replayStart).toBeGreaterThan(0);
    expect(candidateStart).toBeGreaterThan(replayStart);
    const replay = enqueue.slice(replayStart, candidateStart);
    expect(replay).toContain("where pending.ledger_id = v_ledger.id");
    expect(replay).toContain("return query select v_pending.id");
    expect(replay).not.toContain("payment.status");
    expect(replay).not.toContain("flight_payments");
  });

  it("bounds post-terminal association without any provider redispatch", () => {
    const bounded = functionDefinition(
      "resolve_flight_consumer_duffel_pending_links_for_attempt_v1",
      "$resolve_flight_consumer_duffel_pending_links_for_attempt$",
    );
    expect(bounded).toContain("p_max_links not between 1 and 8");
    expect(bounded).toContain("limit p_max_links");
    expect(bounded).toContain(
      "resolve_flight_consumer_duffel_pending_webhook_link_v1",
    );
    expect(bounded).toContain("v_attempt.execution_mode <> 'test'");
    expect(bounded).toContain("v_attempt.provider_code <> 'duffel'");
    expect(bounded).not.toMatch(/http|fetch|dispatch|retry_authorized\s*=\s*true/i);
  });

  it("keeps every callable contract service-role only", () => {
    for (const functionName of [
      "enqueue_flight_consumer_duffel_pending_webhook_link_v1",
      "resolve_flight_consumer_duffel_pending_webhook_link_v1",
      "resolve_flight_consumer_duffel_pending_links_for_attempt_v1",
    ]) {
      expect(migration).toContain(`public.${functionName}(`);
    }
    expect(migration.match(/\)\s+to service_role;/g)).toHaveLength(3);
    expect(migration).not.toMatch(/\)\s+to\s+(?:anon|authenticated)\s*;/i);
  });

  it("is mirrored exactly as the latest canonical schema block", () => {
    const marker =
      "-- Mirrored from migrations/202608260129_flight_consumer_duffel_pending_webhook_link.sql.";
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
    const start = schema.indexOf(marker) + marker.length;
    const nextMarker = schema.indexOf("-- Mirrored from migrations/202608260130_", start);
    expect(nextMarker).toBeGreaterThan(start);
    expect(schema.slice(start, nextMarker).trim()).toBe(migration.trim());
  });

  it("uses a forward-only rollback", () => {
    expect(rollback).toContain("Migration 090 is forward-only");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).not.toMatch(/^\s*(?:alter|drop|grant|revoke|update|insert|delete)\b/im);
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
