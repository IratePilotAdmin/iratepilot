import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/202608250074_flight_consumer_preview_foundation.sql";
const rollbackPath =
  "supabase/rollbacks/202608250074_flight_consumer_preview_foundation.rollback.sql";
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

describe("flight consumer Preview foundation migration", () => {
  it("separates receipted Stripe customer payment from Duffel Balance settlement", () => {
    for (const suffix of [
      "processor_code",
      "account_sha256",
      "environment",
      "source_sha256",
      "adapter_version_sha256",
    ]) {
      const field = `bound_provider_settlement_${suffix}`;
      expect(migration).toContain(`add column ${field}`);
      expect(migration).toMatch(
        new RegExp(`receipt\\.${field}\\s+is not distinct from v_control\\.${field}`),
      );
      expect(migration).toMatch(
        new RegExp(`new\\.${field}\\s+is distinct from old\\.${field}`),
      );
    }
    expect(migration).toContain(
      "v_control.bound_payment_processor_code is distinct from 'stripe'",
    );
    expect(migration).toContain(
      "v_control.bound_provider_settlement_processor_code is distinct from 'duffel_balance'",
    );
    expect(migration).toContain(
      "v_control.bound_payment_environment is distinct from 'test'",
    );
    expect(migration).toContain(
      "v_control.bound_provider_settlement_environment is distinct from 'test'",
    );
    expect(migration).toContain(
      "constraint flight_runtime_controls_provider_settlement_dependency_check",
    );
  });

  it("returns only an exact sanitized service-role runtime authority", () => {
    expect(migration).toContain(
      "create function public.get_flight_consumer_preview_runtime_authority_v1()",
    );
    for (const field of [
      "version text",
      "authorized boolean",
      "execution_mode text",
      "bound_payment_processor_code text",
      "bound_provider_settlement_processor_code text",
      "bound_execution_scope_sha256 text",
      "activation_evidence_sha256 text",
      "runtime_control_receipt_sha256 text",
    ]) expect(migration).toContain(field);
    expect(migration).toContain("'flight-consumer-preview-runtime-authority-v1'::text");
    expect(migration).toContain("v_control.bound_environment is distinct from 'preview'");
    expect(migration).toContain(
      "v_control.bound_project_ref is distinct from 'eiqmdldjnedqgbtoozqa'",
    );
    expect(migration).toContain(
      "v_control.bound_database_name is distinct from current_database()::text",
    );
    expect(migration).toContain(
      "v_control.bound_session_user is distinct from session_user::text",
    );
    expect(migration).toContain("to_jsonb(v_receipt)::text");
    expect(migration).toMatch(
      /revoke all on function public\.get_flight_consumer_preview_runtime_authority_v1\(\)[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_flight_consumer_preview_runtime_authority_v1\(\)\s+to service_role;/,
    );
  });

  it("persists only complete encrypted offer and PII envelopes behind forced RLS", () => {
    for (const table of [
      "flight_offer_evidence_vault",
      "flight_secure_pii_records",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toMatch(
        new RegExp(`revoke all on table public\\.${table}\\s+from public, anon, authenticated, service_role;`),
      );
      expect(migration).not.toMatch(
        new RegExp(`grant [^;]+ on table public\\.${table}`, "i"),
      );
    }
    for (const field of [
      "key_version text",
      "iv_base64url",
      "auth_tag_base64url",
      "ciphertext_base64url",
      "aad_sha256",
      "record_hmac_sha256",
      "pii_hmac_sha256",
    ]) expect(migration).toContain(field);
    expect(migration).toContain("char_length(ciphertext_base64url) between 16 and 2100000");
    expect(migration).toContain("char_length(ciphertext_base64url) between 16 and 6000");
    expect(migration).toContain("key_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'");
    expect(migration).toContain("flight_passenger_refs_secure_pii_record_fk");
    expect(migration).toContain("flight_passenger_refs_secure_pii_guard");
    expect(migration).not.toMatch(
      /\b(?:given_name|family_name|born_on|email|phone_number|passport_number|raw_json|raw_body)\s+(?:text|json|jsonb)\b/i,
    );
  });

  it("purges encrypted offer evidence leaf-first without crossing an unexpired descendant", () => {
    expect(migration).toContain("with expired_leaves as (");
    expect(migration).toMatch(
      /not exists \([\s\S]*?successor\.predecessor_receipt_sha256 = evidence\.receipt_sha256[\s\S]*?\)[\s\S]*?delete from public\.flight_offer_evidence_vault as evidence[\s\S]*?using expired_leaves/,
    );
    expect(migration).toContain("exit when v_batch_deleted = 0");
    expect(migration).toContain("v_total_deleted := v_total_deleted + v_batch_deleted");
    expect(migration).not.toMatch(
      /successor\.retention_expires_at\s*>\s*p_before/,
    );
  });

  it("links one immutable consumer create-order attempt to captured Stripe evidence", () => {
    for (const field of [
      "consumer_flow_version",
      "customer_id",
      "search_id",
      "offer_id",
      "order_id",
      "offer_evidence_receipt_sha256",
      "payment_binding_receipt_sha256",
      "provider_settlement_binding_receipt_sha256",
    ]) expect(migration).toContain(`add column ${field}`);
    expect(migration).toMatch(
      /create unique index flight_provider_request_attempts_consumer_order_uidx[\s\S]*?where consumer_flow_version = 1 and operation = 'create_order';/,
    );
    expect(migration).toContain(
      "create function public.prepare_flight_consumer_duffel_order_attempt_v1(",
    );
    expect(migration).toContain(
      "create function public.claim_flight_consumer_duffel_order_attempt_v1(",
    );
    expect(migration).toContain("payment.processor_code = 'stripe'");
    expect(migration).toContain("payment.captured_cents = v_order.total_cents");
    expect(migration).toContain("payment.status = 'captured'");
    expect(migration).toContain("evidence.stage = 'refreshed'");
    expect(migration).toContain("set status = 'order_creating'");
    expect(migration).toContain("set state = 'dispatching'");
    expect(migration).toContain("and revision = p_expected_revision");
    expect(migration).not.toMatch(/\b(?:http_request|net\.http|fetch\s*\()\b/i);
  });

  it("creates an owner-inferred, exactly idempotent authenticated search", () => {
    expect(migration).toContain("create function public.begin_flight_consumer_search_v1(");
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("coalesce(auth.role(), '') <> 'authenticated'");
    expect(migration).toContain("idempotency.request_sha256 is distinct from p_request_sha256");
    expect(migration).toContain("resource_type = 'flight_search'");
    expect(migration).toMatch(
      /grant execute on function public\.begin_flight_consumer_search_v1\([\s\S]*?\) to authenticated;/,
    );
  });

  it("uses a fail-closed evidence-preserving rollback", () => {
    expect(rollback).toContain("flight_offer_evidence_vault");
    expect(rollback).toContain("flight_secure_pii_records");
    expect(rollback).toContain("consumer_flow_version = 1");
    expect(rollback).toContain("bound_provider_settlement_processor_code is not null");
    expect(rollback).toContain("requires a separately reviewed fail-closed replacement");
    expect(rollback).not.toMatch(/\b(?:drop|truncate|delete|update|insert)\b/i);
  });

  it("mirrors the exact reviewed migration bytes once in the bootstrap schema", () => {
    const marker =
      "-- Mirrored from migrations/202608250074_flight_consumer_preview_foundation.sql.";
    expect(schema.split(marker)).toHaveLength(2);
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
