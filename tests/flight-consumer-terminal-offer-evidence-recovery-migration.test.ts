import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260136_flight_consumer_terminal_offer_evidence_recovery.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const predecessor085 = readFileSync(
  new URL(
    "../supabase/migrations/202608260124_flight_consumer_ciphertext_validation_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const predecessor087 = readFileSync(
  new URL(
    "../supabase/migrations/202608260126_flight_consumer_capture_projection_repair.sql",
    import.meta.url,
  ),
  "utf8",
);

const hashes = {
  legacyLoader:
    "49da2999b8f76eb23e7b020447768829e5f138549da41ee078a8a55f57227860",
  leaseRecovery:
    "057b3c28de09f78322b07166181cf1feeaf8d544a12743a8ba9822b1cbad2bda",
  predecessorValidator:
    "5978f47bb4981847ba9272757415775d5b19643c0f95bcd135d9988d6c3a7b2f",
  repairedValidator:
    "88784c581dbef9dc342a199cb8bd77cb3e9cc30b4f2cd4c6a0d98a4c41e1c850",
  predecessorFinalizer:
    "93c1e2eb79ba69f39d1ab7ad92ce1023e7b49712cbd0a2b13cccc46a63017533",
  repairedFinalizer:
    "dfff2494bc5c12a91b2893f5b72efba77d5137dab0d96dcfd30664f602877825",
  loader:
    "d1165286160c3ae5694950bbebfac75adcbab6a708f5e2343dba4d752e7b8172",
  observation:
    "b590fcdec6e55c09c23be2e42f026be010bc655b78ededeccee5c01d3d6fdde8",
} as const;

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

const finalizerDeletedMarker =
  "    or v_offer_evidence.deleted_at is not null";
const finalizerProviderMarker =
  "    or v_offer_evidence.provider_offer_ref_sha256\n" +
  "      is distinct from v_offer.provider_offer_ref_sha256";
const finalizerCurrentExpiryMarker =
  "    or v_offer_evidence.retention_expires_at <= clock_timestamp()";
const finalizerDispatchTimeMarker =
  "    or v_attempt.dispatch_started_at is null\n" +
  "    or v_attempt.dispatch_started_at < v_offer_evidence.observed_at\n" +
  "    or v_attempt.dispatch_started_at >= v_offer_evidence.retention_expires_at\n" +
  "    or clock_timestamp() > v_attempt.dispatch_started_at + interval '7 days'";

const validatorCurrentOfferMarker =
  "     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256\n" +
  "     and evidence.deleted_at is null\n" +
  "     and evidence.retention_expires_at > clock_timestamp();";
const validatorDispatchTimeMarker =
  "     and v_attempt.dispatch_started_at is not null\n" +
  "     and evidence.observed_at <= v_attempt.dispatch_started_at\n" +
  "     and v_attempt.dispatch_started_at < evidence.retention_expires_at\n" +
  "     and clock_timestamp() <= v_attempt.dispatch_started_at + interval '7 days';";

function normalizeNewlines(source: string) {
  return source.replace(/\r\n/g, "\n");
}

function occurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

function taggedBlock(source: string, tag: string) {
  const normalized = normalizeNewlines(source);
  const start = normalized.indexOf(`do ${tag}`);
  const end = normalized.indexOf(`${tag};`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return normalized.slice(start, end + tag.length + 1);
}

function functionBody(source: string, tag: string) {
  const normalized = normalizeNewlines(source);
  const marker = `as ${tag}`;
  const start = normalized.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = start + marker.length;
  const bodyEnd = normalized.indexOf(`${tag};`, bodyStart);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return normalized.slice(bodyStart, bodyEnd);
}

function functionDefinition(source: string, name: string, tag: string) {
  const normalized = normalizeNewlines(source);
  const createStart = normalized.indexOf(`create function public.${name}(`);
  const replaceStart = normalized.indexOf(
    `create or replace function public.${name}(`,
  );
  const start = createStart >= 0 ? createStart : replaceStart;
  const end = normalized.indexOf(`${tag};`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return normalized.slice(start, end + tag.length + 1);
}

function sha256(source: string) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

describe("Flight Consumer Preview terminal offer-evidence recovery migration", () => {
  it("is relocked and pinned to the exact reviewed predecessors and replacements", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_097_dependencies$",
    );
    const precondition = taggedBlock(
      migration,
      "$flight_consumer_preview_097_relocked_precondition$",
    );
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_097_postcondition$",
    );
    const finalizerRepair = taggedBlock(
      migration,
      "$flight_consumer_preview_097_finalizer_repair$",
    );
    const validatorRepair = taggedBlock(
      migration,
      "$flight_consumer_preview_097_validator_repair$",
    );

    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(dependencies).toContain("requires migrations 068 through 096");
    for (const hash of [
      hashes.legacyLoader,
      hashes.leaseRecovery,
      hashes.predecessorValidator,
      hashes.predecessorFinalizer,
    ]) {
      expect(dependencies).toContain(hash);
    }
    expect(dependencies).toContain(
      "attribute.attname in ('deleted_at', 'provider_offer_ref_sha256')",
    );
    expect(dependencies).toContain(
      "Flight async Duffel finalizer predecessor has drifted",
    );
    expect(dependencies).toContain(
      "Flight async order-finalization validator predecessor has drifted",
    );
    expect(
      occurrences(
        migration,
        "v_source := replace(v_source, chr(13) || chr(10), chr(10));",
      ),
    ).toBe(6);
    expect(occurrences(migration, "v_definition := regexp_replace(")).toBe(2);

    expect(occurrences(finalizerRepair, "v_definition := replace(")).toBe(3);
    for (const marker of [
      finalizerDeletedMarker,
      finalizerCurrentExpiryMarker,
      "'    or v_offer_evidence.provider_offer_ref_sha256'",
      "'      is distinct from v_offer.provider_offer_ref_sha256'",
      "'    or v_attempt.dispatch_started_at is null'",
      "'    or v_attempt.dispatch_started_at < v_offer_evidence.observed_at'",
      "'    or v_attempt.dispatch_started_at >= v_offer_evidence.retention_expires_at'",
      "'    or clock_timestamp() > v_attempt.dispatch_started_at + interval ''7 days'''",
    ]) {
      expect(finalizerRepair).toContain(marker);
    }
    expect(finalizerRepair).toContain(hashes.predecessorFinalizer);
    expect(finalizerRepair).toContain(hashes.repairedFinalizer);

    expect(occurrences(validatorRepair, "v_definition := replace(")).toBe(1);
    for (const marker of [
      "'     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256'",
      "'     and evidence.deleted_at is null'",
      "'     and evidence.retention_expires_at > clock_timestamp();'",
      "'     and v_attempt.dispatch_started_at is not null'",
      "'     and evidence.observed_at <= v_attempt.dispatch_started_at'",
      "'     and v_attempt.dispatch_started_at < evidence.retention_expires_at'",
      "'     and clock_timestamp() <= v_attempt.dispatch_started_at + interval ''7 days'';'",
    ]) {
      expect(validatorRepair).toContain(marker);
    }
    expect(validatorRepair).toContain(hashes.predecessorValidator);
    expect(validatorRepair).toContain(hashes.repairedValidator);

    for (const capability of disabledCapabilities) {
      expect(precondition).toContain(`and not control.${capability}`);
      expect(postcondition).toContain(`and not control.${capability}`);
    }
    expect(precondition).toContain(
      "migration 097 requires relock before repair",
    );
    expect(precondition).toContain("v_safe_count <> 1");
    expect(postcondition).toContain("v_safe_count <> 1");
  });

  it("loads historical offer evidence only for one captured Duffel TEST success chain", () => {
    const body = functionBody(
      migration,
      "$load_flight_offer_evidence_for_terminal_recovery$",
    );
    const definition = functionDefinition(
      migration,
      "load_flight_offer_evidence_for_terminal_recovery_v1",
      "$load_flight_offer_evidence_for_terminal_recovery$",
    );

    expect(sha256(body)).toBe(hashes.loader);
    expect(occurrences(migration, hashes.loader)).toBe(1);
    expect(definition).toContain("language plpgsql\nsecurity definer");
    expect(definition).toContain(
      "set search_path = pg_catalog, public, extensions",
    );
    expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(body).toContain(
      "v_order.status not in ('order_creating', 'requires_review')",
    );
    expect(body).not.toContain(
      "v_order.status not in ('requires_review', 'ticketed')",
    );
    expect(body).toContain("v_order.execution_mode <> 'test'");
    expect(body).toContain("v_order.provider_code <> 'duffel'");
    expect(body).toContain("v_order.provider_order_ref_ciphertext is not null");
    expect(body).toContain("v_order.provider_order_ref_sha256 is not null");
    expect(body).toContain("v_order.provider_created_at is not null");

    expect(body).toContain("v_attempt.operation <> 'create_order'");
    expect(body).toContain("v_attempt.provider_code <> 'duffel'");
    expect(body).toContain("v_attempt.execution_mode <> 'test'");
    expect(body).toContain("v_attempt.state <> 'succeeded'");
    expect(body).toContain("v_attempt.revision <> 2");
    expect(body).toContain("or v_attempt.retry_authorized");
    expect(body).toContain("v_attempt.terminal_http_status not between 200 and 299");
    expect(body).toContain(
      "v_now > v_attempt.dispatch_started_at + interval '7 days'",
    );

    expect(body).toContain("payment.status = 'captured'");
    expect(body).toContain("v_payment.execution_mode <> 'test'");
    expect(body).toContain("v_payment.processor_code <> 'stripe'");
    expect(body).toContain(
      "v_payment.captured_cents is distinct from v_order.total_cents",
    );
    expect(body).toContain("v_payment.refunded_cents <> 0");
    expect(body).toContain("v_payment.authorized_at is null");
    expect(body).toContain("v_payment.captured_at is null");

    expect(body).toContain("flight_order_response_evidence_vault");
    expect(body).toContain(
      "v_response.provider_response_sha256\n      is distinct from v_attempt.terminal_response_sha256",
    );
    for (const guard of [
      "v_response.evidence_receipt_sha256 is null",
      "v_response.key_version is null",
      "v_response.iv_base64url is null",
      "v_response.auth_tag_base64url is null",
      "v_response.ciphertext_base64url is null",
      "v_response.aad_sha256 is null",
      "v_response.ciphertext_sha256 is null",
      "v_response.deleted_at is not null",
      "v_response.retention_expires_at <= v_now",
      "v_response.created_at < v_attempt.completed_at",
    ]) {
      expect(body).toContain(guard);
    }

    expect(body).toContain(
      "evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256",
    );
    expect(body).toContain("v_refreshed.stage <> 'refreshed'");
    expect(body).toContain("v_predecessor.stage <> 'initial'");
    expect(body).toContain(
      "v_refreshed.predecessor_receipt_sha256 is null",
    );
    expect(body).toContain(
      "v_predecessor.predecessor_receipt_sha256 is not null",
    );
    expect(body).toContain(
      "v_predecessor.local_offer_id is distinct from v_refreshed.local_offer_id",
    );
    expect(body).toContain(
      "v_predecessor.retention_expires_at\n      is distinct from v_refreshed.retention_expires_at",
    );
    for (const evidence of ["v_refreshed", "v_predecessor"]) {
      expect(body).toContain(
        `v_attempt.dispatch_started_at < ${evidence}.observed_at`,
      );
      expect(body).toContain(
        `v_attempt.dispatch_started_at >= ${evidence}.retention_expires_at`,
      );
      expect(body).toContain(
        `${evidence}.retention_expires_at\n      > ${evidence}.observed_at + interval '7 days'`,
      );
    }
    expect(body).toContain(
      "p_receipt_sha256 = v_refreshed.receipt_sha256",
    );
    expect(body).toContain(
      "p_receipt_sha256 = v_predecessor.receipt_sha256",
    );
    expect(body).toContain(
      "receipt is outside the authorized chain",
    );
    expect(body).not.toMatch(/v_(?:offer|search)\.(?:expires_at|valid_until)/);
  });

  it("exposes only a bound recovery observation timestamp", () => {
    const body = functionBody(
      migration,
      "$get_flight_consumer_duffel_recovery_evidence_observation$",
    );
    const definition = functionDefinition(
      migration,
      "get_flight_consumer_duffel_recovery_evidence_observation_v1",
      "$get_flight_consumer_duffel_recovery_evidence_observation$",
    );

    expect(sha256(body)).toBe(hashes.observation);
    expect(occurrences(migration, hashes.observation)).toBe(1);
    expect(definition).toContain("returns table (created_at timestamptz)");
    expect(definition).toContain("language plpgsql\nsecurity definer");
    expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(body).toContain("v_order.execution_mode <> 'test'");
    expect(body).toContain("v_order.provider_code <> 'duffel'");
    expect(body).toContain("v_order.status not in ('requires_review', 'ticketed')");
    expect(body).toContain("v_ledger.source <> 'duffel'");
    expect(body).toContain("v_ledger.event_type <> 'order.created'");
    expect(body).toContain("v_ledger.provider_live_mode is distinct from false");
    expect(body).toContain("v_ledger.state <> 'processed'");
    expect(body).toContain("v_ledger.revision <> 2");
    expect(body).toContain(
      "v_attempt.id is null\n    or v_attempt.customer_id is distinct from v_order.customer_id",
    );
    expect(body).toContain("v_attempt.state <> 'succeeded'");
    expect(body).toContain("v_attempt.revision <> 2");
    expect(body).toContain("or v_attempt.retry_authorized");
    expect(body).toContain(
      "evidence.recovery_evidence_receipt_sha256\n       = p_recovery_evidence_receipt_sha256",
    );
    for (const binding of [
      "v_evidence.attempt_id is distinct from v_attempt.id",
      "v_evidence.order_id is distinct from v_order.id",
      "v_evidence.customer_id is distinct from v_order.customer_id",
      "v_evidence.execution_scope_sha256\n      is distinct from v_order.execution_scope_sha256",
      "v_evidence.provider_offer_ref_sha256\n      is distinct from v_ledger.provider_offer_ref_sha256",
      "v_evidence.provider_order_ref_sha256\n      is distinct from v_ledger.provider_order_ref_sha256",
      "v_evidence.webhook_verification_receipt_sha256\n      is distinct from v_ledger.verification_receipt_sha256",
      "v_evidence.deleted_at is not null",
      "v_evidence.retention_expires_at <= v_now",
      "v_evidence.retention_expires_at\n      > v_evidence.created_at + interval '7 days'",
    ]) {
      expect(body).toContain(binding);
    }
    expect(body).toContain("return query select v_evidence.created_at");
    expect(occurrences(body, "return query select")).toBe(1);
    expect(definition).not.toMatch(
      /returns table \([^)]*(?:ciphertext|provider_order|provider_offer|customer_id)/,
    );
  });

  it("adds read-only recovery boundaries without provider or payment dispatch authority", () => {
    const loader = functionBody(
      migration,
      "$load_flight_offer_evidence_for_terminal_recovery$",
    );
    const observation = functionBody(
      migration,
      "$get_flight_consumer_duffel_recovery_evidence_observation$",
    );

    expect(migration).toContain(
      "This migration adds no provider or\n-- payment dispatch authority",
    );
    expect(migration).toContain("provider redispatch is never authorized");
    expect(migration).toContain(
      "ciphertext and provider dispatch authority are never exposed",
    );
    for (const body of [loader, observation]) {
      expect(body).not.toMatch(
        /(?:^|\n)\s*(?:insert\s+into|update|delete\s+from|merge\s+into|truncate|perform|call)\b/i,
      );
      expect(body).not.toMatch(
        /(?:claim_flight|complete_flight_consumer_payment|apply_flight_consumer_capture|authorize.*redispatch)/i,
      );
    }
  });

  it("removes only invalid/current offer predicates and preserves recovery retention", () => {
    const predecessorFinalizer = functionBody(
      predecessor087,
      "$finalize_flight_consumer_async_duffel_order_087$",
    );
    const predecessorValidator = functionBody(
      predecessor085,
      "$validate_flight_consumer_async_order_finalization_085$",
    );

    expect(sha256(predecessorFinalizer)).toBe(hashes.predecessorFinalizer);
    expect(sha256(predecessorValidator)).toBe(hashes.predecessorValidator);
    expect(occurrences(predecessorFinalizer, finalizerDeletedMarker)).toBe(1);
    expect(occurrences(predecessorFinalizer, finalizerProviderMarker)).toBe(1);
    expect(occurrences(predecessorFinalizer, finalizerCurrentExpiryMarker)).toBe(
      1,
    );
    expect(occurrences(predecessorValidator, validatorCurrentOfferMarker)).toBe(
      1,
    );

    const repairedFinalizer = predecessorFinalizer
      .replace(finalizerDeletedMarker, "")
      .replace(finalizerProviderMarker, "")
      .replace(finalizerCurrentExpiryMarker, finalizerDispatchTimeMarker);
    const repairedValidator = predecessorValidator.replace(
      validatorCurrentOfferMarker,
      validatorDispatchTimeMarker,
    );

    expect(sha256(repairedFinalizer)).toBe(hashes.repairedFinalizer);
    expect(repairedFinalizer).not.toContain("v_offer_evidence.deleted_at");
    expect(repairedFinalizer).not.toContain(
      "v_offer_evidence.provider_offer_ref_sha256",
    );
    expect(repairedFinalizer).not.toContain(finalizerCurrentExpiryMarker);
    expect(repairedFinalizer).toContain(finalizerDispatchTimeMarker);
    expect(repairedFinalizer).toContain(
      "or v_recovery.deleted_at is not null",
    );
    expect(repairedFinalizer).toContain(
      "or v_recovery.retention_expires_at <= clock_timestamp()",
    );

    expect(sha256(repairedValidator)).toBe(hashes.repairedValidator);
    expect(repairedValidator).not.toContain(validatorCurrentOfferMarker);
    expect(repairedValidator).toContain(validatorDispatchTimeMarker);
    expect(
      occurrences(repairedValidator, "evidence.provider_offer_ref_sha256"),
    ).toBe(1);
    expect(occurrences(repairedValidator, "evidence.deleted_at is null")).toBe(
      1,
    );
    expect(
      occurrences(
        repairedValidator,
        "evidence.retention_expires_at > clock_timestamp()",
      ),
    ).toBe(1);
  });

  it("keeps execution least-privileged and verifies every installed boundary", () => {
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_097_postcondition$",
    );
    const loaderSignature =
      "public.load_flight_offer_evidence_for_terminal_recovery_v1(\n" +
      "  uuid, uuid, uuid, text, text\n)";
    const observationSignature =
      "public.get_flight_consumer_duffel_recovery_evidence_observation_v1(\n" +
      "  uuid, uuid, uuid, text\n)";
    const finalizerSignature =
      "public.finalize_flight_consumer_async_duffel_order_v1(\n" +
      "  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb\n)";

    for (const signature of [loaderSignature, observationSignature]) {
      expect(migration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role;`,
      );
      expect(migration).toContain(
        `grant execute on function ${signature} to service_role;`,
      );
    }
    expect(migration).toContain(
      "revoke all on function public.validate_flight_consumer_async_order_finalization_v1()\n" +
        "  from public, anon, authenticated, service_role;",
    );
    expect(migration).not.toContain(
      "grant execute on function public.validate_flight_consumer_async_order_finalization_v1()",
    );
    expect(migration).toContain(
      `revoke all on function ${finalizerSignature} from public, anon, authenticated, service_role;`,
    );
    expect(migration).toContain(
      `grant execute on function ${finalizerSignature} to service_role;`,
    );

    for (const hash of [
      hashes.loader,
      hashes.observation,
      hashes.repairedValidator,
      hashes.repairedFinalizer,
    ]) {
      expect(postcondition).toContain(hash);
    }
    expect(occurrences(postcondition, "search_path=pg_catalog, public, extensions")).toBe(
      4,
    );
    expect(postcondition).toContain("not coalesce(v_loader_security_definer, false)");
    expect(postcondition).toContain(
      "not coalesce(v_observation_security_definer, false)",
    );
    expect(postcondition).toContain(
      "not coalesce(v_validator_security_definer, false)",
    );
    expect(postcondition).toContain(
      "not coalesce(v_finalizer_security_definer, false)",
    );
    expect(postcondition).toContain(
      "'authenticated',\n      'public.load_flight_offer_evidence_for_terminal_recovery_v1",
    );
    expect(postcondition).toContain(
      "'anon',\n      'public.get_flight_consumer_duffel_recovery_evidence_observation_v1",
    );
    expect(postcondition).toContain(
      "'service_role', 'public.flight_offer_evidence_vault', 'SELECT'",
    );
    expect(postcondition).toContain(
      "'service_role', 'public.flight_order_response_evidence_vault', 'SELECT'",
    );
    expect(postcondition).toContain(
      "'service_role', 'public.flight_order_recovery_evidence_vault', 'SELECT'",
    );
    expect(postcondition).toContain(
      "trigger_row.tgname = 'flight_orders_async_finalization_guard'",
    );
    expect(postcondition).toContain("trigger_row.tgenabled = 'O'");
    expect(postcondition).toContain(
      "Flight Consumer Preview migration 097 loader postcondition failed",
    );
    expect(postcondition).toContain(
      "Flight Consumer Preview migration 097 observation postcondition failed",
    );
    expect(postcondition).toContain(
      "Flight Consumer Preview migration 097 validator postcondition failed",
    );
    expect(postcondition).toContain(
      "Flight Consumer Preview migration 097 finalizer postcondition failed",
    );
  });

  it("uses a fail-closed forward-only rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback).toMatch(/forward-only/i);
    expect(rollback).toMatch(/cannot be rolled back safely/i);
    expect(rollback).toMatch(/immutable dispatch-time offer evidence/i);
    expect(rollback).toMatch(/restore from a reviewed backup/i);
    expect(rollback).toMatch(/raise exception/i);
    expect(rollback).not.toMatch(
      /^\s*(?:alter|create|drop|grant|revoke|truncate|update|insert|delete)\b/im,
    );
    expect(rollback.trim().toLowerCase().endsWith("rollback;")).toBe(true);
  });
});
