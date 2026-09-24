import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const reservationMigration = await readFile(new URL("../supabase/migrations/20260923151000_iratepilot_pms_reservation_connection_setup.sql", import.meta.url), "utf8");
const atomicMigration = await readFile(new URL("../supabase/migrations/20260924101500_iratepilot_pms_atomic_connection_setup.sql", import.meta.url), "utf8");
const schemaVerification = await readFile(new URL("../supabase/verify_schema.sql", import.meta.url), "utf8");
const db = new PGlite();
const property = "11111111-1111-4111-8111-111111111111";
const failureProperty = "99999999-9999-4999-8999-999999999999";
const actor = "22222222-2222-4222-8222-222222222222";
const tenant = "33333333-3333-4333-8333-333333333333";
const pmsProperty = "44444444-4444-4444-8444-444444444444";
const connection = "redroof-ridgeland-test";
const request = "66666666-6666-4666-8666-666666666666";
const mapping = [{ roomTypeId: "KNG", ratePlanId: "BAR", otaRoomId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }];

async function configure(mappings = mapping) {
  return db.query(
    "SELECT public.irp_pms_configure_native_connection($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::uuid,$7,$8,$9,$10,$11::jsonb) AS result",
    [request, actor, property, connection, tenant, pmsProperty, "ciphertext", "initialization-vector", "authentication-tag", 1, JSON.stringify(mappings)],
  );
}

describe("atomic native PMS connector setup", () => {
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
      CREATE TABLE public.fake_ari_config(connection_id text primary key, mapping_count integer not null);
      INSERT INTO auth.users VALUES ('${actor}');
      INSERT INTO public.partners VALUES ('55555555-5555-4555-8555-555555555555','approved');
      INSERT INTO public.properties VALUES ('${property}','55555555-5555-4555-8555-555555555555',true);
      INSERT INTO public.properties VALUES ('${failureProperty}','55555555-5555-4555-8555-555555555555',true);
    `);
    await db.exec(reservationMigration);
    await db.exec(`
      CREATE FUNCTION public.irp_pms_save_native_ari_connection(
        p_connection text, p_property uuid, p_pms_property text, p_secret_ciphertext text,
        p_secret_iv text, p_secret_tag text, p_secret_key_version integer, p_mappings jsonb
      )
      RETURNS jsonb LANGUAGE plpgsql AS $$
      BEGIN
        IF p_mappings @> '[{"fail":true}]'::jsonb THEN RAISE EXCEPTION 'simulated ARI setup failure'; END IF;
        INSERT INTO public.fake_ari_config(connection_id,mapping_count)
          VALUES (p_connection,jsonb_array_length(p_mappings))
          ON CONFLICT(connection_id) DO UPDATE SET mapping_count=excluded.mapping_count;
        RETURN jsonb_build_object('connectionId',p_connection,'mappingCount',jsonb_array_length(p_mappings));
      END
      $$;
    `);
    await db.exec(atomicMigration);
  });

  afterAll(async () => { await db.close(); });

  it("creates both disabled connection records together", async () => {
    const result = await configure() as { rows: Array<{ result: Record<string, unknown> }> };
    expect(result.rows[0].result).toMatchObject({
      reservationConnection: { outcome: "created", connectionId: connection, captureEnabled: false, deliveryEnabled: false },
      ariConnection: { connectionId: connection, mappingCount: 1 },
      captureEnabled: false,
      deliveryEnabled: false,
      environment: "sandbox",
    });
    const rows = await db.query<{ reservation_count: string; ari_count: string }>(`
      SELECT (SELECT count(*) FROM public.irp_pms_outbox_connections)::text AS reservation_count,
        (SELECT count(*) FROM public.fake_ari_config)::text AS ari_count
    `);
    expect(rows.rows[0]).toEqual({ reservation_count: "1", ari_count: "1" });
  });

  it("rolls back the reservation scope and setup receipt when ARI mapping save fails", async () => {
    const failureRequest = "77777777-7777-4777-8777-777777777777";
    await expect(db.query(
      "SELECT public.irp_pms_configure_native_connection($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::uuid,$7,$8,$9,$10,$11::jsonb)",
      [failureRequest, actor, failureProperty, "rollback-test", tenant, pmsProperty, "ciphertext", "initialization-vector", "authentication-tag", 1, JSON.stringify([{ fail: true }])],
    )).rejects.toThrow("simulated ARI setup failure");
    const remaining = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.irp_pms_outbox_connections WHERE property_id=$1::uuid", [failureProperty],
    );
    const receipt = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.irp_pms_outbox_setup_events WHERE request_id=$1::uuid", [failureRequest],
    );
    expect(remaining.rows[0].count).toBe("0");
    expect(receipt.rows[0].count).toBe("0");
  });

  it("exposes the atomic setup RPC only to the service role", async () => {
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(
      "SELECT has_function_privilege('anon','public.irp_pms_configure_native_connection(uuid,uuid,uuid,text,uuid,uuid,text,text,text,integer,jsonb)','EXECUTE') AS anon, has_function_privilege('authenticated','public.irp_pms_configure_native_connection(uuid,uuid,uuid,text,uuid,uuid,text,text,text,integer,jsonb)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.irp_pms_configure_native_connection(uuid,uuid,uuid,text,uuid,uuid,text,text,text,integer,jsonb)','EXECUTE') AS service_role",
    );
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
    expect(schemaVerification).toContain("native_ota_atomic_setup_ready");
    const verification = await db.query<{ native_ota_atomic_setup_ready: boolean }>(
      "SELECT to_regprocedure('public.irp_pms_configure_native_connection(uuid,uuid,uuid,text,uuid,uuid,text,text,text,integer,jsonb)') IS NOT NULL AS native_ota_atomic_setup_ready",
    );
    expect(verification.rows[0].native_ota_atomic_setup_ready).toBe(true);
  });
});
