import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260127_flight_consumer_order_ambiguity_semantics_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260127_flight_consumer_order_ambiguity_semantics_repair.rollback.sql",
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

describe("Consumer Flight Preview order-ambiguity semantics repair", () => {
  it("requires migration 087 and a fully relocked runtime posture", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_088_dependencies$",
    );
    const precondition = taggedBlock(
      migration,
      "$flight_consumer_preview_088_relocked_precondition$",
    );
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_088_postcondition$",
    );

    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(dependencies).toContain("requires migrations 068 through 087");
    expect(dependencies).toContain(
      "public.apply_flight_consumer_capture_v1(uuid,integer,uuid,text)",
    );
    expect(dependencies).toContain("#variable_conflict error");
    expect(dependencies).toContain(
      "where payment.id = p_payment_id and payment.order_id = v_order.id",
    );
    expect(precondition).toContain("migration 088 requires relock before repair");
    expect(postcondition).toContain("migration 088 changed the locked runtime posture");
    for (const capability of disabledCapabilities) {
      expect(precondition).toContain(`and not control.${capability}`);
      expect(postcondition).toContain(`and not control.${capability}`);
    }
  });

  it("is the exact migration-075 function with only the reviewed semantics repaired", () => {
    const oldFunction = functionDefinition(
      predecessor,
      "public.mark_flight_consumer_order_ambiguous_v1",
      "$mark_flight_consumer_order_ambiguous$",
    );
    const repaired = functionDefinition(
      migration,
      "public.mark_flight_consumer_order_ambiguous_v1",
      "$mark_flight_consumer_order_ambiguous_088$",
    );
    const expected = oldFunction
      .replace("create function", "create or replace function")
      .replaceAll(
        "$mark_flight_consumer_order_ambiguous$",
        "$mark_flight_consumer_order_ambiguous_088$",
      )
      .replace(
        "$mark_flight_consumer_order_ambiguous_088$\ndeclare",
        "$mark_flight_consumer_order_ambiguous_088$\n#variable_conflict error\ndeclare",
      )
      .replace(
        "    or v_order.status <> 'order_creating'",
        "    or v_order.status not in ('order_creating', 'requires_review')",
      )
      .replace(
        "  v_target_status := case when v_attempt.state in ('prepared', 'blocked')",
        "  v_target_status := case when v_attempt.state in ('prepared', 'failed', 'blocked')",
      );

    expect(repaired).toBe(expected);
  });

  it("makes exact reviewed replay reachable and maps definitive failure to failed", () => {
    const repaired = functionDefinition(
      migration,
      "public.mark_flight_consumer_order_ambiguous_v1",
      "$mark_flight_consumer_order_ambiguous_088$",
    );

    expect(repaired).toContain("#variable_conflict error");
    expect(repaired).toContain(
      "or v_order.status not in ('order_creating', 'requires_review')",
    );
    expect(repaired).toContain("if v_order.status = 'requires_review' then");
    expect(repaired).not.toContain("or v_order.status <> 'order_creating'");
    expect(repaired).toContain(
      "v_attempt.state in ('prepared', 'failed', 'blocked')",
    );
    expect(repaired).not.toContain("v_attempt.state in ('prepared', 'blocked')");
    expect(repaired).toContain("then 'failed' else 'order_creating' end");
  });

  it("preserves service-role-only execution and exactly mirrors schema.sql", () => {
    expect(migration).toContain(
      "revoke all on function public.mark_flight_consumer_order_ambiguous_v1(",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain(
      "grant execute on function public.mark_flight_consumer_order_ambiguous_v1(",
    );
    expect(migration).toContain(") to service_role;");
    expect(migration).not.toMatch(/\)\s+to\s+(?:anon|authenticated)\s*;/i);

    const installed = functionDefinition(
      migration,
      "public.mark_flight_consumer_order_ambiguous_v1",
      "$mark_flight_consumer_order_ambiguous_088$",
    );
    const mirrored = functionDefinition(
      schema,
      "public.mark_flight_consumer_order_ambiguous_v1",
      "$mark_flight_consumer_order_ambiguous_088$",
    );
    expect(mirrored).toBe(installed);

    const marker =
      "-- Mirrored from migrations/202608260127_flight_consumer_order_ambiguity_semantics_repair.sql.";
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });

  it("uses an evidence-preserving forward-only rollback", () => {
    expect(rollback).toContain("Migration 088 is forward-only");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).not.toContain("create or replace function");
    expect(rollback).not.toMatch(
      /^\s*(?:alter|drop|grant|revoke|update|insert|delete)\b/im,
    );
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
