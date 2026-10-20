import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/202609070139_iratepilot_pms_transactional_outbox.sql", import.meta.url),
  "utf8",
);
const connectorGuide = readFileSync(new URL("../docs/IRATEPILOT-NATIVE-PMS-CONNECTOR.md", import.meta.url), "utf8");
const followupMigrations = [
  "202609070140_iratepilot_pms_baseline_activation.sql",
  "202609070141_iratepilot_pms_delivery_control.sql",
  "202609070157_iratepilot_pms_scoped_source_claim.sql",
  "202609070158_iratepilot_pms_scoped_source_claim_identity.sql",
].map((name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
const db = new PGlite();
const property = "11111111-1111-4111-8111-111111111111";
const booking = "22222222-2222-4222-8222-222222222222";

describe("native PMS reservation outbox booking lifecycle", () => {
  it("documents cancellation as a reservation event, not a payment refund", () => {
    expect(connectorGuide).toContain("a cancellation cannot overtake an unacknowledged modification");
    expect(connectorGuide).toContain("it does not authorize a refund, reverse a payment, or settle a folio");
  });

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.properties (id uuid PRIMARY KEY);
      CREATE TABLE public.bookings (
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
        status text NOT NULL,
        internal_note text
      );
    `);
    await db.exec(migration);
    for (const followup of followupMigrations) await db.exec(followup);
    await db.query("INSERT INTO public.properties(id) VALUES ($1::uuid)", [property]);
    await db.query(`
      INSERT INTO public.irp_pms_outbox_connections(property_id,connection_id,tenant_id,pms_property_id)
      VALUES ($1::uuid,'test-hotel','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444')
    `, [property]);
  });

  afterAll(async () => { await db.close(); });

  it("captures create, stay modification, and cancellation as ordered versioned events", async () => {
    const insert = () => db.query(`
      INSERT INTO public.bookings(id,confirmation_code,customer_id,property_id,room_id,check_in,check_out,guests,subtotal,taxes,fees,total,status)
      VALUES ($1::uuid,'RP-TEST','55555555-5555-4555-8555-555555555555',$2::uuid,'66666666-6666-4666-8666-666666666666',DATE '2026-10-01',DATE '2026-10-03',2,200,20,5,225,'confirmed')
    `, [booking, property]);

    await insert();
    const disabled = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM public.irp_pms_outbox");
    expect(disabled.rows[0].count).toBe("0");

    await db.query("DELETE FROM public.bookings WHERE id=$1::uuid", [booking]);
    await db.query("UPDATE public.irp_pms_outbox_connections SET enabled=true,delivery_enabled=true WHERE property_id=$1::uuid", [property]);
    await insert();
    await db.query("UPDATE public.bookings SET check_in=DATE '2026-10-02' WHERE id=$1::uuid", [booking]);
    await db.query("UPDATE public.bookings SET status='cancelled' WHERE id=$1::uuid", [booking]);

    const events = await db.query<{ source_version: string; event_payload: { sourceVersion: number; booking: { check_in: string; status: string } } }>(`
      SELECT source_version::text, event_payload FROM public.irp_pms_outbox
      WHERE booking_id=$1::uuid ORDER BY source_version
    `, [booking]);
    expect(events.rows).toHaveLength(3);
    expect(events.rows.map((row) => Number(row.source_version))).toEqual([1, 2, 3]);
    expect(events.rows.map((row) => row.event_payload.sourceVersion)).toEqual([1, 2, 3]);
    expect(events.rows.map((row) => row.event_payload.booking.check_in)).toEqual(["2026-10-01", "2026-10-02", "2026-10-02"]);
    expect(events.rows.map((row) => row.event_payload.booking.status)).toEqual(["confirmed", "confirmed", "cancelled"]);

    await db.query("UPDATE public.bookings SET internal_note='front desk note' WHERE id=$1::uuid", [booking]);
    const unchangedPayload = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM public.irp_pms_outbox WHERE booking_id=$1::uuid", [booking]);
    expect(unchangedPayload.rows[0].count).toBe("3");
  });

  it("does not let a later cancellation overtake a delayed earlier modification", async () => {
    const scope = JSON.stringify([{
      connection_id: "test-hotel",
      property_id: property,
      tenant_id: "33333333-3333-4333-8333-333333333333",
      pms_property_id: "44444444-4444-4444-8444-444444444444",
    }]);
    await db.query("UPDATE public.irp_pms_outbox SET state='delivered' WHERE booking_id=$1::uuid AND source_version=1", [booking]);
    await db.query(`UPDATE public.irp_pms_outbox SET state='retry',due_at=clock_timestamp()+interval '1 hour'
      WHERE booking_id=$1::uuid AND source_version=2`, [booking]);

    const blocked = await db.query<{ source_version: string }>(
      "SELECT source_version::text FROM public.irp_pms_claim_configured_event($1::jsonb)", [scope],
    );
    expect(blocked.rows).toHaveLength(0);

    await db.query(`UPDATE public.irp_pms_outbox SET due_at=clock_timestamp()-interval '1 second'
      WHERE booking_id=$1::uuid AND source_version=2`, [booking]);
    const first = await db.query<{ event_id: string; source_version: string; lease_token: string }>(
      "SELECT event_id::text,source_version::text,lease_token::text FROM public.irp_pms_claim_configured_event($1::jsonb)", [scope],
    );
    expect(first.rows.map((row) => Number(row.source_version))).toEqual([2]);
    await db.query("SELECT public.irp_pms_finish_event($1::uuid,$2::uuid,'acknowledged','reservation-staged')",
      [first.rows[0].event_id, first.rows[0].lease_token]);

    const next = await db.query<{ source_version: string; event_payload: { booking: { status: string } } }>(
      "SELECT source_version::text,event_payload FROM public.irp_pms_claim_configured_event($1::jsonb)", [scope],
    );
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]).toMatchObject({ source_version: "3", event_payload: { booking: { status: "cancelled" } } });
  });
});
