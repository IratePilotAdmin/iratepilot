import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/202609240146_iratepilot_pms_ota_reservation_inbox.sql", import.meta.url), "utf8");
const db = new PGlite();
const propertyId = "10000000-0000-4000-8000-000000000001";
const roomId = "20000000-0000-4000-8000-000000000001";

async function sqlCode(work: () => Promise<unknown>, code: string) {
  try { await work(); }
  catch (error) { expect(error).toMatchObject({ code }); return; }
  throw new Error(`Expected PostgreSQL error ${code}.`);
}

const stageArgs = [
  "booking-test-1", propertyId, "12345", "a".repeat(64), "b".repeat(64), "new",
  Buffer.from("encrypted guest payload").toString("base64"), Buffer.alloc(12, 1).toString("base64"),
  Buffer.alloc(16, 2).toString("base64"), 1, JSON.stringify([{ roomTypeId: "room-1", ratePlanId: "bar" }]),
];

describe("encrypted OTA reservation inbox migration", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.partners(id uuid primary key, status text not null);
      CREATE TABLE public.properties(id uuid primary key, partner_id uuid not null references public.partners(id), active boolean not null);
      CREATE TABLE public.rooms(id uuid primary key, property_id uuid not null references public.properties(id), active boolean not null);
      CREATE TABLE public.bookings(id uuid primary key);
      INSERT INTO public.partners VALUES ('30000000-0000-4000-8000-000000000001','approved');
      INSERT INTO public.properties VALUES ('${propertyId}','30000000-0000-4000-8000-000000000001',true);
      INSERT INTO public.rooms VALUES ('${roomId}','${propertyId}',true);
    `);
    await db.exec(migration);
    await db.exec(`
      INSERT INTO public.irp_ota_channel_connections(
        connection_id,property_id,provider,provider_property_id,enabled,partner_approved,pii_compliance_approved
      ) VALUES ('booking-test-1','${propertyId}','booking_com','12345',true,true,true);
      INSERT INTO public.irp_ota_channel_room_mappings(connection_id,provider_room_type_id,provider_rate_plan_id,local_room_id)
      VALUES ('booking-test-1','room-1','bar','${roomId}');
    `);
  });

  afterAll(async () => { await db.close(); });

  it("creates an encrypted inbox event and returns the existing row on replay", async () => {
    const first = await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.irp_ota_stage_reservation($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::integer,$11::jsonb) AS result", stageArgs,
    );
    expect(first.rows[0]?.result).toMatchObject({ outcome: "received" });
    const second = await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.irp_ota_stage_reservation($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::integer,$11::jsonb) AS result", stageArgs,
    );
    expect(second.rows[0]?.result).toMatchObject({ outcome: "duplicate", status: "received" });
    expect((second.rows[0]?.result as { inboxId: string }).inboxId).toBe((first.rows[0]?.result as { inboxId: string }).inboxId);
    const row = await db.query<{ status: string; provider_reservation_id_sha256: string; pii_ciphertext: string }>(
      "SELECT status,provider_reservation_id_sha256,pii_ciphertext FROM public.irp_ota_reservation_inbox",
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]?.status).toBe("received");
    expect(row.rows[0]?.provider_reservation_id_sha256).toBe("a".repeat(64));
    expect(row.rows[0]?.pii_ciphertext).not.toContain("encrypted guest payload");
  });

  it("requires the approved test connection, provider property, PII gate, and local room mapping", async () => {
    await sqlCode(() => db.query(
      "SELECT public.irp_ota_stage_reservation($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::integer,$11::jsonb)",
      [stageArgs[0], stageArgs[1], "wrong-property", ...stageArgs.slice(3)],
    ), "42501");
    await sqlCode(() => db.query(
      "SELECT public.irp_ota_stage_reservation($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::integer,$11::jsonb)",
      [stageArgs[0], stageArgs[1], stageArgs[2], "c".repeat(64), "d".repeat(64), ...stageArgs.slice(5, 10), JSON.stringify([{ roomTypeId: "unmapped", ratePlanId: "bar" }])],
    ), "23503");
    await db.query("UPDATE public.irp_ota_channel_connections SET enabled=false WHERE connection_id='booking-test-1'");
    await sqlCode(() => db.query(
      "SELECT public.irp_ota_stage_reservation($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::integer,$11::jsonb)",
      [stageArgs[0], stageArgs[1], stageArgs[2], "e".repeat(64), "f".repeat(64), ...stageArgs.slice(5)],
    ), "42501");
  });

  it("keeps direct tenant roles away from ciphertext writes and exposes only server definer procedures", async () => {
    const privileges = await db.query<{ anon_select: boolean; authenticated_insert: boolean; service_insert: boolean; function_call: boolean }>(`
      SELECT has_table_privilege('anon','public.irp_ota_reservation_inbox','SELECT') AS anon_select,
        has_table_privilege('authenticated','public.irp_ota_reservation_inbox','INSERT') AS authenticated_insert,
        has_table_privilege('service_role','public.irp_ota_reservation_inbox','INSERT') AS service_insert,
        has_function_privilege('service_role','public.irp_ota_stage_reservation(text,uuid,text,text,text,text,text,text,text,integer,jsonb)','EXECUTE') AS function_call
    `);
    expect(privileges.rows[0]).toEqual({ anon_select: false, authenticated_insert: false, service_insert: false, function_call: true });
  });
});
