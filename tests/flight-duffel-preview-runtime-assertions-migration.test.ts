import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202608250072_flight_duffel_preview_runtime_assertions.sql", "utf8");
const rollback = readFileSync("supabase/rollbacks/202608250072_flight_duffel_preview_runtime_assertions.rollback.sql", "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");

describe("Duffel Preview runtime assertion bridge migration", () => {
  it("binds all four runtime assertions transaction-locally before both prepare and claim", () => {
    for (const setting of [
      "app.flight_environment",
      "app.flight_project_ref",
      "app.flight_execution_authorized",
      "app.flight_activation_evidence_sha256",
    ]) expect(migration.match(new RegExp(setting.replaceAll(".", "\\."), "g"))).toHaveLength(2);
    expect(migration).toContain("select activation_evidence_sha256 into v_activation_evidence_sha256");
    expect(migration).toContain("'eiqmdldjnedqgbtoozqa'");
    expect(migration).not.toContain("production");
  });

  it("preserves evidence and refuses an unsafe in-place rollback", () => {
    expect(rollback).toContain("if exists (select 1 from public.flight_provider_request_attempts)");
    expect(rollback).toContain("raise exception");
    expect(rollback).not.toMatch(/drop\s+table/i);
  });

  it("mirrors the exact reviewed migration bytes once in the bootstrap schema", () => {
    const marker = "-- Mirrored from migrations/202608250072_flight_duffel_preview_runtime_assertions.sql.";
    expect(schema.split(marker)).toHaveLength(2);
    expect(schema).toContain(`${marker}\n${migration.trimEnd()}`);
  });
});
