import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608260135_flight_consumer_completion_lease_recovery.sql",
    import.meta.url,
  ),
  "utf8",
);
const successorMigration = readFileSync(
  new URL(
    "../supabase/migrations/202608260136_flight_consumer_terminal_offer_evidence_recovery.sql",
    import.meta.url,
  ),
  "utf8",
);
const secondSuccessorMigration = readFileSync(
  new URL(
    "../supabase/migrations/202608260137_flight_consumer_terminal_offer_local_identity.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL(
    "../supabase/rollbacks/202608260135_flight_consumer_completion_lease_recovery.rollback.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const schemaMarker =
  "-- Mirrored from migrations/202608260135_flight_consumer_completion_lease_recovery.sql.";

const signature =
  "public.recover_flight_consumer_completion_lease_v1(uuid,uuid,text,text,integer)";
const sourceSha256 =
  "057b3c28de09f78322b07166181cf1feeaf8d544a12743a8ba9822b1cbad2bda";

function normalizeNewlines(source: string) {
  return source.replace(/\r\n/g, "\n");
}

function functionBody() {
  const source = normalizeNewlines(migration);
  const marker = "$recover_flight_consumer_completion_lease$";
  const start = source.indexOf(`as ${marker}`);
  expect(start).toBeGreaterThan(0);
  const bodyStart = start + `as ${marker}`.length;
  const bodyEnd = source.indexOf(`${marker};`, bodyStart);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

function occurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe("Flight Consumer Preview completion-lease recovery migration", () => {
  it("is the exact canonical schema segment immediately before migrations 097 and 098", () => {
    const markerIndex = schema.lastIndexOf(schemaMarker);
    expect(markerIndex).toBeGreaterThan(0);
    expect(schema.slice(markerIndex + schemaMarker.length + 1)).toBe(
      migration + successorMigration + secondSuccessorMigration,
    );
  });

  it("is forward-only, relocked, and pinned to the reviewed completion predecessor", () => {
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain(
      "migration 096 requires relock before recovery hardening",
    );
    expect(migration).toContain("and not control.provider_live_traffic_enabled");
    expect(migration).toContain(
      "f3263f27218516e8418f3612b1ebbb681aa75996a90a3734fbcf77326069d914",
    );
    expect(migration).toContain(
      "b6bfcdcb5968d63a2c4757d137759ed987cf2741f642399d88f902fa47c2c28b",
    );
    expect(migration).toContain(
      "Flight completion lease identity is immutable",
    );
  });

  it("freezes the exact service recovery RPC source and projection", () => {
    const body = functionBody();
    expect(createHash("sha256").update(body, "utf8").digest("hex")).toBe(
      sourceSha256,
    );
    expect(occurrences(migration, sourceSha256)).toBe(1);
    expect(migration).toContain(
      "create function public.recover_flight_consumer_completion_lease_v1(\n" +
        "  p_customer_id uuid,\n" +
        "  p_order_id uuid,\n" +
        "  p_execution_scope_sha256 text,\n" +
        "  p_lease_token_sha256 text,\n" +
        "  p_lease_duration_seconds integer\n" +
        ")",
    );
    expect(migration).toContain("request_sha256 text,");
    expect(migration).toContain("provider_redispatch_authorized boolean");
    expect(body).toContain("v_lease.request_sha256");
    expect(body).not.toContain("p_idempotency_key_sha256");
    expect(body).not.toContain("p_request_sha256");
    expect(body).not.toMatch(/set[\s\S]{0,300}(?:idempotency_key_sha256|request_sha256)\s*=/);
  });

  it("reclaims only released or expired processing leases after active-dispatch checks", () => {
    const body = functionBody();
    const unexpiredLease = body.indexOf(
      "v_lease.lease_state = 'processing'\n    and v_lease.lease_expires_at > v_now",
    );
    const activeDispatch = body.indexOf(
      "v_provider.state = 'dispatching' and v_provider.dispatch_not_after > v_now",
    );
    const exactState = body.indexOf("v_lease.lease_state <> 'released'");
    const reclaim = body.lastIndexOf(
      "update public.flight_consumer_completion_leases as completion_lease",
    );

    expect(unexpiredLease).toBeGreaterThan(0);
    expect(activeDispatch).toBeGreaterThan(unexpiredLease);
    expect(exactState).toBeGreaterThan(activeDispatch);
    expect(reclaim).toBeGreaterThan(exactState);
    expect(body.slice(exactState, reclaim)).toContain(
      "v_lease.lease_state = 'processing'",
    );
    expect(body.slice(exactState, reclaim)).toContain(
      "v_lease.lease_expires_at <= v_now",
    );
    expect(migration).toContain(
      "position('v_lease.lease_state <> ''released''' in v_source) = 0",
    );
    expect(body).toContain("'processing'::text");
    expect(body).toContain("'reclaimed'::text");
    expect(body).toContain(
      "completion_lease.lease_token_sha256\n       is not distinct from v_lease.lease_token_sha256",
    );
  });

  it("preserves every journal state for application recovery without granting redispatch", () => {
    const body = functionBody();
    for (const projection of [
      "v_provider.state = 'prepared' and v_provider.revision = 0",
      "v_provider.state in ('dispatching', 'blocked') and v_provider.revision = 1",
      "v_provider.state in ('succeeded', 'failed', 'ambiguous')",
      "v_capture.state = 'prepared' and v_capture.revision = 0",
      "v_capture.state in ('dispatching', 'blocked') and v_capture.revision = 1",
      "v_capture.state in ('succeeded', 'failed', 'ambiguous')",
    ]) expect(body).toContain(projection);

    expect(body).toContain("v_provider.retry_authorized");
    expect(body).toContain("v_exact_ticketed");
    expect(body).toContain("'replayed'::text");
    expect(occurrences(body, "v_capture.revision, false;")).toBe(5);
    expect(body).toContain(
      "v_capture.revision, false;\nend;",
    );
    expect(body).not.toContain("true;");
  });

  it("keeps the new boundary service-role only and the lease table sealed", () => {
    expect(functionBody()).toContain(
      "coalesce(auth.role(), '') <> 'service_role'",
    );
    expect(migration).toContain(
      "revoke all on function public.recover_flight_consumer_completion_lease_v1(\n" +
        "  uuid, uuid, text, text, integer\n" +
        ") from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.recover_flight_consumer_completion_lease_v1(\n" +
        "  uuid, uuid, text, text, integer\n" +
        ") to service_role;",
    );
    expect(migration).toContain(
      `has_function_privilege(\n      'service_role',\n      '${signature}',\n      'EXECUTE'`,
    );
    expect(migration).toContain("relation.relforcerowsecurity");
    expect(migration).toContain(
      "has_table_privilege(\n      'service_role', 'public.flight_consumer_completion_leases', 'SELECT'",
    );
  });

  it("uses a fail-closed forward-only rollback", () => {
    expect(rollback).toMatch(/forward-only/i);
    expect(rollback).toMatch(/cannot be rolled back safely/i);
    expect(rollback).toMatch(/restore from a reviewed backup/i);
    expect(rollback).toMatch(/raise exception/i);
    expect(rollback).not.toMatch(
      /^\s*(?:alter|create|drop|grant|revoke|truncate|update|insert|delete)\b/im,
    );
    expect(rollback.trim().toLowerCase().endsWith("rollback;")).toBe(true);
  });
});
