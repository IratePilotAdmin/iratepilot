import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260126_flight_consumer_capture_projection_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260126_flight_consumer_capture_projection_repair.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const predecessor075 = readFileSync(
  new URL(
    "../supabase/migrations/202608250075_flight_consumer_preview_orchestration.sql",
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
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

type FunctionCase = {
  name: string;
  predecessor: string;
  predecessorTag: string;
  repairedTag: string;
};

const functionCases: FunctionCase[] = [
  {
    name: "public.apply_flight_consumer_capture_v1",
    predecessor: predecessor075,
    predecessorTag: "$apply_flight_consumer_capture$",
    repairedTag: "$apply_flight_consumer_capture_087$",
  },
  {
    name: "public.record_flight_consumer_duffel_order_terminal_v1",
    predecessor: predecessor075,
    predecessorTag: "$record_flight_consumer_duffel_order_terminal$",
    repairedTag: "$record_flight_consumer_duffel_order_terminal_087$",
  },
  {
    name: "public.finalize_flight_consumer_duffel_order_v1",
    predecessor: predecessor075,
    predecessorTag: "$finalize_flight_consumer_duffel_order$",
    repairedTag: "$finalize_flight_consumer_duffel_order_087$",
  },
  {
    name: "public.finalize_flight_consumer_async_duffel_order_v1",
    predecessor: predecessor085,
    predecessorTag: "$finalize_flight_consumer_async_duffel_order_085$",
    repairedTag: "$finalize_flight_consumer_async_duffel_order_087$",
  },
  {
    name: "public.apply_flight_consumer_refund_compensation_v1",
    predecessor: predecessor075,
    predecessorTag: "$apply_flight_consumer_refund_compensation$",
    repairedTag: "$apply_flight_consumer_refund_compensation_087$",
  },
];

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

function functionDefinition(
  source: string,
  name: string,
  dollarTag: string,
) {
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

function semanticSkeleton(source: string) {
  let result = source
    .replace("create or replace function", "create function")
    .replace(/^#variable_conflict error$/gm, "")
    .replace(/\$[a-z0-9_]+\$/g, "$function_body$");

  for (const alias of [
    "flight_order",
    "attempt",
    "control",
    "payment",
    "evidence",
    "passenger",
    "document",
    "reconciliation",
  ]) {
    result = result
      .replace(new RegExp(`\\bas\\s+${alias}\\b`, "g"), "")
      .replace(
        new RegExp(`(public\\.[a-z0-9_]+)\\s+${alias}\\b`, "g"),
        "$1",
      )
      .replace(new RegExp(`\\b${alias}\\.`, "g"), "");
  }

  return result
    .replace(/\s+/g, " ")
    .replace(/\s*([(),;])\s*/g, "$1")
    .trim();
}

describe("Consumer Flight Preview capture and terminal projection repair", () => {
  it("is an exact relocked, forward-only repair over migrations 068 through 086", () => {
    const dependencies = taggedBlock(
      migration,
      "$flight_consumer_preview_087_dependencies$",
    );
    const precondition = taggedBlock(
      migration,
      "$flight_consumer_preview_087_relocked_precondition$",
    );
    const postcondition = taggedBlock(
      migration,
      "$flight_consumer_preview_087_postcondition$",
    );

    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(dependencies).toContain("requires migrations 068 through 086");
    expect(dependencies).toContain("where reprice.offer_id = v_attempt.offer_id");
    expect(precondition).toContain("migration 087 requires relock before repair");
    expect(postcondition).toContain("migration 087 changed the locked runtime posture");
    for (const capability of disabledCapabilities) {
      expect(precondition).toContain(`and not control.${capability}`);
      expect(postcondition).toContain(`and not control.${capability}`);
    }

    expect(rollback).toContain("Migration 087 is forward-only");
    expect(rollback).toContain("cannot be rolled back safely");
    expect(rollback).not.toContain("create or replace function");
    expect(rollback).not.toMatch(
      /^\s*(?:alter|drop|grant|revoke|update|insert|delete)\b/im,
    );
    expect(rollback.trimEnd().endsWith("rollback;")).toBe(true);
  });

  it("preserves the five predecessor state machines while adding only SQL qualification", () => {
    for (const functionCase of functionCases) {
      const predecessor = functionDefinition(
        functionCase.predecessor,
        functionCase.name,
        functionCase.predecessorTag,
      );
      const repaired = functionDefinition(
        migration,
        functionCase.name,
        functionCase.repairedTag,
      );

      expect(repaired).toContain("#variable_conflict error");
      expect(semanticSkeleton(repaired)).toBe(semanticSkeleton(predecessor));
    }
  });

  it("qualifies every confirmed OUT-parameter collision and keeps 085 ciphertext bounds", () => {
    const capture = functionDefinition(
      migration,
      "public.apply_flight_consumer_capture_v1",
      "$apply_flight_consumer_capture_087$",
    );
    expect(capture).toContain(
      "where payment.id = p_payment_id and payment.order_id = v_order.id",
    );
    expect(capture).not.toContain(
      "where id = p_payment_id and order_id = v_order.id",
    );

    const terminal = functionDefinition(
      migration,
      "public.record_flight_consumer_duffel_order_terminal_v1",
      "$record_flight_consumer_duffel_order_terminal_087$",
    );
    expect(terminal).toContain("where evidence.attempt_id = v_attempt.id");
    expect(terminal).not.toMatch(/where\s+attempt_id\s*=\s*v_attempt\.id/);

    const syncFinalizer = functionDefinition(
      migration,
      "public.finalize_flight_consumer_duffel_order_v1",
      "$finalize_flight_consumer_duffel_order_087$",
    );
    expect(syncFinalizer).toContain("where payment.order_id = v_order.id");
    expect(syncFinalizer).toContain("and evidence.order_id = v_order.id");
    expect(syncFinalizer).toContain("and passenger.order_id = v_order.id");
    expect(syncFinalizer).not.toMatch(/where\s+order_id\s*=\s*v_order\.id/);
    expect(syncFinalizer).not.toMatch(/and\s+order_id\s*=\s*v_order\.id/);

    const asyncFinalizer = functionDefinition(
      migration,
      "public.finalize_flight_consumer_async_duffel_order_v1",
      "$finalize_flight_consumer_async_duffel_order_087$",
    );
    expect(asyncFinalizer).toContain("and passenger.order_id = v_order.id");
    expect(asyncFinalizer).not.toMatch(/and\s+order_id\s*=\s*v_order\.id/);
    expect(asyncFinalizer).toContain("not between 16 and 8176");
    expect(asyncFinalizer).toContain("not between 16 and 4080");

    const refund = functionDefinition(
      migration,
      "public.apply_flight_consumer_refund_compensation_v1",
      "$apply_flight_consumer_refund_compensation_087$",
    );
    expect(refund).toContain(
      "where payment.id = p_payment_id and payment.order_id = v_order.id",
    );
    expect(refund).toContain("where document.order_id = v_order.id");
    expect(refund).not.toContain(
      "where id = p_payment_id and order_id = v_order.id",
    );
    expect(refund).not.toMatch(
      /from public\.flight_ticket_documents\s+where\s+order_id/,
    );
  });

  it("preserves service-role-only authority and mirrors every installed definition", () => {
    const signatures = [
      "public.apply_flight_consumer_capture_v1(uuid, integer, uuid, text)",
      "public.record_flight_consumer_duffel_order_terminal_v1(",
      "public.finalize_flight_consumer_duffel_order_v1(",
      "public.finalize_flight_consumer_async_duffel_order_v1(",
      "public.apply_flight_consumer_refund_compensation_v1(",
    ];
    for (const signature of signatures) {
      expect(migration).toContain(`revoke all on function ${signature}`);
      expect(migration).toContain(`grant execute on function ${signature}`);
    }
    expect(migration).not.toMatch(
      /grant\s+execute[\s\S]*?to\s+(?:anon|authenticated)/i,
    );

    for (const functionCase of functionCases) {
      const installed = functionDefinition(
        migration,
        functionCase.name,
        functionCase.repairedTag,
      );
      const mirrored = functionDefinition(
        schema,
        functionCase.name,
        functionCase.repairedTag,
      );
      expect(mirrored).toBe(installed);
    }

    const marker =
      "-- Mirrored from migrations/202608260126_flight_consumer_capture_projection_repair.sql.\n";
    const markerIndex = schema.indexOf(marker);
    expect(markerIndex).toBeGreaterThanOrEqual(0);
    expect(schema.indexOf(marker, markerIndex + marker.length)).toBe(-1);
    const nextMirrorIndex = schema.indexOf(
      "\n\n-- Mirrored from migrations/",
      markerIndex + marker.length,
    );
    const mirroredMigration = schema.slice(
      markerIndex + marker.length,
      nextMirrorIndex >= 0 ? nextMirrorIndex : undefined,
    );
    expect(mirroredMigration.trim()).toBe(migration.trim());
  });
});
