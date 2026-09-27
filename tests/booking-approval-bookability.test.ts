import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const latestReviewMigration = readFileSync(new URL("../supabase/migrations/202608020023_expire_stale_booking_requests.sql", import.meta.url), "utf8");
const hardeningMigration = readFileSync(new URL("../supabase/migrations/20260926120000_recheck_property_state_on_booking_approval.sql", import.meta.url), "utf8");
const rollbackMigration = readFileSync(new URL("../supabase/rollbacks/20260926120000_recheck_property_state_on_booking_approval.rollback.sql", import.meta.url), "utf8");
const owner = "11111111-1111-4111-8111-111111111111";
const customer = "22222222-2222-4222-8222-222222222222";
const partner = "33333333-3333-4333-8333-333333333333";
const property = "44444444-4444-4444-8444-444444444444";
const room = "55555555-5555-4555-8555-555555555555";

describe("booking approval verifies current property bookability", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${owner}'::uuid $$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text NOT NULL, membership_status text, membership_tier text, reward_points integer NOT NULL DEFAULT 0);
      CREATE TABLE public.partners(id uuid PRIMARY KEY, owner_id uuid NOT NULL, status text NOT NULL);
      CREATE TABLE public.properties(id uuid PRIMARY KEY, partner_id uuid NOT NULL, active boolean NOT NULL);
      CREATE TABLE public.rooms(id uuid PRIMARY KEY, property_id uuid NOT NULL, active boolean NOT NULL);
      CREATE TABLE public.inventory(room_id uuid NOT NULL, stay_date date NOT NULL, available_units integer NOT NULL, PRIMARY KEY(room_id, stay_date));
      CREATE TABLE public.bookings(id uuid PRIMARY KEY, confirmation_code text NOT NULL, customer_id uuid NOT NULL, property_id uuid NOT NULL, room_id uuid NOT NULL, check_in date NOT NULL, check_out date NOT NULL, subtotal numeric(12,2) NOT NULL, status text NOT NULL, cancellation_reason text, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.booking_status_history(booking_id uuid NOT NULL);
      CREATE TABLE public.booking_financials(booking_id uuid PRIMARY KEY, partner_id uuid NOT NULL, gross_room_revenue numeric(12,2) NOT NULL, partner_commission numeric(12,2) NOT NULL, partner_net numeric(12,2) NOT NULL, status text NOT NULL);
      CREATE TABLE public.reward_ledger(user_id uuid NOT NULL, booking_id uuid NOT NULL, points integer NOT NULL, description text NOT NULL);
      CREATE TABLE public.notifications(user_id uuid NOT NULL, title text NOT NULL, body text NOT NULL);
      INSERT INTO public.partners VALUES ('${partner}', '${owner}', 'approved');
      INSERT INTO public.properties VALUES ('${property}', '${partner}', true);
      INSERT INTO public.rooms VALUES ('${room}', '${property}', true);
      INSERT INTO public.profiles(id, role, membership_status, membership_tier) VALUES ('${owner}', 'partner', 'inactive', 'none'), ('${customer}', 'customer', 'inactive', 'none');
    `);

    // Apply the production function source extracted from migration 015. The
    // latest additive migration then replaces it with the live-bookability gate.
    const functionBody = latestReviewMigration.match(/create or replace function public\.review_booking\([\s\S]*?\$\$;/i)?.[0];
    if (!functionBody) throw new Error("Could not locate the production review_booking function.");
    await db.exec(functionBody);
    await db.exec(hardeningMigration);
  }, 30_000);

  afterAll(async () => { await db.close(); });

  async function request(id: string, dates = ["2026-10-01", "2026-10-02"]) {
    await db.query("INSERT INTO public.inventory(room_id, stay_date, available_units) SELECT $1::uuid, night::date, 1 FROM generate_series($2::date, $3::date - 1, interval '1 day') AS night", [room, dates[0], dates[1]]);
    await db.query("INSERT INTO public.bookings(id,confirmation_code,customer_id,property_id,room_id,check_in,check_out,subtotal,status) VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6::date,$7::date,200,'pending')", [id, `IRP-${id.slice(0, 4)}`, customer, property, room, dates[0], dates[1]]);
  }

  it("approves a pending stay only while the partner, property and room are active", async () => {
    const bookingId = "66666666-6666-4666-8666-666666666666";
    await request(bookingId, ["2026-10-01", "2026-10-03"]);
    const approved = await db.query<{ status: string }>("SELECT (public.review_booking($1::uuid,'approve',NULL)).status", [bookingId]);
    expect(approved.rows[0].status).toBe("confirmed");
    const inventory = await db.query<{ available_units: number }>("SELECT available_units FROM public.inventory WHERE room_id=$1::uuid ORDER BY stay_date", [room]);
    expect(inventory.rows.map((row) => row.available_units)).toEqual([0, 0]);
  });

  it("refuses approval when the property is deactivated after the request", async () => {
    const bookingId = "77777777-7777-4777-8777-777777777777";
    await request(bookingId, ["2026-10-10", "2026-10-11"]);
    await db.query("UPDATE public.properties SET active=false WHERE id=$1::uuid", [property]);
    await expect(db.query("SELECT public.review_booking($1::uuid,'approve',NULL)", [bookingId])).rejects.toThrow(/no longer active for booking/);
    const booking = await db.query<{ status: string }>("SELECT status FROM public.bookings WHERE id=$1::uuid", [bookingId]);
    const inventory = await db.query<{ available_units: number }>("SELECT available_units FROM public.inventory WHERE room_id=$1::uuid AND stay_date >= DATE '2026-10-10' ORDER BY stay_date", [room]);
    expect(booking.rows[0].status).toBe("pending");
    expect(inventory.rows.map((row) => row.available_units)).toEqual([1]);
  });

  it("preserves automatic expiry when a request reaches check-in before approval", async () => {
    const bookingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await db.query("INSERT INTO public.inventory(room_id, stay_date, available_units) VALUES ($1::uuid,current_date,1)", [room]);
    await db.query("INSERT INTO public.bookings(id,confirmation_code,customer_id,property_id,room_id,check_in,check_out,subtotal,status) VALUES ($1::uuid,'IRP-EXPIRED',$2::uuid,$3::uuid,$4::uuid,current_date,current_date+1,200,'pending')", [bookingId, customer, property, room]);
    const expired = await db.query<{ status: string; cancellation_reason: string }>("SELECT (reviewed.result).status,(reviewed.result).cancellation_reason FROM (SELECT public.review_booking($1::uuid,'approve',NULL) AS result) AS reviewed", [bookingId]);
    expect(expired.rows[0]).toMatchObject({ status: "cancelled", cancellation_reason: "Booking request expired before partner approval" });
    const inventory = await db.query<{ available_units: number }>("SELECT available_units FROM public.inventory WHERE room_id=$1::uuid AND stay_date=current_date", [room]);
    expect(inventory.rows[0].available_units).toBe(1);
    const notification = await db.query<{ title: string }>("SELECT title FROM public.notifications WHERE user_id=$1::uuid ORDER BY title", [customer]);
    expect(notification.rows.map((row) => row.title)).toContain("Booking request expired");
  });

  it("refuses approval when the selected room is deactivated after the request", async () => {
    const bookingId = "88888888-8888-4888-8888-888888888888";
    await request(bookingId, ["2026-10-20", "2026-10-21"]);
    await db.query("UPDATE public.properties SET active=true WHERE id=$1::uuid", [property]);
    await db.query("UPDATE public.rooms SET active=false WHERE id=$1::uuid", [room]);
    await expect(db.query("SELECT public.review_booking($1::uuid,'approve',NULL)", [bookingId])).rejects.toThrow(/no longer active for booking/);
    const booking = await db.query<{ status: string }>("SELECT status FROM public.bookings WHERE id=$1::uuid", [bookingId]);
    const inventory = await db.query<{ available_units: number }>("SELECT available_units FROM public.inventory WHERE room_id=$1::uuid AND stay_date=DATE '2026-10-20'", [room]);
    expect(booking.rows[0].status).toBe("pending");
    expect(inventory.rows[0].available_units).toBe(1);
  });

  it("can apply the standalone rollback without changing reservation or inventory data", async () => {
    await db.query("UPDATE public.properties SET active=true WHERE id=$1::uuid", [property]);
    await db.query("UPDATE public.rooms SET active=true WHERE id=$1::uuid", [room]);
    await db.exec(rollbackMigration);
    await request("99999999-9999-4999-8999-999999999999", ["2026-10-30", "2026-10-31"]);
    const approved = await db.query<{ status: string }>("SELECT (public.review_booking('99999999-9999-4999-8999-999999999999'::uuid,'approve',NULL)).status");
    expect(approved.rows[0].status).toBe("confirmed");
    const inventory = await db.query<{ available_units: number }>("SELECT available_units FROM public.inventory WHERE room_id=$1::uuid AND stay_date=DATE '2026-10-30'", [room]);
    expect(inventory.rows[0].available_units).toBe(0);
  });
});
