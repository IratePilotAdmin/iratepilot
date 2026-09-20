import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/production-migrations/202608260101_flight_consumer_live_duffel_shopping_journal.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/production-rollbacks/202608260101_flight_consumer_live_duffel_shopping_journal.rollback.sql",
  "utf8",
);

describe("Flight Consumer Live Duffel shopping journal migration", () => {
  it("creates a digest-only forced-RLS journal without transaction columns", () => {
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("create table public.flight_consumer_live_duffel_shopping_attempts");
    expect(migration).toContain("force row level security");
    for (const digest of [
      "execution_scope_sha256",
      "idempotency_sha256",
      "request_sha256",
      "request_body_sha256",
      "terminal_response_sha256",
    ]) expect(migration).toContain(digest);
    expect(migration).not.toMatch(
      /access_token|authorization_header|raw_(?:request|response|payload)|provider_offer_ref|provider_order_ref|payment_intent|card/i,
    );
  });

  it("uses service-role prepare, claim, and terminal CAS functions", () => {
    for (const name of [
      "prepare_flight_consumer_live_duffel_shopping_attempt_v1",
      "claim_flight_consumer_live_duffel_shopping_attempt_v1",
      "complete_flight_consumer_live_duffel_shopping_attempt_v1",
    ]) {
      expect(migration).toContain(`create function public.${name}`);
      expect(migration).toContain(`public.${name}(`);
    }
    expect(migration.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/g)).toHaveLength(3);
    expect(migration).toContain("attempt_state = 'prepared'");
    expect(migration).toContain("attempt_state = 'dispatching'");
    expect(migration).toContain("attempt_revision = p_expected_revision");
    expect(migration).toContain("p_terminal_state not in ('succeeded', 'failed', 'ambiguous')");
  });

  it("revokes direct access and grants only narrow RPC execution", () => {
    expect(migration).toContain(
      "revoke all on table public.flight_consumer_live_duffel_shopping_attempts\n  from public, anon, authenticated, service_role;",
    );
    expect(migration).not.toContain(") to authenticated;");
    expect(migration).not.toContain(") to anon;");
    expect(migration.match(/\) to service_role;/g)).toHaveLength(3);
  });

  it("has a scoped rollback that cannot touch orders or payments", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("drop table if exists public.flight_consumer_live_duffel_shopping_attempts;");
    expect(rollback).not.toMatch(/flight_orders|flight_payments|flight_ticket/i);
  });
});
