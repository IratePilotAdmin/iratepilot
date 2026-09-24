import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { encryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Mapping = { roomTypeId: string; ratePlanId: string; otaRoomId: string };
type SetupBody = {
  requestId?: unknown;
  connectionId?: unknown;
  propertyId?: unknown;
  tenantId?: unknown;
  pmsPropertyId?: unknown;
  signingSecret?: unknown;
  mappings?: unknown;
};
type ActivationBody = {
  requestId?: unknown;
  connectionId?: unknown;
  enabled?: unknown;
  confirmation?: unknown;
  evidenceReference?: unknown;
};

const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const id = /^[A-Za-z0-9_-]{1,128}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function setupFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
  if (code === "PGRST202" || code === "42883") {
    return reply({ error: "The Preview database is missing the native connection setup migration. Apply the approved migrations to the non-production project, then retry." }, 503);
  }
  if (["22023", "23503", "23505", "42501"].includes(code)) {
    return reply({ error: "Connection setup was rejected. Verify the approved property, PMS identifiers, and room/rate mappings, then retry." }, 409);
  }
  return reply({ error: "Native PMS configuration is temporarily unavailable. Retry, or check the non-production database migration status." }, 503);
}

function mappings(value: unknown): Mapping[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) return null;
  const result: Mapping[] = [];
  const keys = new Set<string>();
  const rooms = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (Object.keys(row).sort().join(",") !== "otaRoomId,ratePlanId,roomTypeId"
      || typeof row.roomTypeId !== "string" || !id.test(row.roomTypeId)
      || typeof row.ratePlanId !== "string" || !id.test(row.ratePlanId)
      || typeof row.otaRoomId !== "string" || !uuid.test(row.otaRoomId)) return null;
    const key = `${row.roomTypeId}/${row.ratePlanId}`;
    if (keys.has(key) || rooms.has(row.otaRoomId)) return null;
    keys.add(key);
    rooms.add(row.otaRoomId);
    result.push({ roomTypeId: row.roomTypeId, ratePlanId: row.ratePlanId, otaRoomId: row.otaRoomId });
  }
  return result;
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return reply({ error: auth.error }, auth.status);
  try {
    const admin = createAdminClient();
    const [result, propertyResult, reservationResult] = await Promise.all([admin.from("irp_pms_native_ari_connections")
      .select("connection_id,property_id,pms_property_id,enabled,latest_source_version,updated_at,irp_pms_native_ari_mappings(ota_room_id,pms_room_type_id,pms_rate_plan_id)")
      .order("updated_at", { ascending: false }), admin.from("properties")
      .select("id,name,partners!inner(status),rooms(id,name,active)").eq("active", true).order("name", { ascending: true }),
    admin.from("irp_pms_outbox_connections")
      .select("property_id,connection_id,tenant_id,pms_property_id,enabled,delivery_enabled,environment")]);
    if (result.error || propertyResult.error || reservationResult.error) throw result.error ?? propertyResult.error ?? reservationResult.error;
    const properties = (propertyResult.data ?? []).filter((property) => {
      const partner = property.partners as unknown as { status?: string } | null;
      return partner?.status === "approved";
    }).map((property) => ({ id: property.id, name: property.name, rooms: property.rooms ?? [] }));
    return reply({ connections: result.data ?? [], reservationConnections: reservationResult.data ?? [], properties });
  } catch {
    return reply({ error: "Native ARI configuration is unavailable." }, 503);
  }
}

export async function PUT(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return reply({ error: auth.error }, auth.status);
  let body: SetupBody;
  try { body = await request.json() as SetupBody; }
  catch { return reply({ error: "Invalid JSON." }, 400); }

  const rows = mappings(body.mappings);
  if (typeof body.requestId !== "string" || !uuid.test(body.requestId)
    || typeof body.connectionId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(body.connectionId)
    || typeof body.tenantId !== "string" || !uuid.test(body.tenantId)
    || typeof body.pmsPropertyId !== "string" || !uuid.test(body.pmsPropertyId)
    || typeof body.propertyId !== "string" || !uuid.test(body.propertyId)
    || typeof body.signingSecret !== "string"
    || new TextEncoder().encode(body.signingSecret).byteLength < 32
    || new TextEncoder().encode(body.signingSecret).byteLength > 512
  || !rows) return reply({ error: "Provide the OTA property, PMS tenant/property IDs, a 32–512 byte secret, and unique room/rate mappings." }, 400);

  try {
    const admin = createAdminClient();
    const [property, mappedRooms] = await Promise.all([
      admin.from("properties").select("id,active,partners!inner(status)").eq("id", body.propertyId).maybeSingle(),
      admin.from("rooms").select("id,property_id,active").eq("property_id", body.propertyId)
        .in("id", rows.map((item) => item.otaRoomId)),
    ]);
    if (property.error || mappedRooms.error) throw property.error ?? mappedRooms.error;
    const partner = property.data?.partners as unknown as { status?: string } | null;
    if (!property.data?.active || partner?.status !== "approved") return reply({ error: "An active approved marketplace property is required." }, 409);
    if ((mappedRooms.data ?? []).length !== rows.length || (mappedRooms.data ?? []).some((room) => !room.active || room.property_id !== body.propertyId)) {
      return reply({ error: "Every mapped marketplace room must be active and belong to the selected property." }, 409);
    }

    const encrypted = encryptPmsCredentials({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: body.signingSecret });
    const configured = await admin.rpc("irp_pms_configure_native_connection", {
      p_request: body.requestId,
      p_actor: auth.user.id,
      p_property: body.propertyId,
      p_connection: body.connectionId,
      p_tenant: body.tenantId,
      p_pms_property: body.pmsPropertyId,
      p_secret_ciphertext: encrypted.ciphertext,
      p_secret_iv: encrypted.initializationVector,
      p_secret_tag: encrypted.authenticationTag,
      p_secret_key_version: encrypted.keyVersion,
      p_mappings: rows,
    });
    if (configured.error) throw configured.error;
    return reply({ ...configured.data,
      message: "The reservation and rate connections are saved in sandbox with capture and delivery disabled. Review migration baseline and run isolated round-trip tests before activation." });
  } catch (error) {
    return setupFailure(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return reply({ error: auth.error }, auth.status);
  let body: ActivationBody;
  try { body = await request.json() as ActivationBody; }
  catch { return reply({ error: "Invalid JSON." }, 400); }

  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).sort().join(",") !== "confirmation,connectionId,enabled,evidenceReference,requestId"
    || typeof body.requestId !== "string" || !uuid.test(body.requestId)
    || typeof body.connectionId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(body.connectionId)
    || typeof body.enabled !== "boolean"
    || body.confirmation !== `${body.enabled ? "ENABLE" : "DISABLE"} ${body.connectionId}`
    || (body.enabled && (typeof body.evidenceReference !== "string"
      || body.evidenceReference.length < 5 || body.evidenceReference.length > 160
      || body.evidenceReference !== body.evidenceReference.trim()
      || !/^[A-Za-z0-9][A-Za-z0-9._:/ -]{4,159}$/.test(body.evidenceReference)))
    || (!body.enabled && body.evidenceReference !== null)) {
    return reply({ error: "Confirm the exact connection action and provide a safe sandbox or approval reference when enabling." }, 400);
  }

  try {
    const admin = createAdminClient();
    const result = await admin.rpc("irp_pms_set_native_ari_enabled", {
      p_request_id: body.requestId,
      p_connection: body.connectionId,
      p_enabled: body.enabled,
      p_actor: auth.user.id,
      p_evidence_reference: body.enabled ? body.evidenceReference : null,
    });
    if (result.error) {
      if (["42501", "23503", "P0002"].includes(result.error.code ?? "")) {
        return reply({ error: "Activation checks failed. Confirm the property, matching booking connector, active mappings, and saved approval reference." }, 409);
      }
      throw result.error;
    }
    const state = result.data as { enabled?: unknown; outcome?: unknown } | null;
    const isEnabled = state?.enabled === true;
    return reply({ ...state, message: isEnabled
      ? "Native ARI receiving is enabled. Confirm the first delivery and inventory before accepting normal traffic."
      : "Native ARI receiving is disabled." });
  } catch {
    return reply({ error: "Native ARI activation could not be saved." }, 503);
  }
}
