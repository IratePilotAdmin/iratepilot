import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createReservationChangePostHandler } from "../app/api/pms/reservation-changes/route";
import type { createAdminClient } from "../lib/supabase/admin";

const secret = "route-integration-secret-with-at-least-thirty-two-bytes";
const connectionId = "route-integration-01";
const pmsProperty = "pms-property-route-test";
const propertyId = "10000000-0000-4000-8000-000000000001";
const roomId = "20000000-0000-4000-8000-000000000001";
const bookingId = "40000000-0000-4000-8000-000000000001";
const actorId = "30000000-0000-4000-8000-000000000001";
const requestId = "50000000-0000-4000-8000-000000000001";
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const oldIn = day(10), oldOut = day(11), newIn = day(11), newOut = day(12);
const db = new PGlite();

function makeRequest(value: object) {
  const body = JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${connectionId}.${body}`).digest("hex");
  return new Request("https://www.iratepilot.com/api/pms/reservation-changes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-irp-connection": connectionId,
      "x-irp-timestamp": timestamp,
      "x-irp-signature": signature,
    },
    body,
  });
}

const admin = {
  from(table: string) {
    let selected = "*", connection = "";
    return {
      select(columns: string) { selected = columns; return this; },
      eq(column: string, value: string) { if (column !== "connection_id") throw new Error("unexpected filter"); connection = value; return this; },
      async maybeSingle() {
        const result = await db.query<Record<string, unknown>>(
          `select ${selected} from ${table} where connection_id = $1 limit 1`, [connection],
        );
        return { data: result.rows[0] ?? null, error: null };
      },
    };
  },
  async rpc(name: string, args: Record<string, string | number>) {
    if (name !== "irp_pms_apply_reservation_change") return { data: null, error: new Error("unexpected RPC") };
    try {
      const result = await db.query<{ result: unknown }>(
        "select public.irp_pms_apply_reservation_change($1,$2::uuid,$3,$4::uuid,$5::bigint,$6::date,$7::date,$8::integer,$9,$10) as result",
        [args.p_connection,args.p_request,args.p_property,args.p_booking,args.p_expected_source_version,args.p_check_in,args.p_check_out,args.p_guests,args.p_approved_by,args.p_payload_digest],
      );
      return { data: result.rows[0].result, error: null };
    } catch (error) { return { data: null, error }; }
  },
};

const post = createReservationChangePostHandler({
  createAdminClient: (() => admin as never) as typeof createAdminClient,
  decryptPmsCredentials: (() => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: secret })) as never,
  enabled: () => true,
});

describe("actual Next.js reservation-change route with the source PostgreSQL migrations", () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.partners(id uuid primary key,status text not null);
      create table public.properties(id uuid primary key,partner_id uuid not null references public.partners(id),active boolean not null);
      create table public.rooms(id uuid primary key,property_id uuid not null references public.properties(id),active boolean not null);
      create table public.inventory(room_id uuid not null,stay_date date not null,available_units integer not null,rate numeric not null,primary key(room_id,stay_date));
      create table public.bookings(
        id uuid primary key,confirmation_code text not null,customer_id uuid,property_id uuid not null,room_id uuid not null,
        check_in date not null,check_out date not null,guests integer not null,subtotal numeric(12,2) not null,
        taxes numeric(12,2) not null,fees numeric(12,2) not null,total numeric(12,2) not null,status text not null,
        updated_at timestamptz not null default now()
      );
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/202609070139_iratepilot_pms_transactional_outbox.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260923130000_iratepilot_pms_native_ari_receiver.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20260926140000_iratepilot_pms_reservation_change_receiver.sql", import.meta.url), "utf8"));
    await db.query("insert into public.partners values ($1,'approved')", ["60000000-0000-4000-8000-000000000001"]);
    await db.query("insert into public.properties values ($1,$2,true)",[propertyId,"60000000-0000-4000-8000-000000000001"]);
    await db.query("insert into public.rooms values ($1,$2,true)",[roomId,propertyId]);
    await db.query(`insert into public.irp_pms_native_ari_connections(
      connection_id,property_id,pms_property_id,secret_ciphertext,secret_initialization_vector,secret_authentication_tag,enabled
    ) values ($1,$2,$3,$4,$5,$6,true)`,[connectionId,propertyId,pmsProperty,"c".repeat(32),"i".repeat(16),"t".repeat(16)]);
    await db.query("insert into public.irp_pms_outbox_connections(property_id,connection_id,tenant_id,pms_property_id,enabled) values ($1,$2,'tenant-route',$3,true)",[propertyId,connectionId,pmsProperty]);
    await db.query("insert into public.bookings(id,confirmation_code,property_id,room_id,check_in,check_out,guests,subtotal,taxes,fees,total,status) values ($1,'TEST-1',$2,$3,$4,$5,2,100,0,0,100,'confirmed')",[bookingId,propertyId,roomId,oldIn,oldOut]);
    await db.query("insert into public.inventory values ($1,$2,0,100),($1,$3,1,100)",[roomId,oldIn,newIn]);
  }, 30_000);

  afterAll(async () => { await db.close(); });

  it("runs signed route authentication, the real atomic RPC and OTA outbox trigger; exact replay does not mutate twice", async () => {
    const command = {
      contractVersion: 1, requestId, connectionId, propertyId: pmsProperty, bookingId,
      expectedSourceVersion: 1, generatedAt: new Date().toISOString(), approvedBy: actorId,
      stay: { checkIn: newIn, checkOut: newOut, guests: 2 },
    };
    const response = await post(makeRequest(command));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "applied", requestId, sourceVersion: 2, duplicate: false });

    const afterFirst = await db.query<{ check_in: string; check_out: string; version: number; outbox_count: number }>(`
      select b.check_in::text,b.check_out::text,v.version,
        (select count(*)::integer from public.irp_pms_outbox o where o.booking_id=b.id) as outbox_count
      from public.bookings b join public.irp_pms_booking_versions v on v.booking_id=b.id where b.id=$1
    `,[bookingId]);
    expect(afterFirst.rows[0]).toEqual({ check_in: newIn, check_out: newOut, version: 2, outbox_count: 2 });

    const replay = await post(makeRequest(command));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ outcome: "applied", requestId, sourceVersion: 2, duplicate: true });
    const afterReplay = await db.query<{ version: number; outbox_count: number }>(`
      select v.version,(select count(*)::integer from public.irp_pms_outbox o where o.booking_id=v.booking_id) as outbox_count
      from public.irp_pms_booking_versions v where v.booking_id=$1
    `,[bookingId]);
    expect(afterReplay.rows[0]).toEqual({ version: 2, outbox_count: 2 });
  });
});
