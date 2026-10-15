import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/202609230142_iratepilot_pms_reservation_connection_setup.sql", import.meta.url), "utf8");
const db = new PGlite();
const property = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const tenant = "33333333-3333-4333-8333-333333333333";
const pmsProperty = "44444444-4444-4444-8444-444444444444";

describe("native PMS reservation connection setup migration", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid primary key);
      CREATE TABLE public.partners(id uuid primary key, status text not null);
      CREATE TABLE public.properties(id uuid primary key, partner_id uuid not null references public.partners(id), active boolean not null);
      CREATE TABLE public.irp_pms_outbox_connections(
        property_id uuid primary key, connection_id text unique, tenant_id text, pms_property_id text,
        enabled boolean default false, environment text default 'sandbox', delivery_enabled boolean default false
      );
      CREATE TABLE public.bookings(id uuid primary key, property_id uuid not null, check_out date not null);
      CREATE TABLE public.irp_pms_outbox(event_id uuid, property_id uuid not null);
      CREATE TABLE public.irp_pms_booking_versions(booking_id uuid not null);
      CREATE TABLE public.irp_pms_baseline_runs(property_id uuid not null);
      INSERT INTO auth.users VALUES ('${actor}');
      INSERT INTO public.partners VALUES ('55555555-5555-4555-8555-555555555555','approved');
      INSERT INTO public.properties VALUES ('${property}','55555555-5555-4555-8555-555555555555',true);
    `);
    await db.exec(migration);
  });

  afterAll(async () => { await db.close(); });

  it("creates an exact scope disabled and replays the exact setup request safely", async () => {
    const request = "66666666-6666-4666-8666-666666666666";
    const args = [request, actor, property, "redroof-ridgeland-test", tenant, pmsProperty];
    const first = await db.query<{ result: { outcome: string; captureEnabled: boolean; deliveryEnabled: boolean } }>(
      "SELECT public.irp_pms_configure_reservation_connection($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::uuid) AS result", args,
    );
    expect(first.rows[0].result).toEqual({ outcome: "created", connectionId: "redroof-ridgeland-test", captureEnabled: false, deliveryEnabled: false, environment: "sandbox" });
    const replay = await db.query<{ result: { outcome: string } }>(
      "SELECT public.irp_pms_configure_reservation_connection($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::uuid) AS result", args,
    );
    expect(replay.rows[0].result).toEqual({ outcome: "duplicate", connectionId: "redroof-ridgeland-test" });
    const rows = await db.query<{ enabled: boolean; delivery_enabled: boolean; environment: string; tenant_id: string; pms_property_id: string }>(
      "SELECT enabled,delivery_enabled,environment,tenant_id,pms_property_id FROM public.irp_pms_outbox_connections WHERE property_id=$1", [property],
    );
    expect(rows.rows[0]).toEqual({ enabled: false, delivery_enabled: false, environment: "sandbox", tenant_id: tenant, pms_property_id: pmsProperty });
    const audit = await db.query<{ outcome: string; count: string }>(
      "SELECT min(outcome) AS outcome,count(*)::text AS count FROM public.irp_pms_outbox_setup_events",
    );
    expect(audit.rows[0]).toEqual({ outcome: "created", count: "1" });
  });

  it("rejects request-id reuse with altered scope and limits execution to service role", async () => {
    const reuse = "66666666-6666-4666-8666-666666666666";
    await expect(db.query(
      "SELECT public.irp_pms_configure_reservation_connection($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::uuid)",
      [reuse, actor, property, "different", tenant, pmsProperty],
    )).rejects.toMatchObject({ code: "P0001" });
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(
      "SELECT has_function_privilege('anon','public.irp_pms_configure_reservation_connection(uuid,uuid,uuid,text,uuid,uuid)','EXECUTE') AS anon, has_function_privilege('authenticated','public.irp_pms_configure_reservation_connection(uuid,uuid,uuid,text,uuid,uuid)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.irp_pms_configure_reservation_connection(uuid,uuid,uuid,text,uuid,uuid)','EXECUTE') AS service_role",
    );
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
  });

  it("previews only aggregate counts and refuses capture when delivery history already exists", async () => {
    const before = await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.irp_pms_preview_reservation_baseline($1::uuid,$2::date) AS result", [property, "2026-09-23"],
    );
    expect(before.rows[0].result).toMatchObject({
      fromDate: "2026-09-23",
      reservationCount: 0,
      outboxEventCount: 0,
      versionedReservationCount: 0,
      eligibleForCapture: true,
    });
    expect(Object.keys(before.rows[0].result).sort()).toEqual([
      "baselineExists", "captureEnabled", "deliveryEnabled", "eligibleForCapture", "fromDate",
      "outboxEventCount", "propertyReady", "reasonCodes", "reservationCount", "versionedReservationCount",
    ].sort());

    await db.exec(`INSERT INTO public.bookings VALUES
      ('77777777-7777-4777-8777-777777777777','${property}','2026-09-25'),
      ('88888888-8888-4888-8888-888888888888','${property}','2026-09-27')`);
    const withBookings = await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.irp_pms_preview_reservation_baseline($1::uuid,$2::date) AS result", [property, "2026-09-23"],
    );
    expect(withBookings.rows[0].result).toMatchObject({ reservationCount: 2, eligibleForCapture: true });

    await db.query("INSERT INTO public.irp_pms_outbox VALUES ($1,$2)", ["99999999-9999-4999-8999-999999999999", property]);
    await db.query("INSERT INTO public.irp_pms_booking_versions VALUES ($1)", ["77777777-7777-4777-8777-777777777777"]);
    const withHistory = await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.irp_pms_preview_reservation_baseline($1::uuid,$2::date) AS result", [property, "2026-09-23"],
    );
    expect(withHistory.rows[0].result).toMatchObject({
      outboxEventCount: 1,
      versionedReservationCount: 1,
      eligibleForCapture: false,
      reasonCodes: ["outbox_history_exists", "version_history_exists"],
    });
    const previewPrivileges = await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(
      "SELECT has_function_privilege('anon','public.irp_pms_preview_reservation_baseline(uuid,date)','EXECUTE') AS anon, has_function_privilege('authenticated','public.irp_pms_preview_reservation_baseline(uuid,date)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.irp_pms_preview_reservation_baseline(uuid,date)','EXECUTE') AS service_role",
    );
    expect(previewPrivileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
  });
});
