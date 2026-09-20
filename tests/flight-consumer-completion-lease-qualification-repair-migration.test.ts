import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration091 = readFileSync(
  new URL(
    "../supabase/migrations/202608260130_flight_consumer_completion_lease.sql",
    import.meta.url,
  ),
  "utf8",
);
const migration094 = readFileSync(
  new URL(
    "../supabase/migrations/202608260133_flight_consumer_completion_lease_qualification_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback094 = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260133_flight_consumer_completion_lease_qualification_repair.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const schemaMarker =
  "-- Mirrored from migrations/202608260133_flight_consumer_completion_lease_qualification_repair.sql.";
const nextSchemaMarker =
  "-- Mirrored from migrations/202608260134_flight_consumer_duffel_claim_evidence_column_repair.sql.";

const functions = [
  {
    name: "acquire_flight_consumer_completion_lease_v1",
    signature: "uuid, uuid, text, text, text, text, integer",
    predecessorSha256:
      "e5cdbca26fdd2c017eb855baf19660bb4f66ef4624cf0ee64c214f0701e94a0e",
    repairedSha256:
      "f3263f27218516e8418f3612b1ebbb681aa75996a90a3734fbcf77326069d914",
    updateCount: 2,
    predicateCounts: {
      order_id: 2,
      lease_revision: 2,
      lease_state: 1,
      lease_token_sha256: 0,
    },
  },
  {
    name: "heartbeat_flight_consumer_completion_lease_v1",
    signature: "uuid, integer, text, integer",
    predecessorSha256:
      "4ee0ed9156f1f9aa7dc44379d33351e237ebd3ddfaf07b45e4f473834de68cc7",
    repairedSha256:
      "467af39b293c6bc70df3c65d064ccc9b76e1587e37c8b53e0dd870307a461d28",
    updateCount: 1,
    predicateCounts: {
      order_id: 1,
      lease_revision: 1,
      lease_state: 1,
      lease_token_sha256: 1,
    },
  },
  {
    name: "complete_flight_consumer_completion_lease_v1",
    signature: "uuid, integer, text, text, integer",
    predecessorSha256:
      "2cb86d091933c89fc7f9baf7f8535a6e80411f37cba759476de43a4f313a8fb8",
    repairedSha256:
      "88c882ace38574d0e82f06aabbda85f4eda2502c91afcf9eab6e1d4dd9983b64",
    updateCount: 1,
    predicateCounts: {
      order_id: 1,
      lease_revision: 1,
      lease_state: 1,
      lease_token_sha256: 1,
    },
  },
  {
    name: "release_flight_consumer_completion_lease_v1",
    signature: "uuid, integer, text, text",
    predecessorSha256:
      "389c25a81d1d82771898069f0bf66301a5eb814afc06a271e382b13f2cfbcd37",
    repairedSha256:
      "9df55dc3b6c719a3c6c3c261746910287df346cfcfd2c6be9a9fd30d42426c93",
    updateCount: 2,
    predicateCounts: {
      order_id: 2,
      lease_revision: 2,
      lease_state: 1,
      lease_token_sha256: 1,
    },
  },
] as const;

const replacements = [
  [
    "update public.flight_consumer_completion_leases",
    "update public.flight_consumer_completion_leases as completion_lease",
  ],
  [
    "where order_id = p_order_id",
    "where completion_lease.order_id = p_order_id",
  ],
  ["and lease_revision =", "and completion_lease.lease_revision ="],
  ["and lease_state =", "and completion_lease.lease_state ="],
  [
    "and lease_token_sha256 =",
    "and completion_lease.lease_token_sha256 =",
  ],
] as const;

function functionBody(source: string, name: string) {
  const needle = `create function public.${name}(`;
  const start = source.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);

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

function normalizeNewlines(source: string) {
  return source.replace(/\r\n/g, "\n");
}

function sha256(source: string) {
  return createHash("sha256")
    .update(normalizeNewlines(source), "utf8")
    .digest("hex");
}

function repair091Body(source: string) {
  return replacements.reduce(
    (definition, [before, after]) => definition.replaceAll(before, after),
    source,
  );
}

function qualificationNeutralBody(source: string) {
  return source
    .replaceAll(
      "update public.flight_consumer_completion_leases as completion_lease",
      "update public.flight_consumer_completion_leases",
    )
    .replaceAll("completion_lease.", "");
}

function leaseUpdateStatements(definition: string) {
  return [
    ...definition.matchAll(
      /update\s+public\.flight_consumer_completion_leases\s+as\s+completion_lease[\s\S]*?returning\s+(?:completion_lease\.)?\*\s+into\s+v_lease\s*;/gi,
    ),
  ].map((match) => match[0]);
}

function predicateColumns(statement: string) {
  const predicate = statement.match(/\bwhere\b[\s\S]*?\breturning\b/i);
  expect(predicate).not.toBeNull();
  return [
    ...predicate![0]!.matchAll(
      /\b(?:where|and)\s+((?:[a-z_][a-z0-9_]*\.)?)([a-z_][a-z0-9_]*)\s+(?:=|<>|is\b|in\b|between\b)/gi,
    ),
  ].map((match) => ({ qualifier: match[1], column: match[2] }));
}

function occurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe("Flight Consumer Preview completion-lease qualification repair", () => {
  it("is the exact canonical schema tail", () => {
    const markerIndex = schema.lastIndexOf(schemaMarker);
    expect(markerIndex).toBeGreaterThan(0);
    const nextMarkerIndex = schema.indexOf(nextSchemaMarker, markerIndex + schemaMarker.length);
    expect(nextMarkerIndex).toBeGreaterThan(markerIndex);
    expect(schema.slice(markerIndex + schemaMarker.length, nextMarkerIndex).trim())
      .toBe(migration094.trim());
  });

  it("reconstructs only the reviewed qualification repair over frozen 091 bodies", () => {
    expect(migration094.match(/v_definition\s*:=\s*replace\s*\(/g)).toHaveLength(
      replacements.length,
    );
    expect(migration094).toContain("v_definition := pg_get_functiondef(v_oid)");

    for (const [before, after] of replacements) {
      expect(migration094).toContain(`'${before}',\n      '${after}'`);
    }

    for (const contract of functions) {
      const frozen = functionBody(migration091, contract.name);
      const repaired = repair091Body(frozen);
      const canonicalSignature = contract.signature.replaceAll(", ", ",");
      const expectedInventory = [
        contract.updateCount,
        ...Object.values(contract.predicateCounts),
      ].join(", ");

      expect(qualificationNeutralBody(repaired)).toBe(
        qualificationNeutralBody(frozen),
      );
      expect(repaired).toContain("#variable_conflict error");
      expect(sha256(frozen)).toBe(contract.predecessorSha256);
      expect(sha256(repaired)).toBe(contract.repairedSha256);
      expect(normalizeNewlines(migration094).replace(/\s+/g, " ")).toContain(
        `( 'public.${contract.name}(${canonicalSignature})', '${contract.predecessorSha256}', '${contract.repairedSha256}', ${expectedInventory} )`,
      );
      expect(occurrences(migration094, contract.predecessorSha256)).toBe(1);
      expect(occurrences(migration094, contract.repairedSha256)).toBe(2);
    }
  });

  it("qualifies every predicate column in all six lease UPDATE statements", () => {
    let totalUpdates = 0;
    let totalPredicates = 0;
    let totalAmbiguousPredicates = 0;

    for (const contract of functions) {
      const definition = repair091Body(functionBody(migration091, contract.name));
      const updates = leaseUpdateStatements(definition);
      expect(updates).toHaveLength(contract.updateCount);
      totalUpdates += updates.length;

      const predicates = updates.flatMap(predicateColumns);
      totalPredicates += predicates.length;
      totalAmbiguousPredicates += predicates.filter(
        ({ column }) => column === "lease_revision" || column === "lease_state",
      ).length;

      for (const predicate of predicates) {
        expect(predicate.qualifier).toBe("completion_lease.");
      }
      for (const [column, expectedCount] of Object.entries(
        contract.predicateCounts,
      )) {
        expect(
          predicates.filter((predicate) => predicate.column === column),
        ).toHaveLength(expectedCount);
      }
      expect(predicates).toHaveLength(
        Object.values(contract.predicateCounts).reduce<number>(
          (sum, count) => sum + count,
          0,
        ),
      );
    }

    expect(totalUpdates).toBe(6);
    expect(totalPredicates).toBe(19);
    expect(totalAmbiguousPredicates).toBe(10);
  });

  it("keeps all four RPCs service-role only", () => {
    for (const contract of functions) {
      const sqlSignature = `public.${contract.name}(\n  ${contract.signature}\n)`;
      expect(migration094).toContain(
        `revoke all on function ${sqlSignature} from public, anon, authenticated, service_role;`,
      );
      expect(migration094).toContain(
        `grant execute on function ${sqlSignature} to service_role;`,
      );
      expect(functionBody(migration091, contract.name)).toContain(
        "coalesce(auth.role(), '') <> 'service_role'",
      );
    }

    const grants = [
      ...migration094.matchAll(
        /grant\s+execute\s+on\s+function[\s\S]*?\)\s+to\s+([a-z_]+)\s*;/gi,
      ),
    ];
    expect(grants).toHaveLength(4);
    expect(grants.map((grant) => grant[1])).toEqual([
      "service_role",
      "service_role",
      "service_role",
      "service_role",
    ]);
    expect(migration094).toContain(
      "has_function_privilege('authenticated', v_signature, 'EXECUTE')",
    );
    expect(migration094).toContain(
      "has_function_privilege('anon', v_signature, 'EXECUTE')",
    );
  });

  it("uses a forward-only rollback", () => {
    expect(rollback094).toMatch(/forward-only/i);
    expect(rollback094).toMatch(/cannot be rolled back safely/i);
    expect(rollback094).toMatch(/restore from a reviewed backup/i);
    expect(rollback094).toMatch(/raise exception/i);
    expect(rollback094).not.toMatch(
      /^\s*(?:alter|create|drop|grant|revoke|truncate|update|insert|delete)\b/im,
    );
    expect(rollback094.trim().toLowerCase().endsWith("rollback;")).toBe(true);
  });
});
