import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/202610180171_restrict_authenticated_only_rpcs.sql", import.meta.url),
  "utf8",
);

describe("authenticated-only RPC grants", () => {
  it("removes anonymous execution without disrupting signed-in callers or signed OTA delivery", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
        CREATE FUNCTION public.cancel_pending_booking(uuid,text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
        CREATE FUNCTION public.request_booking_cancellation(uuid,text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
        CREATE FUNCTION public.review_revenue_recommendation(uuid,text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
        CREATE FUNCTION public.send_booking_message(uuid,text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
        CREATE FUNCTION public.update_own_profile(text,text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
        CREATE FUNCTION public.irp_pms_ota_gateway(text,text,text,text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
        CREATE FUNCTION public.irp_pms_ota_gateway_group(text,text,text,text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
      `);

      await db.exec(migration);
      await db.exec(migration);

      const result = await db.query<{
        proname: string;
        anon_execute: boolean;
        authenticated_execute: boolean;
        service_execute: boolean;
      }>(`
        SELECT proname,
          has_function_privilege('anon', oid, 'EXECUTE') AS anon_execute,
          has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_execute,
          has_function_privilege('service_role', oid, 'EXECUTE') AS service_execute
        FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN (
            'cancel_pending_booking', 'request_booking_cancellation',
            'review_revenue_recommendation', 'send_booking_message',
            'update_own_profile', 'irp_pms_ota_gateway', 'irp_pms_ota_gateway_group'
          ) ORDER BY proname
      `);
      expect(result.rows).toHaveLength(7);
      for (const row of result.rows) {
        expect(row.authenticated_execute).toBe(true);
        expect(row.service_execute).toBe(true);
        expect(row.anon_execute).toBe(row.proname.startsWith("irp_pms_ota_gateway"));
      }
    } finally {
      await db.close();
    }
  });
});
