import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const migrationFiles = [
  "202609070139_iratepilot_pms_transactional_outbox.sql",
  "202609070140_iratepilot_pms_baseline_activation.sql",
  "202609070141_iratepilot_pms_delivery_control.sql",
  "202609070157_iratepilot_pms_scoped_source_claim.sql",
  "202609070158_iratepilot_pms_scoped_source_claim_identity.sql",
  "202609230139_iratepilot_pms_guest_name_snapshot.sql",
  "202609230140_iratepilot_pms_native_ari_receiver.sql",
  "202609230141_iratepilot_pms_delivery_connection_registry.sql",
  "202609230142_iratepilot_pms_reservation_connection_setup.sql",
  "202609240143_iratepilot_pms_baseline_review_control.sql",
  "202609240144_iratepilot_pms_atomic_connection_setup.sql",
  "202609240145_iratepilot_pms_revenue_recommendation_generation.sql",
];
const migrations = await Promise.all(migrationFiles.map((name) =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"),
));
const db = new PGlite();
const propertyId = "11111111-1111-4111-8111-111111111111";
const partnerId = "22222222-2222-4222-8222-222222222222";
const roomId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";

describe("native OTA ordered migration chain", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      CREATE TABLE public.partners(id uuid PRIMARY KEY, status text NOT NULL, owner_id uuid);
      CREATE TABLE public.properties(
        id uuid PRIMARY KEY,
        partner_id uuid NOT NULL REFERENCES public.partners(id),
        active boolean NOT NULL
      );
      CREATE TABLE public.rooms(
        id uuid PRIMARY KEY,
        property_id uuid NOT NULL REFERENCES public.properties(id),
        active boolean NOT NULL
      );
      CREATE TABLE public.inventory(
        room_id uuid NOT NULL REFERENCES public.rooms(id),
        stay_date date NOT NULL,
        available_units integer NOT NULL,
        rate numeric NOT NULL,
        PRIMARY KEY(room_id, stay_date)
      );
      CREATE TABLE public.bookings(
        id uuid PRIMARY KEY,
        confirmation_code text NOT NULL,
        customer_id uuid NOT NULL,
        property_id uuid NOT NULL REFERENCES public.properties(id),
        room_id uuid NOT NULL,
        check_in date NOT NULL,
        check_out date NOT NULL,
        guests integer NOT NULL,
        subtotal numeric NOT NULL,
        taxes numeric NOT NULL,
        fees numeric NOT NULL,
        total numeric NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, full_name text, role text);
      CREATE TABLE public.revenue_daily_inputs(
        property_id uuid NOT NULL,
        room_id uuid NOT NULL,
        stay_date date NOT NULL,
        rooms_available integer NOT NULL,
        rooms_sold integer NOT NULL,
        current_rate numeric NOT NULL,
        competitor_rate numeric,
        event_name text,
        last_year_occupancy numeric
      );
      CREATE TABLE public.revenue_recommendations(
        property_id uuid NOT NULL,
        room_id uuid NOT NULL,
        stay_date date NOT NULL,
        current_rate numeric NOT NULL,
        recommended_rate numeric NOT NULL,
        occupancy_forecast numeric NOT NULL,
        estimated_revenue_impact numeric NOT NULL,
        reason text NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE public.revenue_audit_log(
        property_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        action text NOT NULL,
        details jsonb NOT NULL
      );
      INSERT INTO auth.users(id) VALUES ('${actorId}');
      INSERT INTO public.partners(id, status, owner_id) VALUES ('${partnerId}', 'approved', '${actorId}');
      INSERT INTO public.properties(id, partner_id, active) VALUES ('${propertyId}', '${partnerId}', true);
      INSERT INTO public.rooms(id, property_id, active) VALUES ('${roomId}', '${propertyId}', true);
    `);

    for (const migration of migrations) await db.exec(migration);
  });

  afterAll(async () => { await db.close(); });

  it("applies the chain, configures the OTA mapping, and keeps every sync switch disabled", async () => {
    const contracts = await db.query<{ connection_setup: boolean; ari_apply: boolean; outbox_claim: boolean; baseline_review: boolean }>(`
      SELECT
        to_regprocedure('public.irp_pms_configure_native_connection(uuid,uuid,uuid,text,uuid,uuid,text,text,text,integer,jsonb)') IS NOT NULL AS connection_setup,
        to_regprocedure('public.irp_pms_apply_native_ari(text,text,bigint,text,timestamptz,jsonb)') IS NOT NULL AS ari_apply,
        to_regprocedure('public.irp_pms_claim_configured_event(jsonb)') IS NOT NULL AS outbox_claim,
        to_regprocedure('public.irp_pms_capture_reviewed_baseline(uuid,uuid,uuid,date,integer,text)') IS NOT NULL AS baseline_review
    `);
    expect(contracts.rows[0]).toEqual({ connection_setup: true, ari_apply: true, outbox_claim: true, baseline_review: true });

    const configured = await db.query<{ result: Record<string, unknown> }>(`
      SELECT public.irp_pms_configure_native_connection(
        $1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::uuid,$7,$8,$9,$10::integer,$11::jsonb
      ) AS result
    `, [
      "55555555-5555-4555-8555-555555555555", actorId, propertyId, "redroof-ridgeland-test",
      "66666666-6666-4666-8666-666666666666", propertyId,
      "c".repeat(64), "i".repeat(16), "t".repeat(16), 1,
      JSON.stringify([{ roomTypeId: "NDQ2", ratePlanId: "BAR", otaRoomId: roomId }]),
    ]);
    expect(configured.rows[0].result).toMatchObject({
      captureEnabled: false,
      deliveryEnabled: false,
      environment: "sandbox",
      reservationConnection: { captureEnabled: false, deliveryEnabled: false, outcome: "created" },
      ariConnection: { enabled: false, mappingCount: 1 },
    });

    const switches = await db.query<{ reservation_capture: boolean; reservation_delivery: boolean; ari_enabled: boolean; mapping_count: string }>(`
      SELECT
        c.enabled AS reservation_capture,
        c.delivery_enabled AS reservation_delivery,
        a.enabled AS ari_enabled,
        (SELECT count(*)::text FROM public.irp_pms_native_ari_mappings) AS mapping_count
      FROM public.irp_pms_outbox_connections c
      JOIN public.irp_pms_native_ari_connections a USING (property_id, connection_id)
      WHERE c.property_id = $1::uuid
    `, [propertyId]);
    expect(switches.rows[0]).toEqual({
      reservation_capture: false,
      reservation_delivery: false,
      ari_enabled: false,
      mapping_count: "1",
    });

    const baseline = await db.query<{ result: { eligibleForCapture: boolean; reservationCount: number } }>(
      "SELECT public.irp_pms_preview_reservation_baseline($1::uuid,$2::date) AS result",
      [propertyId, "2026-09-25"],
    );
    expect(baseline.rows[0].result).toMatchObject({ eligibleForCapture: true, reservationCount: 0 });
  });

  it("retains the migration filenames in strictly increasing order", () => {
    const versions = migrationFiles.map((name) => name.slice(0, 12));
    expect(versions).toEqual([...versions].sort());
    expect(new Set(versions).size).toBe(versions.length);
  });
});
