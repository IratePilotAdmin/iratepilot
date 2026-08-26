import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608250080_flight_consumer_preview_activation_control.sql";
const rollbackPath =
  "supabase/rollbacks/202608250080_flight_consumer_preview_activation_control.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

function functionBody(name: string) {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("\ncreate ", start + 20);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("flight consumer Preview activation control migration", () => {
  it("requires the complete 079 Consumer Preview foundation", () => {
    for (const contract of [
      "public.activate_flight_consumer_preview_v1(timestamptz,text,text,text,text,text,text)",
      "public.relock_flight_consumer_preview_v1(timestamptz,text,text,text,text,text)",
      "public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)",
      "public.queue_flight_consumer_notification_v1(uuid,uuid,text,uuid,text,text,text,text,text,text,text)",
      "public.create_flight_consumer_preview_service_request_v1(uuid,text,text,text)",
    ]) expect(migration).toContain(contract);
    expect(migration).toContain(
      "Flight Consumer Preview activation control requires migrations 068 through 079",
    );
  });

  it("binds activation evidence to the exact current 074-through-079 ledger", () => {
    const manifest = functionBody(
      "flight_consumer_preview_activation_manifest_sha256_v2",
    );
    const activation = functionBody("activate_flight_consumer_preview_v1");
    const hashes = [
      "c5cf8ace2562332255758736970a022bced59c76867b1b71ce7703f12bb7bb98",
      "3edaffb8bb93588932ad4d3c5cd0727b360c9f669709bab2da9c4e25130f5e49",
      "3023e8190fa10b7b5f5de57fa588eaba39fe082a4eb06218d60d12adf839f8b1",
      "f7aba46a72d6acfb9bf016faf8c666c37e3e3a73715114ebeadd12f2cd1f5ff7",
      "187c46f7bc08d7f8165341858ecfac918048aac8dce2f70cb594406647aed8fb",
      "02f5ed7064cfb2623e60c88bae8b042bdea08682473963e794711caf38d242ca",
    ];
    for (const hash of hashes) {
      expect(manifest).toContain(hash);
      expect(activation).toContain(hash);
    }
    expect(manifest).toContain("202608250080");
    expect(activation).toContain("activation-evidence.v2");
    expect(activation).toContain("activation_manifest_sha256");
    expect(activation).not.toContain(
      "6d558fb287fb8ef863a031a3bcd0e9a91602405f16bba660814b4a7b12486ccb",
    );
  });

  it("exposes only a locked authenticated-admin CAS snapshot", () => {
    const preflight = functionBody(
      "get_flight_consumer_preview_activation_preflight_v1",
    );
    for (const contract of [
      "coalesce(auth.role(), '') <> 'authenticated'",
      "profile.id = v_actor and profile.role = 'admin'",
      "current_database()::text <> 'postgres'",
      "session_user::text <> 'authenticator'",
      "execution_kill_switch_engaged",
      "v_is_v8_predecessor",
      "v_is_target_predecessor",
      "flight_current_runtime_control_receipt_sha256_v1",
      "expected_updated_at timestamptz",
      "expected_execution_scope_sha256 text",
      "expected_activation_evidence_sha256 text",
      "expected_runtime_control_receipt_sha256 text",
      "target_execution_scope_sha256 text",
      "activation_manifest_sha256 text",
    ]) expect(preflight).toContain(contract);
    expect(preflight).not.toContain("for update");
    expect(preflight).not.toMatch(
      /(?:access_token|secret_key|card_number|cvc|passenger|provider_order_ref)/i,
    );
  });

  it("makes activation and relock the exclusive authenticated mutation path", () => {
    expect(migration).toContain(
      'drop policy if exists "Flight admins update runtime controls"',
    );
    expect(migration).toMatch(
      /revoke update on table public\.flight_runtime_controls\s+from public, anon, authenticated, service_role;/,
    );
    expect(migration).toContain("has_table_privilege('authenticated'");
    expect(migration).toContain("has_any_column_privilege(");
    expect(migration).toContain("cmd in ('ALL', 'UPDATE')");
    expect(migration).not.toMatch(
      /grant\s+update(?:\s*\([^)]*\))?\s+on(?:\s+table)?\s+public\.flight_runtime_controls/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_flight_consumer_preview_activation_preflight_v1\(text\)\s+to authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.activate_flight_consumer_preview_v1\([\s\S]*?\) to authenticated;/,
    );
  });

  it("does not weaken the service-role-only runtime authority", () => {
    expect(migration).not.toMatch(
      /grant execute on function public\.get_flight_consumer_preview_runtime_authority_v1\(\)\s+to authenticated;/,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.flight_consumer_preview_activation_manifest_sha256_v2\(\)/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.flight_consumer_preview_activation_manifest_sha256_v2\(\)\s+from public, anon, authenticated, service_role;/,
    );
  });

  it("uses a forward-only rollback that never reopens direct UPDATE", () => {
    expect(rollback).toContain("Migration 080 is forward-only");
    expect(rollback).toContain("keep direct authenticated UPDATE revoked");
    expect(rollback).not.toMatch(
      /^\s*(?:drop|truncate|delete|update|insert|grant)\b/im,
    );
  });

  it("mirrors the exact reviewed migration bytes once in the bootstrap schema", () => {
    const marker =
      "-- Mirrored from migrations/202608250080_flight_consumer_preview_activation_control.sql.";
    expect(schema.split(marker)).toHaveLength(2);
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
