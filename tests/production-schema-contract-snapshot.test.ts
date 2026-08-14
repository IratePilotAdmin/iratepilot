import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const snapshot = readFileSync(
  new URL("../supabase/production_schema_contract_snapshot.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("production schema contract snapshot", () => {
  it("fingerprints every migration contract surface without returning definitions", () => {
    for (const section of [
      "tables", "columns", "constraints", "indexes",
      "policies", "functions", "triggers", "grants",
    ]) {
      expect(snapshot).toContain(`'${section}'`);
    }
    expect(snapshot).toContain("pg_get_constraintdef");
    expect(snapshot).toContain("pg_get_functiondef");
    expect(snapshot).toContain("pg_get_triggerdef");
    expect(snapshot).toContain("md5(");
    expect(snapshot).toContain("identities");
  });

  it("is read-only", () => {
    for (const statement of [
      "insert", "update", "delete", "alter", "drop", "create",
      "truncate", "grant", "revoke",
    ]) {
      expect(snapshot).not.toMatch(new RegExp(`^\\s*${statement}\\b`, "m"));
    }
  });
});
