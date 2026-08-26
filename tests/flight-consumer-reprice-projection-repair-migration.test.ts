import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizedStagedFlightOfferEvidence } from "../lib/flights/consumer-preview/duffel-normalization.server";
import { safeFlightConsumerPreviewRepriceDiagnostic } from "../lib/flights/consumer-preview/offer-diagnostics";
import type { FlightOfferEvidenceStoreRpcParameters } from "../lib/flights/consumer-preview/offer-evidence-repository.server";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260125_flight_consumer_reprice_projection_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260125_flight_consumer_reprice_projection_repair.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const predecessor = readFileSync(
  new URL(
    "../supabase/migrations/202608250075_flight_consumer_preview_orchestration.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const workflow = readFileSync(
  new URL("../lib/flights/consumer-preview/offer-workflow.server.ts", import.meta.url),
  "utf8",
);

function functionDefinition(source: string, name: string, dollarTag: string) {
  const end = source.indexOf(`${dollarTag};`);
  const replaceStart = source.lastIndexOf(
    `create or replace function ${name}(`,
    end,
  );
  const createStart = source.lastIndexOf(`create function ${name}(`, end);
  const definitionStart = replaceStart >= 0 ? replaceStart : createStart;
  expect(definitionStart).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(definitionStart);
  return source.slice(definitionStart, end + dollarTag.length + 1);
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

const evidenceKeys = [
  "stage",
  "predecessor_receipt_sha256",
  "observed_at",
  "retention_expires_at",
  "raw_body_sha256",
  "evidence_sha256",
  "snapshot_sha256",
  "record_sha256",
  "receipt_sha256",
  "key_version",
  "iv_base64url",
  "auth_tag_base64url",
  "ciphertext_base64url",
  "aad_sha256",
  "record_hmac_sha256",
] as const;

describe("Consumer Flight Preview reprice projection repair", () => {
  it("is a relocked forward-only repair with exact 085 dependencies", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_086_dependencies$",
    );
    const precondition = taggedBlock(
      migration,
      "$flight_consumer_preview_086_relocked_precondition$",
    );
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_086_postcondition$",
    );

    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(dependencies).toContain("requires migrations 068 through 085");
    expect(dependencies).toContain("requires migration 085");
    expect(dependencies).toContain("{16,8176}");
    expect(precondition).toContain("migration 086 requires relock before repair");
    expect(postcondition).toContain("migration 086 changed the locked runtime posture");
    for (const capability of disabledCapabilities) {
      expect(precondition).toContain(`and not control.${capability}`);
      expect(postcondition).toContain(`and not control.${capability}`);
    }

    expect(rollback).toContain("Migration 086 is forward-only");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).not.toContain("create or replace function");
    expect(rollback).not.toMatch(
      /^\s*(?:alter|drop|grant|revoke|update|insert|delete)\b/im,
    );
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });

  it("repairs the ambiguity and retires the terminal non-retryable offer", () => {
    const oldFunction = functionDefinition(
      predecessor,
      "public.fail_flight_consumer_reprice_v1",
      "$fail_flight_consumer_reprice$",
    );
    const repaired = functionDefinition(
      migration,
      "public.fail_flight_consumer_reprice_v1",
      "$fail_flight_consumer_reprice_086$",
    );
    const expected = oldFunction
      .replace("create function", "create or replace function")
      .replaceAll(
        "$fail_flight_consumer_reprice$",
        "$fail_flight_consumer_reprice_086$",
      )
      .replace(
        "$fail_flight_consumer_reprice_086$\ndeclare",
        "$fail_flight_consumer_reprice_086$\n#variable_conflict error\ndeclare",
      )
      .replace(
        "from public.flight_reprice_receipts\n       where offer_id = v_attempt.offer_id",
        "from public.flight_reprice_receipts as reprice\n       where reprice.offer_id = v_attempt.offer_id",
      )
      .replace(
        "  return query select v_attempt.offer_id, v_attempt.state, v_idempotency.status;",
        "  -- A consumer offer has exactly one retrieve_offer attempt. Once that attempt\n  -- is terminal without a materialized receipt, the offer cannot be retried\n  -- safely and must no longer be presented as actionable.\n  update public.flight_offers as offer\n     set status = 'expired'\n   where offer.id = v_attempt.offer_id and offer.status = 'offered';\n  return query select v_attempt.offer_id, v_attempt.state, v_idempotency.status;",
      );

    expect(repaired).toBe(expected);
    expect(repaired).toContain("#variable_conflict error");
    expect(repaired).toContain("from public.flight_reprice_receipts as reprice");
    expect(repaired).toContain("where reprice.offer_id = v_attempt.offer_id");
    expect(repaired).not.toMatch(/where\s+offer_id\s*=\s*v_attempt\.offer_id/);
    expect(repaired).toContain("update public.flight_offers as offer");
    expect(repaired).toContain(
      "where offer.id = v_attempt.offer_id and offer.status = 'offered'",
    );
  });

  it("preserves service-role-only execution and mirrors the installed function", () => {
    expect(migration).toContain(
      "revoke all on function public.fail_flight_consumer_reprice_v1(uuid, integer)",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain(
      "grant execute on function public.fail_flight_consumer_reprice_v1(uuid, integer)",
    );
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/grant\s+execute[\s\S]*to\s+(?:anon|authenticated)/i);

    const installed = functionDefinition(
      migration,
      "public.fail_flight_consumer_reprice_v1",
      "$fail_flight_consumer_reprice_086$",
    );
    const mirrored = functionDefinition(
      schema,
      "public.fail_flight_consumer_reprice_v1",
      "$fail_flight_consumer_reprice_086$",
    );
    expect(mirrored).toBe(installed);
  });

  it("sends exactly the 15-field refreshed evidence contract", () => {
    const parameters = {
      p_customer_id: "11111111-1111-4111-8111-111111111111",
      p_search_id: "22222222-2222-4222-8222-222222222222",
      p_offer_id: "33333333-3333-4333-8333-333333333333",
      p_execution_scope_sha256: "a".repeat(64),
      p_stage: "refreshed",
      p_predecessor_receipt_sha256: "b".repeat(64),
      p_observed_at: "2026-08-26T00:00:00.000Z",
      p_retention_expires_at: "2026-08-26T01:00:00.000Z",
      p_raw_body_sha256: "c".repeat(64),
      p_evidence_sha256: "d".repeat(64),
      p_snapshot_sha256: "e".repeat(64),
      p_record_sha256: "f".repeat(64),
      p_receipt_sha256: "1".repeat(64),
      p_key_version: "preview-v1",
      p_iv_base64url: "A".repeat(16),
      p_auth_tag_base64url: "B".repeat(22),
      p_ciphertext_base64url: "C".repeat(32),
      p_aad_sha256: "2".repeat(64),
      p_record_hmac_sha256: "3".repeat(64),
    } satisfies FlightOfferEvidenceStoreRpcParameters;
    const envelope = normalizedStagedFlightOfferEvidence(parameters);

    expect(Object.keys(envelope)).toEqual(evidenceKeys);
    expect(envelope).not.toHaveProperty("local_offer_id");
    expect(workflow).toContain(
      "p_refreshed_evidence: normalizedStagedFlightOfferEvidence(\n        staged.takePreparedEvidence(),\n      )",
    );
    expect(workflow).not.toContain("local_offer_id: context.local_offer_id");
  });

  it("classifies refusal diagnostics without returning database messages", () => {
    expect(safeFlightConsumerPreviewRepriceDiagnostic({
      code: "P0001",
      message: "Refreshed encrypted offer evidence is malformed",
    })).toEqual({ code: "P0001", category: "refreshed_evidence_invalid" });
    expect(safeFlightConsumerPreviewRepriceDiagnostic({
      code: "42702",
      message: 'column reference "offer_id" is ambiguous',
    })).toEqual({ code: "42702", category: "sql_identifier_ambiguous" });
    expect(safeFlightConsumerPreviewRepriceDiagnostic({
      code: "23514",
      message: 'violates constraint "flight_offer_evidence_vault_stage_check"',
    })).toEqual({
      code: "23514",
      category: "constraint:flight_offer_evidence_vault_stage_check",
    });
    expect(safeFlightConsumerPreviewRepriceDiagnostic({
      code: "not-safe",
      message: "contains private database detail",
    })).toEqual({ code: "unknown", category: "unclassified" });
  });
});
