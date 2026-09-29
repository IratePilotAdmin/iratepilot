import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "202608240069_flight_provider_request_attempts.sql";
const rollbackName = "202608240069_flight_provider_request_attempts.rollback.sql";
const migration = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
const rollback = readFileSync(`supabase/rollbacks/${rollbackName}`, "utf8");
const bootstrap = readFileSync("supabase/schema.sql", "utf8");

function functionDefinition(name: string): string {
  const start = migration.indexOf(`create function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

function sqlFunctionNames(sql: string, verb: "create" | "drop"): string[] {
  return [...sql.matchAll(new RegExp(`${verb} function public\\.([a-z0-9_]+)\\(`, "g"))]
    .map((match) => match[1])
    .sort();
}

describe("flight provider request-attempt migration", () => {
  it("installs only a default-off, dependency-gated journal foundation", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("Flight provider request attempts require migration 068");
    expect(migration).toContain(
      "public.flight_runtime_capability_enabled(text,text,text,text,text)",
    );
    expect(migration).toContain("extensions.digest(bytea,text)");
    expect(migration).toContain("create table public.flight_provider_request_attempts");
    expect(migration).toContain(
      "'create_offer_request', 'retrieve_offer', 'list_orders_by_offer'",
    );
    expect(migration).toContain("when 'create_offer_request' then 'shopping'");
    expect(migration).toContain("when 'retrieve_offer' then 'shopping'");
    expect(migration).toContain("when 'list_orders_by_offer' then 'shopping'");
    expect(migration).toContain("if p_operation = 'create_order' then");
    expect(migration).toContain(
      "Flight create_order HTTP dispatch requires a later durable authority migration",
    );
    expect(migration).not.toMatch(/\b(?:insert into|update)\s+public\.flight_runtime_controls\b/i);
    for (const unsupportedOperation of [
      "process_webhook",
      "authorize_payment",
      "issue_ticket",
      "change_order",
      "cancel_order",
    ]) {
      expect(migration).not.toContain(unsupportedOperation);
    }
    expect(migration).not.toMatch(/\b(?:fetch|http_request|net\.http|vault\.)\b/i);
  });

  it("persists exact immutable request identity and digest-only opaque receipts", () => {
    const table = migration.match(
      /create table public\.flight_provider_request_attempts \(([\s\S]*?)\n\);\n\n-- Current transport operations/,
    )?.[1];
    expect(table).toBeDefined();
    for (const column of [
      "tenant_id",
      "commerce_id",
      "operation",
      "provider_code",
      "execution_mode",
      "execution_scope_sha256",
      "activation_evidence_sha256",
      "adapter_version_sha256",
      "adapter_source_sha256",
      "provider_account_sha256",
      "point_of_sale_sha256",
      "content_scope_sha256",
      "provider_binding_receipt_sha256",
      "request_plan_sha256",
      "request_sha256",
      "request_body_sha256",
      "operation_authority_receipt_sha256",
    ]) {
      expect(table).toMatch(new RegExp(`\\b${column}\\b`));
      expect(migration).toMatch(
        new RegExp(`new\\.${column}\\s+is distinct from old\\.${column}`),
      );
    }
    expect(table).toContain("state text not null default 'prepared'");
    expect(table).toContain("retry_authorized boolean not null default false");
    expect(table).toContain("check (retry_authorized = false)");
    expect(table).not.toMatch(
      /\b(?:request_url|request_body|response_body|raw_payload|access_token|api_key|credential|provider_order_id|provider_offer_id|provider_request_id)\s+(?:text|jsonb?|bytea)\b/i,
    );
    expect(table).not.toContain("provider_resource_id");
    expect(table).not.toContain("'create_order'");
    for (const deferredAuthority of [
      "idempotency_request_sha256",
      "settlement_binding_sha256",
      "settlement_authority_receipt_sha256",
      "offer_evidence_receipt_sha256",
      "accepted_terms_receipt_sha256",
      "traveler_pii_receipt_sha256",
    ]) {
      expect(table).not.toContain(deferredAuthority);
    }
  });

  it("atomically locks and rechecks runtime, provider, and receipt authority", () => {
    const prepare = functionDefinition("prepare_flight_provider_request_attempt");
    const claim = functionDefinition("claim_flight_provider_request_attempt_for_dispatch");

    for (const definition of [prepare, claim]) {
      expect(definition).toContain("coalesce(auth.role(), '') <> 'service_role'");
      expect(definition).toContain("from public.flight_runtime_controls");
      expect(definition).toContain("for update;");
      expect(definition).toContain("v_control.execution_kill_switch_engaged");
      expect(definition).toContain("public.flight_runtime_capability_enabled(");
      expect(definition).toContain("bound_provider_code");
      expect(definition).toContain("bound_execution_scope_sha256");
      expect(definition).toContain("bound_adapter_version_sha256");
      expect(definition).toContain("bound_provider_account_sha256");
      expect(definition).toContain("bound_point_of_sale");
      expect(definition).toContain("bound_content_scope_sha256");
      expect(definition).toContain("app.flight_adapter_source_sha256");
      expect(definition).toContain("app.flight_provider_binding_receipt_sha256");
      expect(definition).toContain("app.flight_request_authority_receipt_sha256");
      expect(definition).not.toContain("settlement");
      expect(definition).not.toContain("traveler_pii");
    }
    expect(prepare).toContain("p_dispatch_not_after > v_now + interval '5 minutes'");
    expect(claim).toContain("v_attempt.dispatch_not_after <= v_now");
    expect(prepare.lastIndexOf("for update;")).toBeLessThan(
      prepare.indexOf("v_now := clock_timestamp();"),
    );
    expect(claim.lastIndexOf("for update;")).toBeLessThan(
      claim.indexOf("v_now := clock_timestamp();"),
    );
    expect(claim).toContain("credential must already have been validated");
    expect(claim).toContain("final database claim immediately before HTTP dispatch");
    expect(claim).toContain("committed dispatch claim is the explicit in-flight boundary");
    expect(migration).toContain("this migration does not authenticate or mint it");
    expect(migration).not.toContain("authenticated receipt rechecks");
    expect(claim).toContain("where id = p_attempt_id");
    expect(claim).toContain("and state = 'prepared'");
    expect(claim).toContain("and revision = p_expected_revision");
  });

  it("has execution-mode-scoped request uniqueness and no idempotency or retry authority", () => {
    expect(migration).toContain("flight_provider_request_attempts_request_uidx");
    expect(migration).toContain(
      "tenant_id, commerce_id, provider_account_sha256, execution_mode,\n    provider_code, operation, request_sha256",
    );
    expect(migration).toContain("when unique_violation then");
    expect(migration).toContain("retry is not authorized");
    expect(migration).not.toMatch(
      /\b(?:idempotency_request_sha256|retry_count|attempt_number|next_retry_at)\b/,
    );
  });

  it("enforces exact CAS transitions and converts dispatched uncertainty only to ambiguous", () => {
    const guard = functionDefinition("protect_flight_provider_request_attempt");
    const completion = functionDefinition("complete_flight_provider_request_attempt");
    expect(migration).toContain(
      "state in ('prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked')",
    );
    expect(guard).toContain("new.revision <> old.revision + 1");
    expect(guard).toContain("old.state = 'prepared' and new.state = 'dispatching'");
    expect(guard).toContain("old.state = 'prepared' and new.state = 'blocked'");
    expect(guard).toContain("old.state = 'dispatching'");
    expect(guard).toContain("new.state in ('succeeded', 'failed', 'ambiguous')");
    expect(guard).toContain("transition is not authorized");
    expect(completion).toContain("v_attempt.revision <> p_expected_revision");
    expect(completion.lastIndexOf("for update;")).toBeLessThan(
      completion.indexOf("v_now := clock_timestamp();"),
    );
    expect(completion).toContain("p_terminal_state <> 'blocked'");
    expect(completion).toContain(
      "p_terminal_state not in ('succeeded', 'failed', 'ambiguous')",
    );
    expect(completion).toContain("Dispatched uncertainty must be recorded as ambiguous");
    expect(completion).toContain("Ambiguous provider dispatch cannot claim a response");
    expect(completion).toContain("Only a never-dispatched prepared attempt may become blocked");
    expect(completion).not.toMatch(
      /state = 'dispatching'[\s\S]*?p_terminal_state[^\n]*'blocked'/,
    );
    expect(guard).not.toMatch(
      /old\.state = 'dispatching'[\s\S]*?new\.state in \([^)]*'blocked'/,
    );
    expect(completion).not.toContain("retry");
  });

  it("exposes forced-RLS read evidence and mutation RPCs only to service_role", () => {
    expect(migration).toContain(
      "alter table public.flight_provider_request_attempts enable row level security;",
    );
    expect(migration).toContain(
      "alter table public.flight_provider_request_attempts force row level security;",
    );
    expect(migration).toContain(
      "revoke all on table public.flight_provider_request_attempts\n  from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant select on table public.flight_provider_request_attempts to service_role;",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete|all)[\s\S]*?flight_provider_request_attempts/i,
    );
    for (const rpc of [
      "prepare_flight_provider_request_attempt",
      "claim_flight_provider_request_attempt_for_dispatch",
      "complete_flight_provider_request_attempt",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public\\.${rpc}\\([\\s\\S]*?\\)\\s+from public, anon, authenticated, service_role;`,
        ),
      );
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?\\) to service_role;`),
      );
    }
    expect(migration).not.toMatch(/grant execute[\s\S]*?to (?:anon|authenticated);/);
  });

  it("provides an exact data-preserving rollback with function parity", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "lock table public.flight_provider_request_attempts in access exclusive mode;",
    );
    expect(rollback).toContain(
      "Refusing rollback: flight provider request-attempt evidence exists",
    );
    expect(rollback).toContain("drop trigger flight_provider_request_attempts_transition_guard");
    expect(rollback).toContain("drop table public.flight_provider_request_attempts;");
    expect(sqlFunctionNames(rollback, "drop")).toEqual(sqlFunctionNames(migration, "create"));
    const normalizeSignatureWhitespace = (sql: string) => sql
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
    const normalizedMigration = normalizeSignatureWhitespace(migration);
    const normalizedRollback = normalizeSignatureWhitespace(rollback);
    const exactRpcSignatures = [
      `prepare_flight_provider_request_attempt(${[
        ...Array<string>(17).fill("text"),
        "timestamptz",
      ].join(", ")})`,
      "claim_flight_provider_request_attempt_for_dispatch(uuid, integer)",
      "complete_flight_provider_request_attempt(uuid, integer, text, smallint, text, bigint, text)",
      "protect_flight_provider_request_attempt()",
    ];
    for (const signature of exactRpcSignatures) {
      expect(normalizedMigration).toContain(`function public.${signature}`);
      expect(normalizedRollback).toContain(`drop function public.${signature};`);
    }
  });

  it("mirrors the exact unapplied 069 bytes once in the bootstrap schema", () => {
    const marker = `-- Mirrored from migrations/${migrationName}.`;
    expect(bootstrap.split(marker).length - 1).toBe(1);
    expect(bootstrap).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
