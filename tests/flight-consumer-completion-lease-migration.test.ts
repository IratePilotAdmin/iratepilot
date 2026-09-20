import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260130_flight_consumer_completion_lease.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260130_flight_consumer_completion_lease.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

function functionDefinition(source: string, name: string, dollarTag: string) {
  const end = source.indexOf(`${dollarTag};`);
  const start = source.lastIndexOf(`create function ${name}(`, end);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + dollarTag.length + 1);
}

function taggedBlock(source: string, dollarTag: string) {
  const start = source.indexOf(`do ${dollarTag}`);
  const end = source.indexOf(`${dollarTag};`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + dollarTag.length + 1);
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

describe("Consumer Flight Preview completion lease migration", () => {
  it("requires migration 090 and preserves the fully relocked posture", () => {
    const dependencies = taggedBlock(migration, "$flight_consumer_preview_091_dependencies$");
    const precondition = taggedBlock(
      migration,
      "$flight_consumer_preview_091_relocked_precondition$",
    );
    const postcondition = taggedBlock(migration, "$flight_consumer_preview_091_postcondition$");

    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(dependencies).toContain("requires migrations 068 through 090");
    expect(dependencies).toContain("flight_consumer_duffel_webhook_pending_links");
    expect(precondition).toContain("migration 091 requires relock before hardening");
    expect(postcondition).toContain("migration 091 changed the locked runtime posture");
    for (const capability of disabledCapabilities) {
      expect(precondition).toContain(`and not control.${capability}`);
      expect(postcondition).toContain(`and not control.${capability}`);
    }
  });

  it("stores only order/customer identity and collision-sensitive digests", () => {
    expect(migration).toContain("create table public.flight_consumer_completion_leases (");
    expect(migration).toContain("order_id uuid primary key");
    expect(migration).toContain("idempotency_key_sha256 text not null");
    expect(migration).toContain("request_sha256 text not null");
    expect(migration).toContain("lease_token_sha256 text check");
    expect(migration).toContain(
      "unique (execution_scope_sha256, customer_id, idempotency_key_sha256)",
    );
    expect(migration).toContain("Flight completion idempotency key or request collides");
    expect(migration).not.toMatch(/payment_intent_id\s+(?:text|varchar)/i);
    expect(migration).not.toMatch(/idempotency_key\s+(?:text|varchar)/i);
  });

  it("protects exact revisions, owner heartbeats, releases, and immutable completion", () => {
    const guard = functionDefinition(
      migration,
      "public.protect_flight_consumer_completion_lease_v1",
      "$protect_flight_consumer_completion_lease$",
    );
    const heartbeat = functionDefinition(
      migration,
      "public.heartbeat_flight_consumer_completion_lease_v1",
      "$heartbeat_flight_consumer_completion_lease$",
    );
    expect(guard).toContain("Completed Flight completion lease evidence is immutable");
    expect(guard).toContain("new.lease_revision <> old.lease_revision + 1");
    expect(guard).toContain("new.heartbeat_at <= old.heartbeat_at");
    expect(guard).toContain("old.lease_state not in ('processing', 'released')");
    expect(heartbeat).toContain(
      "greatest(v_now, v_lease.heartbeat_at + interval '1 microsecond')",
    );
    expect(heartbeat).toContain("lease_expires_at =\n           v_heartbeat_at + make_interval");
    expect(migration).toContain("before insert or update or delete");
  });

  it("locks order, lease, provider, and capture before any reclaim decision", () => {
    const acquire = functionDefinition(
      migration,
      "public.acquire_flight_consumer_completion_lease_v1",
      "$acquire_flight_consumer_completion_lease$",
    );
    const orderLock = acquire.indexOf("from public.flight_orders as flight_order");
    const leaseLock = acquire.indexOf("from public.flight_consumer_completion_leases");
    const providerLock = acquire.indexOf("from public.flight_provider_request_attempts");
    const captureLock = acquire.indexOf("from public.flight_payment_operation_attempts");
    const reclaim = acquire.indexOf("v_reclaim_at :=");
    expect(orderLock).toBeGreaterThan(0);
    expect(leaseLock).toBeGreaterThan(orderLock);
    expect(providerLock).toBeGreaterThan(leaseLock);
    expect(captureLock).toBeGreaterThan(providerLock);
    expect(reclaim).toBeGreaterThan(captureLock);
    expect(acquire).toContain("for update;");
    expect(acquire).toContain("provider_redispatch_authorized boolean");
    expect(acquire.match(/v_capture\.revision, false/g)?.length).toBeGreaterThanOrEqual(4);
    expect(acquire).toContain("v_reclaim_at + make_interval");
  });

  it("blocks an active dispatch but reclaims after its exact deadline", () => {
    const acquire = functionDefinition(
      migration,
      "public.acquire_flight_consumer_completion_lease_v1",
      "$acquire_flight_consumer_completion_lease$",
    );
    const release = functionDefinition(
      migration,
      "public.release_flight_consumer_completion_lease_v1",
      "$release_flight_consumer_completion_lease$",
    );
    for (const definition of [acquire, release]) {
      expect(definition).toContain(
        "v_provider.state = 'dispatching' and v_provider.dispatch_not_after > v_now",
      );
      expect(definition).toContain(
        "v_capture.state = 'dispatching' and v_capture.dispatch_not_after > v_now",
      );
      expect(definition).not.toContain(
        "if v_provider.state = 'dispatching' or v_capture.state = 'dispatching' then",
      );
    }
    expect(acquire.indexOf("'processing'::text", acquire.indexOf("dispatch_not_after > v_now")))
      .toBeLessThan(acquire.indexOf("v_reclaim_at :="));
    expect(release).toContain("'held'::text");
    expect(release.indexOf("'held'::text"))
      .toBeLessThan(release.indexOf("set lease_state = 'released'"));
  });

  it("replays durable ticketing and completes only with exact ticket/capture/provider evidence", () => {
    const acquire = functionDefinition(
      migration,
      "public.acquire_flight_consumer_completion_lease_v1",
      "$acquire_flight_consumer_completion_lease$",
    );
    const complete = functionDefinition(
      migration,
      "public.complete_flight_consumer_completion_lease_v1",
      "$complete_flight_consumer_completion_lease$",
    );
    expect(acquire).toContain("if v_lease.lease_state = 'completed' then");
    expect(acquire).toContain("if v_exact_ticketed then");
    expect(acquire).toContain("'replayed'::text");
    expect(complete).toContain("v_issued <> p_issued_ticket_count");
    expect(complete).toContain("v_provider.state <> 'succeeded'");
    expect(complete).toContain("v_capture.state <> 'succeeded'");
    expect(complete).toContain("completed_owner_token_sha256");
    expect(complete).toContain("result_order_status = 'ticketed'");
  });

  it("is forced-RLS, has no direct grants, and exposes RPCs only to service_role", () => {
    expect(migration).toContain(
      "alter table public.flight_consumer_completion_leases force row level security;",
    );
    expect(migration).toContain(
      "revoke all on table public.flight_consumer_completion_leases\n  from public, anon, authenticated, service_role;",
    );
    for (const functionName of [
      "acquire_flight_consumer_completion_lease_v1",
      "heartbeat_flight_consumer_completion_lease_v1",
      "complete_flight_consumer_completion_lease_v1",
      "release_flight_consumer_completion_lease_v1",
    ]) {
      expect(migration).toContain(`revoke all on function public.${functionName}(`);
      expect(migration).toContain(`grant execute on function public.${functionName}(`);
    }
    expect(migration.match(/\) to service_role;/g)).toHaveLength(4);
    expect(migration).not.toMatch(/\)\s+to\s+(?:anon|authenticated)\s*;/i);
  });

  it("is mirrored byte-for-byte as its canonical schema block", () => {
    const marker = "-- Mirrored from migrations/202608260130_flight_consumer_completion_lease.sql.";
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });

  it("uses a forward-only rollback", () => {
    expect(rollback).toContain("Migration 091 is forward-only");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).not.toContain("drop table");
    expect(rollback).not.toMatch(/^\s*(?:alter|drop|grant|revoke|update|insert|delete)\b/im);
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
