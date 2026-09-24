import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/202609240145_iratepilot_pms_revenue_recommendation_generation.sql", import.meta.url),
  "utf8",
);
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const partnerId = "22222222-2222-4222-8222-222222222222";
const propertyId = "33333333-3333-4333-8333-333333333333";
const roomId = "44444444-4444-4444-8444-444444444444";
const otherOwner = "55555555-5555-4555-8555-555555555555";
const otherPartnerId = "66666666-6666-4666-8666-666666666666";
const otherPropertyId = "77777777-7777-4777-8777-777777777777";
const otherRoomId = "88888888-8888-4888-8888-888888888888";

describe("atomic revenue recommendation generation migration", () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.profiles (id uuid primary key, role text not null);
      create table public.partners (id uuid primary key, owner_id uuid not null, status text not null);
      create table public.properties (id uuid primary key, partner_id uuid not null references public.partners(id));
      create table public.rooms (id uuid primary key, property_id uuid not null references public.properties(id));
      create table public.revenue_daily_inputs (
        property_id uuid not null, room_id uuid not null, stay_date date not null,
        rooms_available integer not null, rooms_sold integer not null,
        current_rate numeric(12,2) not null, competitor_rate numeric(12,2),
        last_year_occupancy numeric(5,2), event_name text,
        unique (room_id, stay_date)
      );
      create table public.revenue_recommendations (
        id uuid primary key default gen_random_uuid(), property_id uuid not null,
        room_id uuid not null, stay_date date not null, current_rate numeric(12,2) not null,
        recommended_rate numeric(12,2) not null, occupancy_forecast numeric(5,2) not null
          check (occupancy_forecast between 0 and 100), estimated_revenue_impact numeric(12,2) not null,
        reason text not null, status text not null default 'pending'
          check (status in ('pending','approved','rejected','superseded')),
        reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz not null default now()
      );
      create unique index one_pending_revenue_recommendation
        on public.revenue_recommendations(room_id, stay_date) where status = 'pending';
      create table public.revenue_audit_log (
        id uuid primary key default gen_random_uuid(), property_id uuid not null,
        recommendation_id uuid, actor_id uuid, action text not null,
        details jsonb not null default '{}', created_at timestamptz not null default now()
      );
    `);
    await db.exec(migration);
    await db.query("insert into public.partners values ($1, $2, 'approved')", [partnerId, owner]);
    await db.query("insert into public.properties values ($1, $2)", [propertyId, partnerId]);
    await db.query("insert into public.rooms values ($1, $2)", [roomId, propertyId]);
    await db.query("insert into public.profiles values ($1, 'partner')", [owner]);
    await db.query("insert into public.partners values ($1, $2, 'approved')", [otherPartnerId, otherOwner]);
    await db.query("insert into public.properties values ($1, $2)", [otherPropertyId, otherPartnerId]);
    await db.query("insert into public.rooms values ($1, $2)", [otherRoomId, otherPropertyId]);
  });

  beforeEach(async () => {
    await db.exec("truncate public.revenue_audit_log, public.revenue_recommendations, public.revenue_daily_inputs restart identity");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    await db.query(`insert into public.revenue_daily_inputs
      (property_id, room_id, stay_date, rooms_available, rooms_sold, current_rate, competitor_rate, last_year_occupancy, event_name)
      values ($1, $2, '2026-10-15', 10, 8, 120, 150, 70, 'Local concert')`, [propertyId, roomId]);
  });

  afterAll(async () => { await db.close(); });

  it("calculates the 90-day recommendations, replaces old pending rows, and records an audit receipt", async () => {
    await db.query(`insert into public.revenue_recommendations
      (property_id, room_id, stay_date, current_rate, recommended_rate, occupancy_forecast, estimated_revenue_impact, reason)
      values ($1, $2, '2026-10-15', 100, 110, 70, 10, 'old synthetic recommendation')`, [propertyId, roomId]);

    const result = await db.query<{ generate_revenue_recommendations: number }>(
      "select public.generate_revenue_recommendations($1, '2026-10-01', '2026-12-29')",
      [propertyId],
    );
    expect(result.rows[0].generate_revenue_recommendations).toBe(1);
    const recommendations = await db.query<{ status: string; recommended_rate: string; occupancy_forecast: string; estimated_revenue_impact: string; reason: string }>(
      "select status, recommended_rate, occupancy_forecast, estimated_revenue_impact, reason from public.revenue_recommendations order by created_at, id",
    );
    expect(recommendations.rows.map(row => row.status)).toEqual(["superseded", "pending"]);
    expect(recommendations.rows[1]).toMatchObject({
      status: "pending", recommended_rate: "142.00", occupancy_forecast: "75.00",
      estimated_revenue_impact: "44.00",
      reason: "Based on 80% booking occupancy, competitors are priced higher, demand event: Local concert. Manager approval is required.",
    });
    const audit = await db.query<{ actor_id: string; action: string; details: { count: number } }>(
      "select actor_id, action, details from public.revenue_audit_log",
    );
    expect(audit.rows).toEqual([{ actor_id: owner, action: "recommendations_generated", details: { count: 1, window_days: 90 } }]);
  });

  it("rolls back superseding and audit writes if inserting recommendations fails", async () => {
    await db.query(`insert into public.revenue_recommendations
      (property_id, room_id, stay_date, current_rate, recommended_rate, occupancy_forecast, estimated_revenue_impact, reason)
      values ($1, $2, '2026-10-15', 100, 110, 70, 10, 'old synthetic recommendation')`, [propertyId, roomId]);
    await db.exec(`create function public.fail_recommendation_insert() returns trigger language plpgsql as $$
      begin raise exception 'synthetic insert failure'; end
    $$; create trigger fail_recommendation_insert before insert on public.revenue_recommendations
      for each row execute function public.fail_recommendation_insert()`);

    try {
      await expect(db.query(
        "select public.generate_revenue_recommendations($1, '2026-10-01', '2026-12-29')",
        [propertyId],
      )).rejects.toThrow("synthetic insert failure");
    } finally {
      await db.exec("drop trigger fail_recommendation_insert on public.revenue_recommendations; drop function public.fail_recommendation_insert()");
    }
    const state = await db.query<{ status: string; count: number }>(`
      select (select status from public.revenue_recommendations limit 1) as status,
        (select count(*)::int from public.revenue_recommendations) as count
    `);
    expect(state.rows[0]).toEqual({ status: "pending", count: 1 });
    const auditCount = await db.query<{ count: number }>("select count(*)::int as count from public.revenue_audit_log");
    expect(auditCount.rows[0].count).toBe(0);
  });

  it("rejects unauthorized callers and malformed date windows", async () => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", ["99999999-9999-4999-8999-999999999999"]);
    await expect(db.query(
      "select public.generate_revenue_recommendations($1, '2026-10-01', '2026-12-29')",
      [propertyId],
    )).rejects.toThrow("Not authorized");

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    await expect(db.query(
      "select public.generate_revenue_recommendations($1, '2026-10-01', '2026-10-02')",
      [propertyId],
    )).rejects.toThrow("A complete 90-day date window is required");
    const recommendationCount = await db.query<{ count: number }>("select count(*)::int as count from public.revenue_recommendations");
    expect(recommendationCount.rows[0].count).toBe(0);
  });

  it("prevents cross-property rooms from being written to revenue inputs or recommendations", async () => {
    await expect(db.query(`insert into public.revenue_daily_inputs
      (property_id, room_id, stay_date, rooms_available, rooms_sold, current_rate)
      values ($1, $2, '2026-10-16', 10, 1, 120)`, [propertyId, otherRoomId]))
      .rejects.toThrow("Revenue room must belong to the selected property");
    await expect(db.query(`insert into public.revenue_recommendations
      (property_id, room_id, stay_date, current_rate, recommended_rate, occupancy_forecast, estimated_revenue_impact, reason)
      values ($1, $2, '2026-10-16', 100, 110, 70, 10, 'synthetic cross-property row')`, [propertyId, otherRoomId]))
      .rejects.toThrow("Revenue room must belong to the selected property");
  });

  it("limits execution to authenticated callers and leaves pending rows unchanged when the window has no inputs", async () => {
    const privileges = await db.query<{ anon: boolean; authenticated: boolean }>(`
      select has_function_privilege('anon', 'public.generate_revenue_recommendations(uuid,date,date)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.generate_revenue_recommendations(uuid,date,date)', 'execute') as authenticated
    `);
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: true });
    await db.query(`insert into public.revenue_recommendations
      (property_id, room_id, stay_date, current_rate, recommended_rate, occupancy_forecast, estimated_revenue_impact, reason)
      values ($1, $2, '2026-10-15', 100, 110, 70, 10, 'old synthetic recommendation')`, [propertyId, roomId]);

    const noRows = await db.query<{ generate_revenue_recommendations: number }>(
      "select public.generate_revenue_recommendations($1, '2026-11-01', '2027-01-29')",
      [propertyId],
    );
    expect(noRows.rows[0].generate_revenue_recommendations).toBe(0);
    const unchanged = await db.query<{ status: string }>("select status from public.revenue_recommendations");
    expect(unchanged.rows).toEqual([{ status: "pending" }]);
  });
});
