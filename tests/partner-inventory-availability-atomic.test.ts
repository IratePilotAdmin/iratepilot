import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/202610180172_atomic_partner_inventory_availability.sql", import.meta.url),
  "utf8",
);

describe("atomic partner inventory availability", () => {
  it("rolls back every night if a saved night is missing or a booking hold blocks one night", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;
        create schema auth;
        grant usage on schema auth to authenticated;
        create function auth.uid() returns uuid language sql stable
          as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
        grant execute on function auth.uid() to authenticated;
        create table public.inventory (
          id uuid primary key,
          room_id uuid not null,
          stay_date date not null,
          available_units integer not null,
          rate numeric(12,2) not null,
          unique (room_id, stay_date)
        );
        grant usage on schema public to authenticated, anon;
        grant select, update on public.inventory to authenticated;
        alter table public.inventory enable row level security;
        create policy manager_inventory on public.inventory to authenticated
          using (room_id = '22222222-2222-4222-8222-222222222222'::uuid)
          with check (room_id = '22222222-2222-4222-8222-222222222222'::uuid);
        insert into public.inventory values
          ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', '2099-01-01', 4, 120),
          ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', '2099-01-02', 4, 130);
        create function public.block_held_inventory() returns trigger language plpgsql as $$
        begin
          if new.stay_date = '2099-01-02' and new.available_units = 7 then
            raise exception 'Active direct hotel offer inventory is immutable until release or expiry'
              using errcode = 'P0001';
          end if;
          return new;
        end $$;
        create trigger hold_guard before update on public.inventory
          for each row execute function public.block_held_inventory();
      `);
      await db.exec(migration);

      expect((await db.query<{ allowed: boolean }>(`
        select has_function_privilege('anon',
          'public.set_partner_inventory_availability(uuid,date,date,integer)', 'execute') as allowed
      `)).rows[0].allowed).toBe(false);

      await db.exec("set role authenticated");
      const rpc = (end: string, units: number) => db.query(`
        select public.set_partner_inventory_availability(
          '22222222-2222-4222-8222-222222222222', '2099-01-01', '${end}', ${units})
      `);
      await expect(rpc("2099-01-03", 6)).rejects.toMatchObject({ code: "P0001" });
      await expect(rpc("2099-01-02", 7)).rejects.toMatchObject({ code: "P0001" });
      expect((await db.query<{ available_units: number }>(`
        select available_units from public.inventory order by stay_date
      `)).rows.map((row) => row.available_units)).toEqual([4, 4]);

      expect((await rpc("2099-01-02", 6)).rows[0]).toMatchObject({
        set_partner_inventory_availability: 2,
      });
      const rows = (await db.query<{ available_units: number; rate: number }>(`
        select available_units, rate from public.inventory order by stay_date
      `)).rows;
      expect(rows.map((row) => row.available_units)).toEqual([6, 6]);
      expect(rows.map((row) => Number(row.rate))).toEqual([120, 130]);
    } finally {
      await db.close();
    }
  });
});
