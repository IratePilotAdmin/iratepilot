import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/202609240143_iratepilot_pms_baseline_review_control.sql", import.meta.url), "utf8");
const db = new PGlite();
const actor = "11111111-1111-4111-8111-111111111111";
const property = "22222222-2222-4222-8222-222222222222";
const captureRequest = "33333333-3333-4333-8333-333333333333";
const releaseRequest = "44444444-4444-4444-8444-444444444444";

describe("reviewed native PMS baseline controls", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
      CREATE TABLE public.properties(id uuid primary key);
      CREATE TABLE public.irp_pms_baseline_runs(property_id uuid primary key, request_id uuid not null, from_date date not null, snapshot_count integer not null, created_at timestamptz default now(), release_reference text, released_at timestamptz);
      CREATE TABLE public.irp_pms_outbox_connections(property_id uuid primary key, enabled boolean, environment text, delivery_enabled boolean);
      INSERT INTO auth.users VALUES ('${actor}'); INSERT INTO public.properties VALUES ('${property}');
      INSERT INTO public.irp_pms_outbox_connections VALUES ('${property}',false,'sandbox',false);
      CREATE FUNCTION public.irp_pms_preview_reservation_baseline(uuid,date) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('eligibleForCapture',true,'reservationCount',2) $$;
      CREATE FUNCTION public.irp_pms_prepare_baseline(p_property uuid,p_request uuid,p_from date,p_expected_count integer) RETURNS public.irp_pms_baseline_runs LANGUAGE plpgsql AS $$ DECLARE r public.irp_pms_baseline_runs; BEGIN INSERT INTO public.irp_pms_baseline_runs(property_id,request_id,from_date,snapshot_count) VALUES(p_property,p_request,p_from,p_expected_count) RETURNING * INTO r; UPDATE public.irp_pms_outbox_connections SET enabled=true WHERE property_id=p_property; RETURN r; END $$;
      CREATE FUNCTION public.irp_pms_release_baseline(p_property uuid,p_request uuid,p_review_reference text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN UPDATE public.irp_pms_baseline_runs SET release_reference=p_review_reference,released_at=now() WHERE property_id=p_property AND request_id=p_request; UPDATE public.irp_pms_outbox_connections SET delivery_enabled=true WHERE property_id=p_property; RETURN true; END $$;
    `);
    await db.exec(migration);
  });
  afterAll(async () => { await db.close(); });

  it("captures only the previewed count, logs admin evidence, and safely replays exact request", async () => {
    const args = [captureRequest, actor, property, "2026-10-01", 2, "maintenance-window-2026-10"];
    const first = await db.query<{ result: { replayed: boolean } }>("SELECT public.irp_pms_capture_reviewed_baseline($1::uuid,$2::uuid,$3::uuid,$4::date,$5::integer,$6::text) result", args);
    expect(first.rows[0].result.replayed).toBe(false);
    const replay = await db.query<{ result: { replayed: boolean } }>("SELECT public.irp_pms_capture_reviewed_baseline($1::uuid,$2::uuid,$3::uuid,$4::date,$5::integer,$6::text) result", args);
    expect(replay.rows[0].result.replayed).toBe(true);
    const events = await db.query<{ count: string; operation: string }>("SELECT count(*)::text count,min(operation) operation FROM public.irp_pms_baseline_review_events");
    expect(events.rows[0]).toEqual({ count: "1", operation: "capture" });
    await expect(db.query("SELECT public.irp_pms_capture_reviewed_baseline($1::uuid,$2::uuid,$3::uuid,$4::date,$5::integer,$6::text)", ["55555555-5555-4555-8555-555555555555", actor, property, "2026-10-01", 1, "another-evidence-ref"])).rejects.toMatchObject({ code: "P0001" });
  });

  it("requires a separate round-trip reference to release sandbox delivery and keeps RPC service-only", async () => {
    const result = await db.query<{ result: { released: boolean; replayed: boolean } }>("SELECT public.irp_pms_release_reviewed_baseline($1::uuid,$2::uuid,$3::uuid,$4::date,$5::integer,$6::text) result", [releaseRequest, actor, property, "2026-10-01", 2, "sandbox-roundtrip-run-42"]);
    expect(result.rows[0].result).toEqual({ released: true, replayed: false });
    const state = await db.query<{ enabled: boolean; delivery_enabled: boolean }>("SELECT enabled,delivery_enabled FROM public.irp_pms_outbox_connections WHERE property_id=$1", [property]);
    expect(state.rows[0]).toEqual({ enabled: true, delivery_enabled: true });
    const grants = await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>("SELECT has_function_privilege('anon','public.irp_pms_capture_reviewed_baseline(uuid,uuid,uuid,date,integer,text)','EXECUTE') anon, has_function_privilege('authenticated','public.irp_pms_capture_reviewed_baseline(uuid,uuid,uuid,date,integer,text)','EXECUTE') authenticated, has_function_privilege('service_role','public.irp_pms_capture_reviewed_baseline(uuid,uuid,uuid,date,integer,text)','EXECUTE') service_role");
    expect(grants.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
  });
});
