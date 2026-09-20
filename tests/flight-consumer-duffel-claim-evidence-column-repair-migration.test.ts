import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const foundation074 = readFileSync(
  new URL(
    "../supabase/migrations/202608250074_flight_consumer_preview_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const hardening089 = readFileSync(
  new URL(
    "../supabase/migrations/202608260128_flight_consumer_order_recovery_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const safety092 = readFileSync(
  new URL(
    "../supabase/migrations/202608260131_flight_consumer_terminal_recovery_safety.sql",
    import.meta.url,
  ),
  "utf8",
);
const repair095 = readFileSync(
  new URL(
    "../supabase/migrations/202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback095 = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260134_flight_consumer_duffel_claim_evidence_column_repair.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const schemaMarker =
  "-- Mirrored from migrations/202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql.";
const nextSchemaMarker =
  "-- Mirrored from migrations/202608260135_flight_consumer_completion_lease_recovery.sql.";

const publicClaim = "claim_flight_consumer_duffel_order_attempt_v1";
const privateClaim = "claim_flight_consumer_duffel_order_attempt_pre092_v1";
const invalidPredicate = "and evidence.deleted_at is null for share;";
const predecessorSha256 =
  "5689a862cbc518ffe3df2c343b103954e624755fe08e73983bcf775f388d1852";
const repairedSha256 =
  "0ab4de525bb7a4f53cf307a837701da434f052573233cae8b57f00b68f8c75c3";
const wrapperSha256 =
  "ca1bda0019b1f4302fdb1ddadb762d12909a153afd67f28375a204bd35532561";
const migration094CompletionSha256 =
  "88c882ace38574d0e82f06aabbda85f4eda2502c91afcf9eab6e1d4dd9983b64";

function functionBody(source: string, name: string) {
  const match = new RegExp(
    `create(?: or replace)? function public\\.${name}\\(`,
    "i",
  ).exec(source);
  expect(match).not.toBeNull();
  const start = match!.index;
  const tail = source.slice(start);
  const tagMatch = tail.match(/\bas\s+(\$[A-Za-z0-9_]+\$)/);
  expect(tagMatch).not.toBeNull();
  const tag = tagMatch![1]!;
  const openingTag = start + tagMatch!.index! + tagMatch![0].lastIndexOf(tag);
  const bodyStart = openingTag + tag.length;
  const bodyEnd = source.indexOf(tag, bodyStart);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

function tableDefinition(source: string, name: string) {
  const start = source.indexOf(`create table public.${name} (`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n);", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 3);
}

function normalizeNewlines(source: string) {
  return source.replace(/\r\n/g, "\n");
}

function sha256(source: string) {
  return createHash("sha256")
    .update(normalizeNewlines(source), "utf8")
    .digest("hex");
}

function occurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe("Flight Consumer Preview Duffel claim evidence-column repair", () => {
  const predecessor = functionBody(hardening089, publicClaim);
  const repaired = predecessor.replace(invalidPredicate, "for share;");
  const wrapper = functionBody(safety092, publicClaim);

  it("is mirrored byte-for-byte in canonical schema order", () => {
    const markerIndex = schema.lastIndexOf(schemaMarker);
    const nextMarkerIndex = schema.indexOf(nextSchemaMarker, markerIndex + schemaMarker.length);
    expect(markerIndex).toBeGreaterThan(0);
    expect(nextMarkerIndex).toBeGreaterThan(markerIndex);
    const bodyStart = markerIndex + schemaMarker.length + 1;
    expect(schema.slice(bodyStart, bodyStart + repair095.length)).toBe(repair095);
    expect(schema.slice(bodyStart + repair095.length, nextMarkerIndex)).toBe("\n");
  });

  it("proves the vault has no tombstone column and derives one exact source-only repair", () => {
    const vault = tableDefinition(foundation074, "flight_offer_evidence_vault");
    expect(vault).toContain("retention_expires_at timestamptz not null");
    expect(vault).not.toContain("deleted_at");

    expect(occurrences(predecessor, invalidPredicate)).toBe(1);
    expect(occurrences(repaired, invalidPredicate)).toBe(0);
    expect(repaired).toBe(predecessor.replace(invalidPredicate, "for share;"));
    expect(repaired).toContain("evidence.retention_expires_at > v_now");
    expect(repaired).toContain("evidence.reprice_receipt_id = v_order.reprice_receipt_id");
    expect(repaired).toContain("evidence.stage = 'refreshed'");
    expect(repaired).toContain("for share;");

    expect(sha256(predecessor)).toBe(predecessorSha256);
    expect(sha256(repaired)).toBe(repairedSha256);
    expect(sha256(wrapper)).toBe(wrapperSha256);
    expect(occurrences(repair095, predecessorSha256)).toBe(1);
    expect(occurrences(repair095, repairedSha256)).toBe(2);
    expect(occurrences(repair095, wrapperSha256)).toBe(2);
    expect(occurrences(repair095, migration094CompletionSha256)).toBe(1);
  });

  it("hash-guards the retained 089 body and leaves the 092 wrapper intact", () => {
    expect(repair095).toContain("v_definition := pg_get_functiondef(v_oid)");
    expect(repair095).toContain(
      `'${invalidPredicate}',\n    'for share;'`,
    );
    expect(repair095).toContain(
      "v_invalid_predicate_count <> 1",
    );
    expect(repair095).toContain(
      `'public.${privateClaim}(uuid,integer,text,text,text,text,text)'`,
    );
    expect(repair095).toContain(
      `'public.${publicClaim}(uuid,integer,text,text,text,text,text)'`,
    );
    expect(wrapper).toContain(privateClaim);
    expect(wrapper).toContain("Active Flight reconciliation blocks Duffel dispatch");
    expect(wrapper).toContain("reconciliation.status <> 'resolved'");
    expect(repair095).not.toMatch(/^\s*(?:alter|drop|truncate|update|insert|delete)\b/im);
    expect(occurrences(repair095, "execute v_definition;")).toBe(1);
  });

  it("requires and preserves the exact relocked posture", () => {
    const relockPredicates = [
      "control.execution_kill_switch_engaged",
      "not control.synthetic_execution_enabled",
      "not control.provider_sandbox_traffic_enabled",
      "not control.provider_live_traffic_enabled",
      "not control.shopping_enabled",
      "not control.order_enabled",
      "not control.payment_enabled",
      "not control.ticketing_enabled",
      "not control.servicing_enabled",
      "not control.provider_events_enabled",
      "not control.production_release_enabled",
    ];
    for (const predicate of relockPredicates) {
      expect(occurrences(repair095, predicate)).toBe(2);
    }
    expect(repair095).toContain("migration 095 requires relock before repair");
    expect(repair095).toContain("v_safe_count <> 1");
  });

  it("retains security-definer search paths and least-privilege execution", () => {
    const privateSqlSignature = `public.${privateClaim}(\n  uuid, integer, text, text, text, text, text\n)`;
    const publicSqlSignature = `public.${publicClaim}(\n  uuid, integer, text, text, text, text, text\n)`;
    expect(repair095).toContain(
      `revoke all on function ${privateSqlSignature} from public, anon, authenticated, service_role;`,
    );
    expect(repair095).toContain(
      `revoke all on function ${publicSqlSignature} from public, anon, authenticated, service_role;`,
    );
    expect(repair095).toContain(
      `grant execute on function ${publicSqlSignature} to service_role;`,
    );
    expect(repair095).not.toContain(
      `grant execute on function ${privateSqlSignature}`,
    );
    expect(repair095).toContain("not v_private_security_definer");
    expect(repair095).toContain("not v_public_security_definer");
    expect(occurrences(
      repair095,
      "search_path=pg_catalog, public, extensions",
    )).toBe(2);
    expect(repair095).toContain(
      "has_function_privilege(\n      'service_role',\n      'public.claim_flight_consumer_duffel_order_attempt_pre092_v1",
    );
    expect(repair095).toContain(
      "not has_function_privilege(\n      'service_role',\n      'public.claim_flight_consumer_duffel_order_attempt_v1",
    );
  });

  it("uses a non-mutating forward-only rollback", () => {
    expect(rollback095).toMatch(/forward-only/i);
    expect(rollback095).toMatch(/cannot be rolled back safely/i);
    expect(rollback095).toMatch(/nonexistent offer-evidence tombstone column/i);
    expect(rollback095).toMatch(/restore from a reviewed backup/i);
    expect(rollback095).toMatch(/raise exception/i);
    expect(rollback095).not.toMatch(
      /^\s*(?:alter|create|drop|grant|revoke|truncate|update|insert|delete)\b/im,
    );
    expect(rollback095.trim().toLowerCase().endsWith("rollback;")).toBe(true);
  });
});
