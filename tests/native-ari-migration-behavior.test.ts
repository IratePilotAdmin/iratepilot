import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/202609230140_iratepilot_pms_native_ari_receiver.sql", import.meta.url), "utf8");
const db = new PGlite();
const propertyId = "10000000-0000-4000-8000-000000000001";
const otaRoomId = "20000000-0000-4000-8000-000000000001";
const actorId = "30000000-0000-4000-8000-000000000001";
const bookingId = "40000000-0000-4000-8000-000000000001";
const connectionId = "redroof-native-01";
const activationRequestId = "50000000-0000-4000-8000-000000000001";
const disableRequestId = "50000000-0000-4000-8000-000000000002";

async function sqlCode(work: () => Promise<unknown>, code: string) {
  try { await work(); }
  catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected PostgreSQL error ${code}.`);
}

describe("native OTA ARI migration behavior", () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.partners(id uuid primary key, status text not null);
      create table public.properties(id uuid primary key, partner_id uuid not null references public.partners(id), active boolean not null);
      create table public.rooms(id uuid primary key, property_id uuid not null references public.properties(id), active boolean not null);
      create table public.inventory(room_id uuid not null, stay_date date not null, available_units integer not null, rate numeric not null, primary key(room_id,stay_date));
      create table public.bookings(id uuid primary key, property_id uuid not null, room_id uuid not null, status text not null, check_in date not null, check_out date not null);
      create table public.irp_pms_booking_versions(booking_id uuid not null, version bigint not null);
      create table public.irp_pms_outbox(booking_id uuid not null, source_version bigint not null, property_id uuid not null, connection_id text not null, state text not null);
      create table public.irp_pms_outbox_connections(property_id uuid not null, connection_id text not null, pms_property_id text not null, enabled boolean not null);
      insert into auth.users values ('${actorId}');
      insert into public.partners values ('60000000-0000-4000-8000-000000000001','approved');
      insert into public.properties values ('${propertyId}','60000000-0000-4000-8000-000000000001',true);
      insert into public.rooms values ('${otaRoomId}','${propertyId}',true);
    `);
    await db.exec(migration);
  });

  afterAll(async () => { await db.close(); });

  it("saves mappings disabled, gates activation, applies inventory idempotently, and audits disable", async () => {
    const saved = await db.query<{ result: { enabled: boolean; mappingCount: number } }>(
      "select public.irp_pms_save_native_ari_connection($1,$2::uuid,$3,$4,$5,$6,$7::integer,$8::jsonb) as result",
      [connectionId, propertyId, "pms-property-redroof", "c".repeat(64), "i".repeat(16), "t".repeat(16), 1,
        JSON.stringify([{ roomTypeId: "ndq2", ratePlanId: "bar", otaRoomId }])],
    );
    expect(saved.rows[0].result).toMatchObject({ enabled: false, mappingCount: 1 });

    const activationArgs = [activationRequestId, connectionId, true, actorId, "sandbox-case-20260923"];
    await sqlCode(() => db.query(
      "select public.irp_pms_set_native_ari_enabled($1::uuid,$2,$3,$4::uuid,$5)", activationArgs,
    ), "42501");
    const stillDisabled = await db.query<{ enabled: boolean }>(
      "select enabled from public.irp_pms_native_ari_connections where connection_id=$1", [connectionId],
    );
    expect(stillDisabled.rows[0].enabled).toBe(false);
    const noAuditOnRejectedActivation = await db.query<{ count: string }>(
      "select count(*)::text as count from public.irp_pms_native_ari_activation_events",
    );
    expect(noAuditOnRejectedActivation.rows[0].count).toBe("0");

    await db.query("insert into public.irp_pms_outbox_connections values ($1,$2,$3,true)", [propertyId, connectionId, "pms-property-redroof"]);
    const enabled = await db.query<{ result: { enabled: boolean; outcome: string } }>(
      "select public.irp_pms_set_native_ari_enabled($1::uuid,$2,$3,$4::uuid,$5) as result", activationArgs,
    );
    expect(enabled.rows[0].result).toMatchObject({ enabled: true, outcome: "updated" });
    const replay = await db.query<{ result: { enabled: boolean; outcome: string } }>(
      "select public.irp_pms_set_native_ari_enabled($1::uuid,$2,$3,$4::uuid,$5) as result", activationArgs,
    );
    expect(replay.rows[0].result).toMatchObject({ enabled: true, outcome: "duplicate" });
    await sqlCode(() => db.query(
      "select public.irp_pms_set_native_ari_enabled($1::uuid,$2,$3,$4::uuid,$5)",
      [activationRequestId, connectionId, true, actorId, "different-reference"],
    ), "23505");

    const stayDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const followingDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await db.query("insert into public.bookings values ($1,$2,$3,'pending',$4,$5)", [bookingId, propertyId, otaRoomId, stayDate, followingDate]);
    await db.query("insert into public.irp_pms_booking_versions values ($1,1)", [bookingId]);
    await db.query("insert into public.irp_pms_outbox values ($1,1,$2,$3,'pending')", [bookingId, propertyId, connectionId]);
    const payload = [{ date: stayDate, roomTypeId: "ndq2", ratePlanId: "bar", available: 3, rateMinor: 10750, currency: "USD", minimumStay: 1, maximumStay: null, restrictions: [] }];
    const applied = await db.query<{ result: { outcome: string } }>(
      "select public.irp_pms_apply_native_ari($1,$2,$3,$4,$5::timestamptz,$6::jsonb) as result",
      [connectionId, "ari-event-1", 1, "a".repeat(64), new Date().toISOString(), JSON.stringify(payload)],
    );
    expect(applied.rows[0].result).toEqual({ outcome: "applied" });
    const inventory = await db.query<{ available_units: number; rate: string }>(
      "select available_units,rate::text as rate from public.inventory where room_id=$1 and stay_date=$2", [otaRoomId, stayDate],
    );
    expect(inventory.rows[0].available_units).toBe(2);
    expect(Number(inventory.rows[0].rate)).toBe(107.5);
    const duplicate = await db.query<{ result: { outcome: string } }>(
      "select public.irp_pms_apply_native_ari($1,$2,$3,$4,$5::timestamptz,$6::jsonb) as result",
      [connectionId, "ari-event-1", 1, "a".repeat(64), new Date().toISOString(), JSON.stringify(payload)],
    );
    expect(duplicate.rows[0].result).toEqual({ outcome: "duplicate" });

    const disabled = await db.query<{ result: { enabled: boolean; outcome: string } }>(
      "select public.irp_pms_set_native_ari_enabled($1::uuid,$2,$3,$4::uuid,$5) as result",
      [disableRequestId, connectionId, false, actorId, null],
    );
    expect(disabled.rows[0].result).toMatchObject({ enabled: false, outcome: "updated" });
    const retriedOldActivation = await db.query<{ result: { enabled: boolean; outcome: string } }>(
      "select public.irp_pms_set_native_ari_enabled($1::uuid,$2,$3,$4::uuid,$5) as result", activationArgs,
    );
    expect(retriedOldActivation.rows[0].result).toMatchObject({ enabled: false, outcome: "duplicate" });
    await sqlCode(() => db.query(
      "select public.irp_pms_apply_native_ari($1,$2,$3,$4,$5::timestamptz,$6::jsonb)",
      [connectionId, "ari-event-2", 2, "b".repeat(64), new Date().toISOString(), JSON.stringify(payload)],
    ), "42501");
    const audit = await db.query<{ enabled: boolean; evidence_reference: string | null; actor_id: string }>(
      "select enabled,evidence_reference,actor_id::text as actor_id from public.irp_pms_native_ari_activation_events order by created_at,request_id",
    );
    expect(audit.rows).toEqual([
      { enabled: true, evidence_reference: "sandbox-case-20260923", actor_id: actorId },
      { enabled: false, evidence_reference: null, actor_id: actorId },
    ]);
  });
});
