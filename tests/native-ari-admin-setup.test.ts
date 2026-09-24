import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../app/api/admin/integrations/native-ari/route.ts", import.meta.url), "utf8");
const setup = readFileSync(new URL("../components/dashboard/native-ari-setup.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../components/dashboard/admin-settings.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260923130000_iratepilot_pms_native_ari_receiver.sql", import.meta.url), "utf8");
const atomicMigration = readFileSync(new URL("../supabase/migrations/20260924101500_iratepilot_pms_atomic_connection_setup.sql", import.meta.url), "utf8");
const migrationVersions = readFileSync(new URL("../scripts/reconcile-preview-migrations.mjs", import.meta.url), "utf8");

describe("native iRatePilot PMS setup", () => {
  it("places the setup form in admin settings and restricts its API to admins", () => {
    expect(settings).toContain("<NativeAriSetup />");
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('select("id,name,partners!inner(status),rooms(id,name,active)")');
    expect(route).toContain('partner?.status === "approved"');
  });

  it("encrypts the shared secret and persists room/rate mapping only through the server RPC", () => {
    expect(route).toContain("encryptPmsCredentials({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: body.signingSecret })");
    expect(route).toContain('admin.rpc("irp_pms_configure_native_connection"');
    expect(route).toContain("The Preview database is missing the native connection setup migration.");
    expect(route).toContain("Connection setup was rejected. Verify the approved property");
    expect(route).toContain("p_tenant: body.tenantId");
    expect(route).not.toContain('admin.rpc("irp_pms_save_native_ari_connection"');
    expect(atomicMigration).toContain("public.irp_pms_configure_reservation_connection(");
    expect(atomicMigration).toContain("public.irp_pms_save_native_ari_connection(");
    expect(atomicMigration.toLowerCase()).toContain("grant execute on function public.irp_pms_configure_native_connection");
    expect(migrationVersions).toContain('"20260924101500"');
    expect(route).toContain("p_mappings: rows");
    expect(route).not.toContain("signingSecret: encrypted");
    expect(setup).toContain('type="password"');
    expect(setup).toContain("Save disabled connection");
    expect(setup).toContain("PMS tenant ID");
    expect(setup).toContain("PMS property ID");
    expect(setup).toContain("reservationConnections");
    expect(setup).toContain("pms_room_type_id");
    expect(setup).toContain("pms_rate_plan_id");
  });

  it("requires a selected active marketplace room and does not claim live traffic is enabled", () => {
    expect(setup).toContain("room.active");
    expect(setup).toContain("does not enable reservation capture, delivery, or ARI");
    expect(setup).toContain("isolated round-trip tests before activating either direction");
    expect(setup).toContain("Reservation capture");
    expect(setup).toContain("Delivery");
    expect(migration).toContain("enabled = false");
  });

  it("allows disabled ARI mappings before booking activation but gates inventory application", () => {
    const saveFunction = migration.split("create function public.irp_pms_save_native_ari_connection")[1];
    expect(saveFunction).toContain("Property is not active and approved");
    expect(saveFunction).not.toContain("Matching PMS reservation connection must be enabled first");
    expect(migration).toContain("PMS reservation synchronization is not enabled for this property");
    expect(route).toContain('admin.rpc("irp_pms_configure_native_connection"');
    expect(setup).toContain("matching reservation scope and rate mapping");
  });

  it("provides an audited admin activation control with database-enforced prerequisites", () => {
    expect(route).toContain("export async function PATCH(request: Request)");
    expect(route).toContain('admin.rpc("irp_pms_set_native_ari_enabled"');
    expect(route).toContain("auth.user.id");
    expect(setup).toContain("function NativeAriActivation");
    expect(setup).toContain("admin attestation and is not independently verified");
    expect(migration).toContain("create table public.irp_pms_native_ari_activation_events");
    expect(migration).toContain("create function public.irp_pms_set_native_ari_enabled");
    expect(migration).toContain("Matching PMS booking connector is not enabled");
    expect(migration).toContain("Native ARI mappings are missing or inactive");
    expect(migration).toContain("grant execute on function public.irp_pms_set_native_ari_enabled");
  });
});
