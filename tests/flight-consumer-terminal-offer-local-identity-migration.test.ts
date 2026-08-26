import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608260137_flight_consumer_terminal_offer_local_identity.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollbacks/202608260137_flight_consumer_terminal_offer_local_identity.rollback.sql",
  "utf8",
);
const schema = readFileSync("supabase/schema.sql", "utf8");

const loaderSignature =
  "public.load_flight_offer_evidence_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)";
const identitySignature =
  "public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)";
const loaderHash =
  "d1165286160c3ae5694950bbebfac75adcbab6a708f5e2343dba4d752e7b8172";
const identityHash =
  "5eaf485cadb185b01c861ec1573479dd838bb86738c3610e817a1e77c01cf5dd";

function normalizeNewlines(source: string) {
  return source.replace(/\r\n/g, "\n");
}

function taggedBlock(source: string, tag: string) {
  const normalized = normalizeNewlines(source);
  const start = normalized.indexOf(tag);
  const end = normalized.indexOf(`${tag};`, start + tag.length);
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

function sha256(source: string) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

describe("Flight Consumer Preview terminal offer local-identity migration", () => {
  it("is a relocked forward-only extension pinned to migration 097", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_098_dependencies$",
    );
    const precondition = taggedBlock(
      migration,
      "$flight_consumer_preview_098_relocked_precondition$",
    );
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_098_postcondition$",
    );

    expect(migration).not.toMatch(/^\+/m);
    expect(
      normalizeNewlines(schema).slice(
        normalizeNewlines(schema).lastIndexOf(
          "-- Forward-only identity projection for terminal offer-evidence recovery.",
        ),
      ),
    ).not.toMatch(/^\+/m);
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(dependencies).toContain("requires migrations 068 through 097");
    expect(dependencies).toContain(loaderSignature);
    expect(dependencies).toContain(loaderHash);
    expect(dependencies).toContain("pg_get_function_result");
    expect(dependencies).toContain("v_loader_security_definer");
    expect(dependencies).toContain(
      "v_loader_config is distinct from\n" +
        "      array['search_path=pg_catalog, public, extensions']::text[]",
    );
    expect(dependencies).toContain("v_loader_overload_count <> 1");
    expect(dependencies).toContain("v_identity_overload_count <> 0");
    expect(dependencies).toContain(
      "routine.proname =\n" +
        "       'load_flight_offer_evidence_for_terminal_recovery_v1'",
    );
    expect(dependencies).toContain(
      "routine.proname =\n" +
        "       'get_flight_offer_local_identity_for_terminal_recovery_v1'",
    );
    expect(dependencies).toContain(
      "v_loader_owner is distinct from v_postgres_role",
    );
    expect(dependencies).toContain(
      "v_loader_language is distinct from v_plpgsql_language",
    );
    expect(dependencies).toContain("v_loader_kind is distinct from 'f'");
    expect(dependencies).toContain("from aclexplode(v_loader_acl)");
    expect(dependencies).toContain("privilege.grantee = 0");
    expect(dependencies).toContain("privilege.privilege_type = 'EXECUTE'");
    expect(dependencies).toContain(
      "privilege.grantee not in (v_loader_owner, v_service_role)",
    );
    expect(dependencies).toContain(
      "privilege.grantor <> v_loader_owner",
    );
    expect(dependencies).toContain(
      "privilege.grantee = v_service_role\n" +
        "            and privilege.is_grantable",
    );
    expect(dependencies).toContain(
      "privilege.grantee = v_service_role\n" +
        "         and privilege.grantor = v_loader_owner",
    );
    expect(dependencies).toContain(
      "v_vault_owner is distinct from v_postgres_role",
    );
    expect(dependencies).toContain("v_vault_kind is distinct from 'r'");
    expect(dependencies).toContain("not coalesce(v_vault_rls, false)");
    expect(dependencies).toContain("not coalesce(v_vault_force_rls, false)");
    expect(dependencies).toContain("attribute.attacl");
    expect(dependencies).toContain(
      "privilege.grantee <> v_vault_owner\n" +
        "          or privilege.grantor <> v_vault_owner",
    );
    expect(dependencies).toContain(
      "'service_role', 'public.flight_offer_evidence_vault', 'SELECT'",
    );

    for (const block of [precondition, postcondition]) {
      for (const capability of [
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
      ]) {
        expect(block).toContain(`and not control.${capability}`);
      }
      expect(block).toContain("control.execution_kill_switch_engaged");
      expect(block).toContain("v_safe_count <> 1");
    }
    expect(precondition).toContain("migration 098 requires relock before repair");
  });

  it("normalizes null and zero-dimensional ACL arrays before catalog expansion", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_098_dependencies$",
    );
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_098_postcondition$",
    );

    for (const block of [dependencies, postcondition]) {
      expect(block).toContain(
        "when coalesce(cardinality(v_loader_acl), 0) = 0\n" +
          "      then acldefault('f', v_loader_owner)",
      );
      expect(block).toContain(
        "when coalesce(cardinality(v_vault_acl), 0) = 0\n" +
          "      then acldefault('r', v_vault_owner)",
      );
      expect(block).toContain(
        "when coalesce(cardinality(attribute.attacl), 0) = 0\n" +
          "              then acldefault('r', v_vault_owner)",
      );
    }
    expect(postcondition).toContain(
      "when coalesce(cardinality(v_identity_acl), 0) = 0\n" +
        "      then acldefault('f', v_identity_owner)",
    );
    expect(migration).not.toContain("'{}'::aclitem[]");
    expect(migration).not.toMatch(/aclexplode\(\s*coalesce\(/);
    expect(migration.match(/aclexplode\(v_loader_acl\)/g)).toHaveLength(6);
    expect(migration.match(/aclexplode\(v_identity_acl\)/g)).toHaveLength(3);
    expect(migration.match(/aclexplode\(v_vault_acl\)/g)).toHaveLength(2);
    expect(
      migration.match(
        /cross join lateral aclexplode\(\s*case\s*when coalesce\(cardinality\(attribute\.attacl\), 0\) = 0/g,
      ),
    ).toHaveLength(2);
    expect(migration.match(/\baclexplode\(/g)).toHaveLength(13);
  });

  it("returns one durable local identity only after the exact 097 loader proof", () => {
    const body = functionBody(
      migration,
      "$get_flight_offer_local_identity_for_terminal_recovery$",
    );

    expect(sha256(body)).toBe(identityHash);
    expect(migration.match(new RegExp(identityHash, "g"))).toHaveLength(1);
    expect(migration).toContain(
      "create function public.get_flight_offer_local_identity_for_terminal_recovery_v1(\n" +
        "  p_attempt_id uuid,\n" +
        "  p_order_id uuid,\n" +
        "  p_customer_id uuid,\n" +
        "  p_execution_scope_sha256 text,\n" +
        "  p_receipt_sha256 text\n" +
        ")\n" +
        "returns table (local_offer_id text)\n" +
        "language plpgsql\n" +
        "security definer\n" +
        "set search_path = pg_catalog, public, extensions",
    );
    expect(body).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(body).toContain(
      "from public.load_flight_offer_evidence_for_terminal_recovery_v1(",
    );
    for (const argument of [
      "p_attempt_id",
      "p_order_id",
      "p_customer_id",
      "p_execution_scope_sha256",
      "p_receipt_sha256",
    ]) {
      expect(body).toContain(argument);
    }
    expect(body).toContain("v_verified_count <> 1");
    expect(body).toContain("evidence.id = v_evidence_id");
    expect(body).toContain("evidence.offer_id = v_offer_id");
    expect(body).toContain(
      "evidence.receipt_sha256 = v_verified_receipt_sha256",
    );
    expect(body).toContain(
      "v_verified_receipt_sha256 is distinct from p_receipt_sha256",
    );
    expect(body).toContain(
      "v_local_offer_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'",
    );
    expect(body).not.toContain("v_local_offer_id is distinct from v_offer_id::text");
    expect(body).toContain("return query select v_local_offer_id");
    expect(body.match(/return query select/g)).toHaveLength(1);
  });

  it("adds no provider, payment, ciphertext, or mutation authority", () => {
    const body = functionBody(
      migration,
      "$get_flight_offer_local_identity_for_terminal_recovery$",
    );

    expect(migration).toContain("No provider\n-- or payment dispatch authority is added");
    expect(body).not.toMatch(
      /(?:^|\n)\s*(?:insert\s+into|update|delete\s+from|merge\s+into|truncate|perform|call)\b/i,
    );
    expect(body).not.toMatch(
      /(?:claim_flight|complete_flight_consumer_payment|apply_flight_consumer_capture|authorize.*redispatch)/i,
    );
    expect(body).not.toMatch(
      /(?:ciphertext_base64url|provider_order_ref|provider_offer_ref|processor_reference)/,
    );
    expect(migration).toContain(
      "The encrypted evidence, payment\n-- state, provider references, and any dispatch capability remain unexposed",
    );
  });

  it("keeps the new RPC service-role only and direct vault reads revoked", () => {
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_098_postcondition$",
    );
    const formattedSignature =
      "public.get_flight_offer_local_identity_for_terminal_recovery_v1(\n" +
      "  uuid, uuid, uuid, text, text\n" +
      ")";

    expect(migration).toContain(
      `alter function ${formattedSignature} owner to postgres;`,
    );
    expect(migration).toContain(
      `revoke all on function ${formattedSignature} from public, anon, authenticated, service_role;`,
    );
    expect(migration).toContain(
      `grant execute on function ${formattedSignature} to service_role;`,
    );
    expect(postcondition).toContain(identitySignature);
    expect(postcondition).toContain(identityHash);
    expect(postcondition).toContain(
      "pg_get_function_result(to_regprocedure(\n" +
        "      'public.get_flight_offer_local_identity_for_terminal_recovery_v1(uuid,uuid,uuid,text,text)'\n" +
        "    )) is distinct from 'TABLE(local_offer_id text)'",
    );
    for (const role of ["service_role", "authenticated", "anon"]) {
      expect(postcondition).toContain(
        `'${role}', 'public.flight_offer_evidence_vault', 'SELECT'`,
      );
    }
    expect(postcondition).toContain("v_identity_security_definer");
    expect(postcondition).toContain("v_identity_acl");
    expect(postcondition).toContain("v_identity_overload_count <> 1");
    expect(postcondition).toContain(
      "v_identity_owner is distinct from v_postgres_role",
    );
    expect(postcondition).toContain(
      "v_identity_language is distinct from v_plpgsql_language",
    );
    expect(postcondition).toContain("v_identity_kind is distinct from 'f'");
    expect(postcondition).toContain(
      "v_identity_config is distinct from\n" +
        "      array['search_path=pg_catalog, public, extensions']::text[]",
    );
    expect(postcondition).toContain(
      "privilege.grantee not in (v_identity_owner, v_service_role)",
    );
    expect(postcondition).toContain(
      "privilege.grantor <> v_identity_owner",
    );
    expect(postcondition).toContain("privilege.grantee = 0");
  });

  it("keeps the schema mirror byte-exact for the forward-only 098 block", () => {
    const normalizedSchema = normalizeNewlines(schema);
    const marker =
      "-- Forward-only identity projection for terminal offer-evidence recovery.";
    const markerIndex = normalizedSchema.lastIndexOf(marker);
    const blockStart = normalizedSchema.lastIndexOf("begin;\n", markerIndex);

    expect(markerIndex).toBeGreaterThanOrEqual(0);
    expect(blockStart).toBeGreaterThanOrEqual(0);
    expect(normalizedSchema.slice(blockStart)).toBe(normalizeNewlines(migration));
  });

  it("uses a fail-closed forward-only rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback).toMatch(/forward-only/i);
    expect(rollback).toMatch(/cannot be rolled back safely/i);
    expect(rollback).toMatch(/immutable dispatch-time evidence proof/i);
    expect(rollback).toMatch(/restore from a reviewed backup/i);
    expect(rollback).toMatch(/raise exception/i);
    expect(rollback).not.toMatch(
      /^\s*(?:alter|create|drop|grant|revoke|truncate|update|insert|delete)\b/im,
    );
    expect(rollback.trim().toLowerCase().endsWith("rollback;")).toBe(true);
  });
});
