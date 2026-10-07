import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/202609230141_iratepilot_pms_delivery_connection_registry.sql", import.meta.url),
  "utf8",
);
const db = new PGlite();

describe("native PMS delivery connection registry migration", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.irp_pms_outbox_connections (
        property_id uuid, connection_id text, tenant_id text, pms_property_id text,
        enabled boolean, delivery_enabled boolean, environment text
      );
      CREATE TABLE public.irp_pms_native_ari_connections (
        property_id uuid, connection_id text, pms_property_id text,
        secret_ciphertext text, secret_initialization_vector text,
        secret_authentication_tag text, secret_key_version integer
      );
    `);
    await db.exec(migration);
  });

  afterAll(async () => { await db.close(); });

  it("returns only enabled sandbox connections and joins secrets by the full property scope", () => {
    expect(migration).toContain("LEFT JOIN public.irp_pms_native_ari_connections AS a");
    expect(migration).toContain("a.property_id = c.property_id");
    expect(migration).toContain("a.connection_id = c.connection_id");
    expect(migration).toContain("a.pms_property_id = c.pms_property_id");
    expect(migration).toContain("WHERE c.enabled");
    expect(migration).toContain("AND c.delivery_enabled");
    expect(migration).toContain("AND c.environment = 'sandbox'");
    expect(migration).toContain("LIMIT 101");
  });

  it("keeps encrypted connection material service-role-only", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  it("returns multiple eligible property secrets only on exact scope matches", async () => {
    await db.exec(`
      INSERT INTO public.irp_pms_outbox_connections VALUES
        ('11111111-1111-4111-8111-111111111111','hotel-one','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pms-one',true,true,'sandbox'),
        ('22222222-2222-4222-8222-222222222222','hotel-two','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','pms-two',true,true,'sandbox'),
        ('33333333-3333-4333-8333-333333333333','disabled','cccccccc-cccc-4ccc-8ccc-cccccccccccc','pms-three',true,false,'sandbox');
      INSERT INTO public.irp_pms_native_ari_connections VALUES
        ('11111111-1111-4111-8111-111111111111','hotel-one','pms-one','cipher-one','iv-one','tag-one',1),
        ('22222222-2222-4222-8222-222222222222','hotel-two','wrong-pms-id','cipher-wrong-scope','iv-two','tag-two',1);
    `);
    const result = await db.query<{ connection_id: string; secret_ciphertext: string | null }>(
      "SELECT connection_id, secret_ciphertext FROM public.irp_pms_list_configured_delivery_connections() ORDER BY connection_id",
    );
    expect(result.rows).toEqual([
      { connection_id: "hotel-one", secret_ciphertext: "cipher-one" },
      { connection_id: "hotel-two", secret_ciphertext: null },
    ]);
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(
      "SELECT has_function_privilege('anon','public.irp_pms_list_configured_delivery_connections()','EXECUTE') AS anon, has_function_privilege('authenticated','public.irp_pms_list_configured_delivery_connections()','EXECUTE') AS authenticated, has_function_privilege('service_role','public.irp_pms_list_configured_delivery_connections()','EXECUTE') AS service_role",
    );
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
  });
});
