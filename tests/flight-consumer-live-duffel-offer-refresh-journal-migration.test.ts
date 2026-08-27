import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forwardPath =
  "supabase/production-migrations/202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260105_flight_consumer_live_duffel_offer_refresh_journal.rollback.sql";
const forward = readFileSync(forwardPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

const functions = [
  "record_flight_consumer_live_duffel_offer_sources_v1",
  "resolve_flight_consumer_live_duffel_offer_refresh_source_v1",
  "get_flight_consumer_live_duffel_offer_refresh_attempt_v1",
  "prepare_flight_consumer_live_duffel_offer_refresh_attempt_v1",
  "claim_flight_consumer_live_duffel_offer_refresh_attempt_v1",
  "complete_flight_consumer_live_duffel_offer_refresh_attempt_v1",
] as const;

describe("Production-local Duffel offer-refresh journal migration 105", () => {
  it("is transactional, prerequisite-bound, forced-RLS, and service-role only", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    expect(forward).toContain(
      "to_regclass('public.flight_consumer_live_duffel_shopping_attempts')",
    );
    expect(forward.match(/create table public\./g)).toHaveLength(2);
    expect(forward.match(/enable row level security;/g)).toHaveLength(2);
    expect(forward.match(/force row level security;/g)).toHaveLength(2);
    expect(forward.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/g))
      .toHaveLength(6);
    expect(forward.match(/grant execute on function[\s\S]*?to service_role;/g))
      .toHaveLength(6);
    expect(forward).not.toMatch(/grant (?:select|insert|update|delete|all) on table/i);
  });

  it("persists only domain-separated offer digests and never raw Duffel IDs", () => {
    expect(forward).toContain("offer_id_sha256 text not null");
    expect(forward).toContain("source_offer_evidence_sha256 text not null");
    expect(forward).toContain(
      "iratepilot:flight-consumer-production:duffel-live:offer-source-evidence:v1",
    );
    expect(forward).not.toMatch(/provider_offer_ref|raw_offer|offer_id\s+text|off_/i);
    expect(rollback).not.toMatch(/provider_offer_ref|raw_offer|offer_id\s+text|off_/i);
    expect(forward).not.toMatch(/access[_-]?token|authorization\s+text|card|client_secret/i);
  });

  it("requires a targeted digest lookup against complete, succeeded source evidence", () => {
    expect(forward).toContain("source.offer_id_sha256 = p_offer_id_sha256");
    expect(forward).toContain("attempt.attempt_state = 'succeeded'");
    expect(forward).toContain("attempt.attempt_revision = 2");
    expect(forward).toContain(
      "attempt.terminal_response_sha256 = source.source_response_sha256",
    );
    expect(forward).toContain(") = attempt.offer_count");
    expect(forward).toContain(
      "source.expires_at > clock_timestamp() + interval '60 seconds'",
    );
    expect(forward).not.toMatch(/order by\s+random|limit\s+1\s*;\s*$[\s\S]*offer_id_sha256 is null/im);
  });

  it("implements an exact one-way prepare/claim/complete CAS with no reset or retry", () => {
    for (const name of functions) {
      expect(forward).toContain(`create function public.${name}(`);
      expect(forward).toContain(`alter function public.${name}(`);
      expect(forward).toContain(`grant execute on function public.${name}(`);
      expect(rollback).toContain(`public.${name}(`);
    }
    expect(forward).toContain("attempt_state = 'prepared'");
    expect(forward).toContain("attempt_revision = p_expected_revision");
    expect(forward).toContain("set attempt_state = 'dispatching'");
    expect(forward).toContain("set attempt_state = p_terminal_state");
    expect(forward).toContain("provider_dispatch_count in (0, 1)");
    expect(forward).toContain("provider_dispatch_count = 1");
    expect(forward).not.toMatch(/reset_|retry_|requeue/i);
    expect(forward).not.toMatch(/set\s+attempt_state\s*=\s*'prepared'/i);
  });

  it("makes every downstream transaction authority structurally false", () => {
    for (const column of [
      "final_checkout_pricing_authorized",
      "order_authorized",
      "payment_authorized",
      "settlement_authorized",
      "ticketing_authorized",
      "refund_authorized",
      "servicing_authorized",
      "consumer_release_enabled",
    ]) {
      expect(forward).toMatch(new RegExp(
        `${column} boolean not null default false\\s+check \\(not ${column}\\)`,
      ));
    }
    expect(forward).not.toMatch(/create_order|payment_intent|ticket_document|refund_request/i);
  });

  it("provides a scoped, evidence-refusing rollback only", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback.match(/Refusing rollback:/g)).toHaveLength(2);
    expect(rollback.match(/drop function if exists/g)).toHaveLength(6);
    expect(rollback.match(/drop table if exists/g)).toHaveLength(2);
    expect(rollback).not.toMatch(/drop schema|cascade|truncate|delete from/i);
  });
});
