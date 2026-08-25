import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202608250071_flight_duffel_preview_rpc_bridge.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollbacks/202608250071_flight_duffel_preview_rpc_bridge.rollback.sql",
  "utf8",
);
const bootstrap = readFileSync("supabase/schema.sql", "utf8");

describe("Duffel Preview RPC bridge migration", () => {
  it("binds transaction-local receipts before delegating to the immutable journals", () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    for (const setting of [
      "app.flight_adapter_source_sha256",
      "app.flight_provider_binding_receipt_sha256",
      "app.flight_request_authority_receipt_sha256",
    ]) expect(migration).toContain(`set_config('${setting}'`);
    expect(migration).toContain("p_operation = 'create_order'");
    expect(migration).toContain("p_execution_mode <> 'test'");
    expect(migration).toContain("prepare_flight_provider_order_attempt(");
    expect(migration).toContain("prepare_flight_provider_request_attempt(");
    expect(migration).toContain("claim_flight_provider_order_attempt_for_dispatch(");
    expect(migration).toContain("claim_flight_provider_request_attempt_for_dispatch(");
    expect(migration).not.toMatch(/\b(?:fetch|http_request|net\.http|vault\.)\b/i);
  });

  it("is service-role only and rollback-matched", () => {
    for (const name of [
      "prepare_flight_provider_attempt_rpc",
      "claim_flight_provider_attempt_rpc",
    ]) {
      expect(migration).toContain(`revoke all on function public.${name}(`);
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?\\)\\s+to service_role;`));
      expect(rollback).toContain(`drop function public.${name}(`);
    }
  });

  it("is mirrored exactly once in the bootstrap schema", () => {
    const body = migration.replace(/^begin;\r?\n\r?\n/, "").replace(/\r?\ncommit;\r?\n?$/, "");
    expect(bootstrap.split(body)).toHaveLength(2);
  });
});
