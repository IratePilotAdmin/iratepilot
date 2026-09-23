import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../app/api/admin/integrations/native-ari/route.ts", import.meta.url), "utf8");
const setup = readFileSync(new URL("../components/dashboard/native-ari-setup.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../components/dashboard/admin-settings.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260923130000_iratepilot_pms_native_ari_receiver.sql", import.meta.url), "utf8");

describe("native iRatePilot PMS setup", () => {
  it("places the setup form in admin settings and restricts its API to admins", () => {
    expect(settings).toContain("<NativeAriSetup />");
    expect(route).toContain('requireRole(["admin"])');
    expect(route).toContain('select("id,name,partners!inner(status),rooms(id,name,active)")');
    expect(route).toContain('partner?.status === "approved"');
  });

  it("encrypts the shared secret and persists room/rate mapping only through the server RPC", () => {
    expect(route).toContain("encryptPmsCredentials({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: body.signingSecret })");
    expect(route).toContain('admin.rpc("irp_pms_save_native_ari_connection"');
    expect(route).toContain("p_mappings: rows");
    expect(route).not.toContain("signingSecret: encrypted");
    expect(setup).toContain('type="password"');
    expect(setup).toContain("Save disabled connection");
    expect(setup).toContain("pms_room_type_id");
    expect(setup).toContain("pms_rate_plan_id");
  });

  it("requires a selected active marketplace room and does not claim live traffic is enabled", () => {
    expect(setup).toContain("room.active");
    expect(setup).toContain("Saving keeps ARI disabled");
    expect(setup).toContain("enable neither reservation nor rate traffic until mappings and sandbox tests are reviewed");
    expect(migration).toContain("enabled = false");
  });

  it("allows disabled ARI mappings before booking activation but gates inventory application", () => {
    const saveFunction = migration.split("create function public.irp_pms_save_native_ari_connection")[1];
    expect(saveFunction).toContain("Property is not active and approved");
    expect(saveFunction).not.toContain("Matching PMS reservation connection must be enabled first");
    expect(migration).toContain("PMS reservation synchronization is not enabled for this property");
    expect(route).toContain("Match and enable the PMS booking connector");
    expect(setup).toContain("You can save this configuration while the booking connector is off");
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
