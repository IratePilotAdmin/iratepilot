import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260138_flight_ticket_document_identity_scope_repair.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260138_flight_ticket_document_identity_scope_repair.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);

const legacyConstraint =
  "flight_ticket_documents_execution_scope_sha256_execution_mo_key";
const repairedConstraint =
  "flight_ticket_documents_order_id_document_ref_sha256_key";

describe("flight ticket document identity-scope repair migration", () => {
  it("replaces execution-scope-wide identity uniqueness with order-scoped uniqueness", () => {
    expect(migration).toMatch(/^begin;/);
    expect(migration).toMatch(/commit;\s*$/);
    expect(migration).toContain(`drop constraint\n    ${legacyConstraint}`);
    expect(migration).toContain(`add constraint ${repairedConstraint}`);
    expect(migration).toContain("unique (order_id, document_ref_sha256)");
    expect(migration).not.toContain(
      "add constraint flight_ticket_documents_execution_scope_sha256",
    );
  });

  it("proves the exact predecessor and refuses dirty order-local identities", () => {
    expect(migration).toContain(`'${legacyConstraint}'`);
    expect(migration).toContain(
      "'execution_scope_sha256', 'execution_mode', 'document_ref_sha256'",
    );
    expect(migration).toContain("constraint_row.contype = 'u'");
    expect(migration).toContain("not v_old_constraint.convalidated");
    expect(migration).toContain("v_old_constraint.condeferrable");
    expect(migration).toMatch(
      /group by document\.order_id, document\.document_ref_sha256\s+having count\(\*\) > 1/,
    );
    expect(migration).toContain("control.execution_kill_switch_engaged");
    expect(migration).toContain("not control.provider_sandbox_traffic_enabled");
    expect(migration).toContain("not control.provider_live_traffic_enabled");
    expect(migration).toContain("not control.production_release_enabled");
    expect(migration).toContain("requires relock before repair");
  });

  it("keeps pending null references possible while rejecting a duplicate reference within one order", () => {
    const uniqueColumns = ["order_id", "document_ref_sha256"] as const;
    const key = (orderId: string, documentRefSha256: string | null) => (
      documentRefSha256 === null
        ? null
        : uniqueColumns.map((column) => (
          column === "order_id" ? orderId : documentRefSha256
        )).join(":")
    );

    expect(key("order-a", "a".repeat(64))).not.toBe(
      key("order-b", "a".repeat(64)),
    );
    expect(key("order-a", "a".repeat(64))).toBe(
      key("order-a", "a".repeat(64)),
    );
    expect(key("order-a", null)).toBeNull();
  });

  it("updates the schema mirror without mutating the frozen foundation migration", () => {
    expect(schema).toContain("unique (order_id, document_ref_sha256)");
    expect(schema).not.toContain(
      "unique (execution_scope_sha256, execution_mode, document_ref_sha256)",
    );
  });

  it("is explicitly forward-only because valid cross-order duplicates may exist afterward", () => {
    expect(rollback).toMatch(/^begin;/);
    expect(rollback).toContain("forward-only");
    expect(rollback).toContain("raise exception");
    expect(rollback).toMatch(/rollback;\s*$/);
    expect(rollback).not.toContain(`add constraint ${legacyConstraint}`);
  });
});
