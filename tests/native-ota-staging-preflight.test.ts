import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const preflight = await readFile(new URL("../supabase/verification/20260925_native_ota_staging_preflight.sql", import.meta.url), "utf8");
const db = new PGlite();

describe("native OTA staging migration preflight", () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create table public.partners(id uuid primary key, status text not null, owner_id uuid);
      create table public.properties(id uuid primary key, partner_id uuid not null references public.partners(id), active boolean not null);
      create table public.rooms(id uuid primary key, property_id uuid not null references public.properties(id), active boolean not null);
      create table public.inventory(room_id uuid not null, stay_date date not null, available_units integer not null, rate numeric not null);
      create table public.bookings(id uuid primary key, confirmation_code text, customer_id uuid, property_id uuid, room_id uuid, check_in date, check_out date, guests integer, subtotal numeric, taxes numeric, fees numeric, total numeric, status text);
      create table public.profiles(id uuid primary key, full_name text, role text);
      create table public.revenue_daily_inputs(property_id uuid, room_id uuid, stay_date date, rooms_available integer, rooms_sold integer, current_rate numeric, competitor_rate numeric, event_name text);
      create table public.revenue_recommendations(property_id uuid, room_id uuid, stay_date date, current_rate numeric, recommended_rate numeric, occupancy_forecast numeric, estimated_revenue_impact numeric, reason text, status text);
    `);
  });

  afterAll(async () => { await db.close(); });

  it("recognizes a compatible base schema while stopping before absent connector tables", async () => {
    const result = await db.query<{ migration_preflight: {
      tables: Array<{ table: string; relationPresent: boolean; missingColumns: string[] }>;
      platform: Record<string, boolean>;
      revenueIntegrity: Record<string, number>;
      migrationHistory: { ledgerPresent: boolean; nativeVersions: string[]; nativeMigrationCount: number; expectedNativeMigrationCount: number };
    } }>(preflight);
    const report = result.rows[0].migration_preflight;
    const tables = Object.fromEntries(report.tables.map(item => [item.table, item]));

    for (const table of ["properties", "partners", "rooms", "inventory", "bookings", "profiles", "revenue_daily_inputs", "revenue_recommendations"]) {
      expect(tables[table]).toMatchObject({ relationPresent: true, missingColumns: [] });
    }
    for (const table of ["irp_pms_outbox_connections", "irp_pms_booking_versions", "irp_pms_outbox"]) {
      expect(tables[table]?.relationPresent).toBe(false);
      expect(tables[table]?.missingColumns.length).toBeGreaterThan(0);
    }
    expect(report.platform).toMatchObject({
      auth_users_present: true,
      auth_uid_present: true,
      anon_role_present: true,
      authenticated_role_present: true,
      service_role_present: true,
    });
    expect(report.revenueIntegrity).toEqual({ invalid_revenue_input_room_rows: 0, invalid_recommendation_room_rows: 0 });
    expect(report.migrationHistory).toEqual({
      ledgerPresent: false,
      nativeVersions: [],
      nativeMigrationCount: 0,
      expectedNativeMigrationCount: 12,
    });
  });

  it("reports only native migration versions present in the Supabase ledger", async () => {
    await db.exec(`
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
      INSERT INTO supabase_migrations.schema_migrations(version) VALUES
        ('202609070139'), ('202609070140'), ('202609240145'), ('unrelated-version');
    `);
    const result = await db.query<{ migration_preflight: {
      migrationHistory: { ledgerPresent: boolean; nativeVersions: string[]; nativeMigrationCount: number; expectedNativeMigrationCount: number };
    } }>(preflight);
    expect(result.rows[0].migration_preflight.migrationHistory).toEqual({
      ledgerPresent: true,
      nativeVersions: ["202609070139", "202609070140", "202609240145"],
      nativeMigrationCount: 3,
      expectedNativeMigrationCount: 12,
    });
  });
});
