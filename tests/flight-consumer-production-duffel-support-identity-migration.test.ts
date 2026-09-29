import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forwardPath =
  "supabase/production-migrations/202608260112_flight_consumer_live_duffel_support_identity.sql";
const rollbackPath =
  "supabase/production-rollbacks/202608260112_flight_consumer_live_duffel_support_identity.rollback.sql";
const forward = readFileSync(forwardPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");

describe("Flight Consumer Production Duffel support identity migration 112", () => {
  it("is transactional and pins exact dark 108/111 prerequisites", () => {
    expect(forward.trimStart().startsWith("begin;")).toBe(true);
    expect(forward.trimEnd().endsWith("commit;")).toBe(true);
    expect(createHash("sha256").update(readFileSync(
      "supabase/production-migrations/202608260108_flight_consumer_live_duffel_order_execution_journal.sql",
    )).digest("hex")).toBe(
      "51688027dd052781981c12aa9e36c0bf66621e3937ac32e4b749faec12fa2093",
    );
    for (const prerequisite of [
      "flight_consumer_live_duffel_order_executions",
      "flight_consumer_live_duffel_order_execution_receipts",
      "flight_consumer_live_stripe_capture_attempts",
      "complete_flight_consumer_live_duffel_order_execution_v1",
      "extensions.digest(bytea,text)",
    ]) expect(forward).toContain(prerequisite);
    expect(forward).toContain(
      "cannot backfill existing provider-call evidence",
    );
  });

  it("retains validated plaintext support IDs plus independent SHA-256 evidence", () => {
    for (const field of [
      "client_correlation_id text",
      "client_correlation_id_sha256 text",
      "provider_request_id text",
      "provider_request_id_sha256 text",
    ]) expect(forward).toContain(field);
    expect(forward).toContain(
      "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
    );
    expect(forward).toContain(
      "convert_to(p_client_correlation_id, 'UTF8'), 'sha256'",
    );
    expect(forward).toContain(
      "convert_to(p_provider_request_id, 'UTF8'), 'sha256'",
    );
  });

  it("requires correlation on every call and x-request-id on every HTTP response", () => {
    expect(forward).toContain("provider_request_count = 1");
    expect(forward).toContain("client_correlation_id is not null");
    expect(forward).toContain("terminal_http_status is null");
    expect(forward).toContain("provider_request_id is null");
    expect(forward).toContain("terminal_http_status is not null");
    expect(forward).toContain("provider_request_id is not null");
    expect(forward).toContain(
      "(p_terminal_http_status is null) <>\n        (p_provider_request_id is null)",
    );
  });

  it("makes support identity immutable and refuses drift on exact replay", () => {
    expect(forward).toContain(
      "Flight Consumer Live Duffel support identity is immutable",
    );
    expect(forward).toContain(
      "Flight Consumer Live Duffel support identity replay collision",
    );
    expect(forward).toContain("for update;");
    expect(forward.indexOf("for update;")).toBeLessThan(
      forward.indexOf("set_config("),
    );
  });

  it("retires v1 terminal writes and exposes only service-role v2", () => {
    expect(forward).toContain(
      "complete_flight_consumer_live_duffel_order_execution_v2",
    );
    expect(forward).toMatch(
      /revoke execute on function[\s\S]*complete_flight_consumer_live_duffel_order_execution_v1[\s\S]*from service_role;/,
    );
    expect(forward).toMatch(
      /grant execute on function[\s\S]*complete_flight_consumer_live_duffel_order_execution_v2[\s\S]*to service_role;/,
    );
    expect(forward).not.toMatch(
      /grant execute[\s\S]{0,800}\bto (?:public|anon|authenticated)\b/i,
    );
    for (const authority of [
      "provider", "booking", "payment", "capture", "ticketing", "retry",
      "release",
    ]) expect(forward).toContain(authority);
  });

  it("provides an exact service-role, read-only replay support lookup", () => {
    const readFunction = forward.slice(
      forward.indexOf(
        "create function\n  public.read_flight_consumer_live_duffel_order_support_identity_v1",
      ),
      forward.indexOf(
        "$read_flight_consumer_live_duffel_order_support_identity_v1$;",
      ) + "$read_flight_consumer_live_duffel_order_support_identity_v1$;".length,
    );
    expect(readFunction).toContain("security definer");
    expect(readFunction).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(readFunction).toContain(
      "execution.order_execution_binding_sha256 =",
    );
    expect(readFunction).toContain(
      "execution.order_request_sha256 = p_order_request_sha256",
    );
    expect(readFunction).toContain("for key share;");
    expect(readFunction).not.toMatch(/\b(?:insert|update|delete|truncate)\b/i);
    expect(forward).toMatch(
      /grant execute on function\s+public\.read_flight_consumer_live_duffel_order_support_identity_v1\([\s\S]*?\) to service_role;/,
    );
    expect(forward).not.toMatch(
      /grant execute on function\s+public\.read_flight_consumer_live_duffel_order_support_identity_v1\([\s\S]*?\) to (?:public|anon|authenticated);/i,
    );
  });

  it("provides guarded, dependency-ordered empty rollback", () => {
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain(
      "Refusing rollback: Flight Consumer Live Duffel order execution state exists",
    );
    expect(rollback).toMatch(
      /select 1\s+from public\.flight_consumer_live_duffel_order_executions\s*\)/,
    );
    expect(rollback.indexOf("lock table")).toBeLessThan(
      rollback.indexOf("Refusing rollback"),
    );
    expect(rollback.indexOf("drop trigger")).toBeLessThan(
      rollback.indexOf("drop column"),
    );
    expect(rollback).toContain(
      "complete_flight_consumer_live_duffel_order_execution_v1",
    );
    expect(rollback).toContain(
      "read_flight_consumer_live_duffel_order_support_identity_v1",
    );
    expect(rollback.indexOf(
      "drop function\n  public.read_flight_consumer_live_duffel_order_support_identity_v1",
    )).toBeLessThan(rollback.indexOf(
      "drop function public.complete_flight_consumer_live_duffel_order_execution_v2",
    ));
    expect(rollback).not.toMatch(/cascade|truncate|delete from/i);
  });
});
