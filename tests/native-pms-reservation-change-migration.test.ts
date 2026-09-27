import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const ariMigration = await readFile(new URL("../supabase/migrations/20260923130000_iratepilot_pms_native_ari_receiver.sql", import.meta.url), "utf8");
const changeMigration = await readFile(new URL("../supabase/migrations/20260926140000_iratepilot_pms_reservation_change_receiver.sql", import.meta.url), "utf8");
const db = new PGlite();
const propertyId = "10000000-0000-4000-8000-000000000001";
const roomId = "20000000-0000-4000-8000-000000000001";
const bookingId = "40000000-0000-4000-8000-000000000001";
const connectionId = "change-test-01";
const actorId = "30000000-0000-4000-8000-000000000001";
const requestId = "50000000-0000-4000-8000-000000000001";
const reviewRequestId = "50000000-0000-4000-8000-000000000002";
const invalidPriceRequestId = "50000000-0000-4000-8000-000000000003";
const today = new Date();
const date = (days: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days).toISOString().slice(0, 10);
const oldIn = date(10);
const oldOut = date(11);
const newIn = date(11);
const newOut = date(12);

async function applyChange(id: string, digest: string, expectedVersion = 1, checkIn = newIn, checkOut = newOut) {
  return db.query<{ result: { outcome: string; reasonCode?: string; sourceVersion?: number; duplicate?: boolean } }>(
    "select public.irp_pms_apply_reservation_change($1,$2::uuid,$3,$4::uuid,$5::bigint,$6::date,$7::date,$8::integer,$9,$10) as result",
    [connectionId,id,"pms-property-redroof",bookingId,expectedVersion,checkIn,checkOut,2,actorId,digest],
  );
}

describe("native OTA reservation-change transaction", () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.partners(id uuid primary key,status text not null);
      create table public.properties(id uuid primary key,partner_id uuid not null references public.partners(id),active boolean not null);
      create table public.rooms(id uuid primary key,property_id uuid not null references public.properties(id),active boolean not null);
      create table public.inventory(room_id uuid not null,stay_date date not null,available_units integer not null,rate numeric not null,primary key(room_id,stay_date));
      create table public.bookings(
        id uuid primary key, confirmation_code text not null, customer_id uuid, property_id uuid not null,
        room_id uuid not null, check_in date not null, check_out date not null, guests integer not null,
        subtotal numeric(12,2) not null, taxes numeric(12,2) not null, fees numeric(12,2) not null,
        total numeric(12,2) not null, status text not null, updated_at timestamptz not null default now()
      );
      create table public.irp_pms_booking_versions(booking_id uuid primary key,version bigint not null);
      create table public.irp_pms_outbox(booking_id uuid not null,source_version bigint not null,property_id uuid not null,connection_id text not null,state text not null);
      create table public.irp_pms_outbox_connections(property_id uuid not null,connection_id text not null,pms_property_id text not null,enabled boolean not null);
      insert into public.partners values ('60000000-0000-4000-8000-000000000001','approved');
      insert into public.properties values ('${propertyId}','60000000-0000-4000-8000-000000000001',true);
      insert into public.rooms values ('${roomId}','${propertyId}',true);
    `);
    await db.exec(ariMigration);
    await db.exec(changeMigration);
    await db.exec(`
      insert into public.irp_pms_native_ari_connections(
        connection_id,property_id,pms_property_id,secret_ciphertext,secret_initialization_vector,
        secret_authentication_tag,secret_key_version,enabled
      ) values ('${connectionId}','${propertyId}','pms-property-redroof','${"c".repeat(32)}','${"i".repeat(16)}','${"t".repeat(16)}',1,true);
      insert into public.irp_pms_outbox_connections values ('${propertyId}','${connectionId}','pms-property-redroof',true);
      insert into public.bookings(id,confirmation_code,property_id,room_id,check_in,check_out,guests,subtotal,taxes,fees,total,status)
        values ('${bookingId}','RR-1','${propertyId}','${roomId}','${oldIn}','${oldOut}',2,100,0,5,105,'confirmed');
      insert into public.irp_pms_booking_versions values ('${bookingId}',1);
      insert into public.inventory values ('${roomId}','${oldIn}',0,100),('${roomId}','${newIn}',2,100);
      create function public.test_bump_booking_version() returns trigger language plpgsql as $$
      begin update public.irp_pms_booking_versions set version=version+1 where booking_id=new.id; return new; end $$;
      create trigger test_bump_booking_version after update on public.bookings
        for each row when (old.check_in is distinct from new.check_in or old.check_out is distinct from new.check_out)
        execute function public.test_bump_booking_version();
    `);
  });

  afterAll(async () => { await db.close(); });

  it("moves a confirmed stay atomically, preserves totals, emits a new version, and replays idempotently", async () => {
    const digest = "a".repeat(64);
    const applied = await applyChange(requestId,digest);
    expect(applied.rows[0].result).toMatchObject({ outcome: "applied", sourceVersion: 2, duplicate: false });
    const after = await db.query<{ check_in: string; check_out: string; subtotal: string; total: string }>(
      "select check_in::text,check_out::text,subtotal::text,total::text from public.bookings where id=$1", [bookingId],
    );
    expect(after.rows[0]).toEqual({ check_in: newIn, check_out: newOut, subtotal: "100.00", total: "105.00" });
    const inventory = await db.query<{ stay_date: string; available_units: number }>(
      "select stay_date::text,available_units from public.inventory where room_id=$1 order by stay_date", [roomId],
    );
    expect(inventory.rows).toEqual([{ stay_date: oldIn, available_units: 1 }, { stay_date: newIn, available_units: 1 }]);
    const replay = await applyChange(requestId,digest);
    expect(replay.rows[0].result).toMatchObject({ outcome: "applied", sourceVersion: 2, duplicate: true });
    await expect(applyChange(requestId,"b".repeat(64))).rejects.toMatchObject({ code: "23505" });
  });

  it("stores stale versions and price changes for review without mutating inventory or the reservation", async () => {
    const stale = await applyChange(reviewRequestId,"d".repeat(64),1, date(12), date(13));
    expect(stale.rows[0].result).toMatchObject({ outcome: "review", reasonCode: "source_version_conflict" });
    await db.query("insert into public.inventory values ($1,$2,2,150)", [roomId,date(13)]);
    const changedPrice = await applyChange(invalidPriceRequestId,"e".repeat(64),2,date(13),date(14));
    expect(changedPrice.rows[0].result).toMatchObject({ outcome: "review", reasonCode: "price_change_requires_review" });
    const unchanged = await db.query<{ check_in: string; check_out: string; version: number }>(
      "select b.check_in::text,b.check_out::text,v.version from public.bookings b join public.irp_pms_booking_versions v on v.booking_id=b.id where b.id=$1", [bookingId],
    );
    expect(unchanged.rows[0]).toEqual({ check_in: newIn, check_out: newOut, version: 2 });
  });
});
