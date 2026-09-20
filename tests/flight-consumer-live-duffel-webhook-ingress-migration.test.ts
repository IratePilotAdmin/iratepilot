import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/production-migrations/202608260099_flight_consumer_live_duffel_webhook_ingress.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/production-rollbacks/202608260099_flight_consumer_live_duffel_webhook_ingress.rollback.sql",
  "utf8",
);

function functionBody() {
  const tag = "$record_flight_consumer_live_duffel_webhook_v1$";
  const marker = `as ${tag}`;
  const start = migration.indexOf(marker);
  const end = migration.indexOf(`${tag};`, start + marker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start + marker.length, end);
}

describe("Flight Consumer Live Duffel digest-only ingress migration", () => {
  it("creates a forced-RLS append-preserving inbox with dual replay identities", () => {
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain(
      "create table public.flight_consumer_live_duffel_webhook_inbox",
    );
    for (const column of [
      "execution_scope_sha256",
      "event_id_sha256",
      "idempotency_sha256",
      "payload_sha256",
      "semantic_sha256",
      "verification_receipt_sha256",
    ]) expect(migration).toContain(column);
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain(
      "flight_consumer_live_duffel_webhook_event_uidx",
    );
    expect(migration).toContain(
      "flight_consumer_live_duffel_webhook_idempotency_uidx",
    );
    expect(migration).not.toMatch(
      /raw_(?:body|payload)|access_token|webhook_secret|signature_header|provider_order_ref|provider_offer_ref/i,
    );
  });

  it("permits only exact service-role replay or one digest-only insert", () => {
    const body = functionBody();
    expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(body).toContain("p_live_mode is distinct from true");
    expect(body).toContain("p_event_type = 'ping.triggered'");
    expect(body).toContain("then 'verified_ping' else 'quarantined'");
    expect(body).toContain("return query select 'replay'::text");
    expect(body).toContain("return query select 'created'::text");
    expect(body).toContain("when unique_violation");
    expect(body).toMatch(/identity collision|concurrency collision/);
    expect(body).toContain(
      "insert into public.flight_consumer_live_duffel_webhook_inbox",
    );
    // `FOR UPDATE` is a read lock used to serialize replay checks. Reject only
    // mutation statements so the assertion does not confuse locking with a
    // change to an existing inbox row.
    expect(body).not.toMatch(
      /\bupdate\s+(?:public\.)?[A-Za-z_]|\bdelete\s+from\b|\btruncate\b|\bmerge\s+into\b/i,
    );
    expect(body).not.toMatch(
      /flight_orders|flight_payments|flight_ticket_documents|flight_service_requests|provider_request_attempts/i,
    );
  });

  it("revokes all direct table access and grants only the narrow RPC", () => {
    expect(migration).toContain(
      ") owner to postgres;",
    );
    expect(migration).toContain(
      "revoke all on table public.flight_consumer_live_duffel_webhook_inbox\n  from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function\n  public.record_flight_consumer_live_duffel_webhook_v1(",
    );
    expect(migration).toContain(
      ")\nto service_role;",
    );
    expect(migration).not.toContain("to authenticated;");
    expect(migration).not.toContain("to anon;");
  });

  it("has a scoped rollback for this not-yet-activated ingress only", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "drop function if exists\n  public.record_flight_consumer_live_duffel_webhook_v1(",
    );
    expect(rollback).toContain(
      "drop table if exists public.flight_consumer_live_duffel_webhook_inbox;",
    );
    expect(rollback).not.toMatch(/flight_orders|flight_payments|flight_ticket_documents/i);
  });
});
