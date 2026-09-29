import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260124_flight_consumer_ciphertext_validation_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260124_flight_consumer_ciphertext_validation_repair.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const predecessor077 = readFileSync(
  new URL(
    "../supabase/migrations/202608250077_flight_consumer_preview_async_finalization.sql",
    import.meta.url,
  ),
  "utf8",
);

function taggedBlock(source: string, dollarTag: string) {
  const start = source.indexOf(`do ${dollarTag}`);
  const end = source.indexOf(`${dollarTag};`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + dollarTag.length + 1);
}

function functionDefinition(source: string, name: string, dollarTag: string) {
  const replaceStart = source.indexOf(`create or replace function ${name}(`);
  const createStart = source.indexOf(`create function ${name}(`);
  const definitionStart = replaceStart >= 0 ? replaceStart : createStart;
  const end = source.indexOf(`${dollarTag};`, definitionStart);
  expect(definitionStart).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(definitionStart);
  return source.slice(definitionStart, end + dollarTag.length + 1);
}

function normalizeFunction(source: string) {
  return source
    .replace("create or replace function", "create function")
    .replace(/\$[a-z0-9_]+\$/gi, "$function$")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceExactly(source: string, from: string, to: string) {
  expect(source.split(from)).toHaveLength(2);
  return source.replace(from, () => to);
}

function constraintRepairBlock(table: string, constraint: string) {
  const startNeedle = `alter table public.${table}\n  add constraint ${constraint}`;
  const start = migration.indexOf(startNeedle);
  const endNeedle = `${constraint};`;
  const end = migration.indexOf(endNeedle, start + startNeedle.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + endNeedle.length);
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

const qualified083ConstraintTokens = [
  "bound_provider_settlement_processor_code is not null",
  "execution_kill_switch_engaged",
  "not synthetic_execution_enabled",
  "not provider_sandbox_traffic_enabled",
  "not provider_live_traffic_enabled",
  "not shopping_enabled",
  "not order_enabled",
  "not payment_enabled",
  "not ticketing_enabled",
  "not servicing_enabled",
  "not provider_events_enabled",
  "not production_release_enabled",
] as const;

const repairedConstraints = [
  {
    table: "flight_offers",
    column: "provider_offer_ref_ciphertext",
    maximum: 8176,
    name: "flight_offers_provider_offer_ref_ciphertext_check",
  },
  {
    table: "flight_orders",
    column: "provider_order_ref_ciphertext",
    maximum: 8176,
    name: "flight_orders_provider_order_ref_ciphertext_check",
  },
  {
    table: "flight_passenger_refs",
    column: "provider_passenger_ref_ciphertext",
    maximum: 4080,
    name: "flight_passenger_refs_provider_ref_ciphertext_check",
  },
  {
    table: "flight_ticket_documents",
    column: "document_ref_ciphertext",
    maximum: 4080,
    name: "flight_ticket_documents_document_ref_ciphertext_check",
  },
  {
    table: "flight_payments",
    column: "processor_reference_ciphertext",
    maximum: 4080,
    name: "flight_payments_processor_reference_ciphertext_check",
  },
  {
    table: "flight_service_requests",
    column: "provider_case_ref_ciphertext",
    maximum: 4080,
    name: "flight_service_requests_provider_case_ref_ciphertext_check",
  },
  {
    table: "flight_payment_operation_attempts",
    column: "processor_object_ref_ciphertext",
    maximum: 4080,
    name: "flight_payment_operation_attempts_processor_ref_check",
  },
  {
    table: "flight_payment_refund_evidence",
    column: "refund_reference_ciphertext",
    maximum: 4080,
    name: "flight_payment_refund_evidence_reference_check",
  },
] as const;

describe("Consumer Flight Preview ciphertext validation repair migration", () => {
  it("is a relocked forward-only repair with exact 083 and 084 dependencies", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_085_dependencies$",
    );
    const precondition = taggedBlock(
      migration,
      "$flight_consumer_preview_085_relocked_precondition$",
    );
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_085_postcondition$",
    );

    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(dependencies).toContain("requires migrations 068 through 084");
    expect(dependencies).toContain(
      "lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))",
    );
    expect(dependencies).toContain("constraint_record.convalidated");
    expect(dependencies).toContain("requires validated migration 083");
    for (const token of qualified083ConstraintTokens) {
      expect(dependencies).toContain(`'${token}'`);
    }
    expect(dependencies).toContain("Flight local offer identity is malformed");
    expect(dependencies).toContain("public.flight_offers as offer");
    expect(dependencies).toContain("where offer.search_id = v_search.id");
    expect(dependencies).toContain("#variable_conflict error");
    expect(precondition).toContain("migration 085 requires relock before repair");
    expect(postcondition).toContain("migration 085 changed the locked runtime posture");
    for (const capability of disabledCapabilities) {
      expect(precondition).toContain(`and not control.${capability}`);
      expect(postcondition).toContain(`and not control.${capability}`);
    }

    expect(rollback).toContain("Migration 085 is forward-only");
    expect(rollback).toContain("SQLSTATE 2201B");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).not.toContain("create or replace function");
    expect(rollback).not.toMatch(
      /^\s*(?:alter|drop|grant|revoke|update|insert|delete)\b/im,
    );
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });

  it("replaces and validates exactly all eight incompatible ciphertext checks", () => {
    const dropBlock = taggedBlock(
      migration,
      "$flight_consumer_preview_085_drop_legacy_constraints$",
    );
    expect(dropBlock).toContain("v_legacy_count <> 1");
    expect(dropBlock).toContain("pg_catalog.pg_get_constraintdef");
    expect(dropBlock).toContain("alter table public.%I drop constraint %I");
    expect(migration.match(/\n\s+add constraint flight_[a-z0-9_]+/g)).toHaveLength(8);
    expect(migration.match(/\n\s+flight_[a-z0-9_]+;\n/g)).toHaveLength(8);

    for (const repair of repairedConstraints) {
      const block = constraintRepairBlock(repair.table, repair.name);
      expect(block).toContain(`${repair.column} is not null`);
      expect(block).toContain("^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$");
      expect(block).toContain(`split_part(${repair.column}, ':', 3)`);
      expect(block).toContain(`between 16 and ${repair.maximum}`);
      expect(block).toContain(") not valid;");
      expect(block).toContain(
        `alter table public.${repair.table} validate constraint`,
      );
      expect(block).not.toContain("{16,8176}");
      expect(block).not.toContain("{16,4080}");
    }
  });

  it("allows a same-name legacy constraint but rejects a separate target collision", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_085_dependencies$",
    );
    expect(dependencies).toContain("v_legacy_oid oid;");
    expect(dependencies).toContain(
      "constraint_record.oid order by constraint_record.oid",
    );
    expect(dependencies).toContain(
      "constraint_record.oid is distinct from v_legacy_oid",
    );
    expect(dependencies).toContain(
      "('flight_payments', 'processor_reference_ciphertext', '{16,4080}',",
    );
    expect(dependencies).toContain(
      "'flight_payments_processor_reference_ciphertext_check')",
    );

    const targetName = "flight_payments_processor_reference_ciphertext_check";
    const conflictingTargets = (
      constraints: ReadonlyArray<{ oid: number; name: string }>,
      legacyOid: number,
    ) =>
      constraints.filter(
        (constraint) =>
          constraint.name === targetName && constraint.oid !== legacyOid,
      ).length;
    expect(conflictingTargets([{ oid: 41, name: targetName }], 41)).toBe(0);
    expect(
      conflictingTargets(
        [
          { oid: 41, name: targetName },
          { oid: 42, name: targetName },
        ],
        41,
      ),
    ).toBe(1);
  });

  it("proves accepted and rejected suffix boundaries with the installed predicate", () => {
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_085_postcondition$",
    );
    for (const [name, length] of [
      ["v_valid_256", 256],
      ["v_valid_4080", 4080],
      ["v_valid_8176", 8176],
      ["v_invalid_15", 15],
      ["v_invalid_4081", 4081],
      ["v_invalid_8177", 8177],
    ] as const) {
      expect(postcondition).toContain(
        `${name} text := 'enc:v1:' || repeat('A', ${length});`,
      );
      expect(postcondition).toContain(
        `${name} ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'`,
      );
      expect(postcondition).toContain(`split_part(${name}, ':', 3)`);
    }
    expect(postcondition).toContain(
      "v_malformed_16 text := 'enc:v1:' || repeat('A', 15) || '!';",
    );
    expect(postcondition).toContain(
      "Flight Consumer Preview migration 085 ciphertext boundary proof failed",
    );

    const accepts = (suffix: string, maximum: number) => {
      const ciphertext = `enc:v1:${suffix}`;
      return (
        /^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$/.test(ciphertext) &&
        ciphertext.split(":")[2]!.length >= 16 &&
        ciphertext.split(":")[2]!.length <= maximum
      );
    };
    expect(accepts("A".repeat(256), 4080)).toBe(true);
    expect(accepts("A".repeat(4080), 4080)).toBe(true);
    expect(accepts("A".repeat(8176), 8176)).toBe(true);
    expect(accepts("A".repeat(15), 4080)).toBe(false);
    expect(accepts("A".repeat(4081), 4080)).toBe(false);
    expect(accepts("A".repeat(8177), 8176)).toBe(false);
    expect(accepts(`${"A".repeat(15)}!`, 4080)).toBe(false);
  });

  it("copies only the two affected 077 functions and changes only four predicates", () => {
    const definitions = [
      {
        name: "public.validate_flight_consumer_async_order_finalization_v1",
        oldTag: "$validate_flight_consumer_async_order_finalization$",
        newTag: "$validate_flight_consumer_async_order_finalization_085$",
      },
      {
        name: "public.finalize_flight_consumer_async_duffel_order_v1",
        oldTag: "$finalize_flight_consumer_async_duffel_order$",
        newTag: "$finalize_flight_consumer_async_duffel_order_085$",
      },
    ] as const;
    expect(migration.match(/create or replace function/g)).toHaveLength(2);

    let expectedValidator = normalizeFunction(
      functionDefinition(
        predecessor077,
        definitions[0].name,
        definitions[0].oldTag,
      ),
    );
    expectedValidator = replaceExactly(
      expectedValidator,
      "or new.provider_order_ref_ciphertext !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'",
      "or ( new.provider_order_ref_ciphertext !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$' or char_length(split_part(new.provider_order_ref_ciphertext, ':', 3)) not between 16 and 8176 )",
    );
    expect(
      normalizeFunction(
        functionDefinition(migration, definitions[0].name, definitions[0].newTag),
      ),
    ).toBe(expectedValidator);

    let expectedFinalizer = normalizeFunction(
      functionDefinition(
        predecessor077,
        definitions[1].name,
        definitions[1].oldTag,
      ),
    );
    expectedFinalizer = replaceExactly(
      expectedFinalizer,
      "or p_provider_order_ref_ciphertext !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'",
      "or ( p_provider_order_ref_ciphertext !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$' or char_length(split_part(p_provider_order_ref_ciphertext, ':', 3)) not between 16 and 8176 )",
    );
    expectedFinalizer = replaceExactly(
      expectedFinalizer,
      "or coalesce(v_binding ->> 'provider_passenger_ref_ciphertext', '') !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'",
      "or ( coalesce(v_binding ->> 'provider_passenger_ref_ciphertext', '') !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$' or char_length(split_part(coalesce( v_binding ->> 'provider_passenger_ref_ciphertext', '' ), ':', 3)) not between 16 and 4080 )",
    );
    expectedFinalizer = replaceExactly(
      expectedFinalizer,
      "or coalesce(v_document ->> 'document_ref_ciphertext', '') !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'",
      "or ( coalesce(v_document ->> 'document_ref_ciphertext', '') !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$' or char_length(split_part(coalesce( v_document ->> 'document_ref_ciphertext', '' ), ':', 3)) not between 16 and 4080 )",
    );
    const installedFinalizer = normalizeFunction(
      functionDefinition(migration, definitions[1].name, definitions[1].newTag),
    );
    expect(installedFinalizer).toBe(expectedFinalizer);
    expect(installedFinalizer).not.toContain("{16,8176}");
    expect(installedFinalizer).not.toContain("{16,4080}");
  });

  it("reasserts the affected grants and attests migration-084 authority", () => {
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_085_postcondition$",
    );
    expect(migration).toContain(
      "revoke all on function public.validate_flight_consumer_async_order_finalization_v1()",
    );
    expect(migration).toContain(
      "revoke all on function public.finalize_flight_consumer_async_duffel_order_v1(",
    );
    expect(migration).toContain(
      "grant execute on function public.finalize_flight_consumer_async_duffel_order_v1(",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("to service_role;");
    expect(postcondition).toContain(
      "array['search_path=pg_catalog, public, extensions']::text[]",
    );
    expect(postcondition).toContain("migration 085 function grants are unsafe");
    expect(postcondition).toContain("Flight local offer identity is malformed");
    expect(postcondition).toContain("public.flight_offers as offer");
    expect(postcondition).toContain("migration 085 changed migration 084 search authority");
    expect(postcondition).toContain("migration 085 changed migration 084 repository grants");
    expect(migration).not.toContain(
      "create or replace function public.complete_flight_consumer_search_v1",
    );
    expect(migration).not.toContain(
      "create or replace function public.fail_flight_consumer_search_v1",
    );
  });
});
