import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { encryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Mapping = { roomTypeId: string; ratePlanId: string; otaRoomId: string };
type SetupBody = {
  connectionId?: unknown;
  propertyId?: unknown;
  pmsPropertyId?: unknown;
  signingSecret?: unknown;
  mappings?: unknown;
};

const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const id = /^[A-Za-z0-9_-]{1,128}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const result = await admin.from("irp_pms_native_ari_connections")
      .select("connection_id,property_id,pms_property_id,enabled,latest_source_version,updated_at,irp_pms_native_ari_mappings(ota_room_id,pms_room_type_id,pms_rate_plan_id)")
      .order("updated_at", { ascending: false });
    if (result.error) throw result.error;
    return reply({ connections: result.data ?? [] });
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
  if (typeof body.connectionId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(body.connectionId)
    || typeof body.pmsPropertyId !== "string" || !id.test(body.pmsPropertyId)
    || typeof body.propertyId !== "string" || !uuid.test(body.propertyId)
    || typeof body.signingSecret !== "string"
    || new TextEncoder().encode(body.signingSecret).byteLength < 32
    || new TextEncoder().encode(body.signingSecret).byteLength > 512
    || !rows) return reply({ error: "Provide a scoped connection, a 32–512 byte secret, and unique room/rate mappings." }, 400);

  try {
    const admin = createAdminClient();
    const [property, source, mappedRooms] = await Promise.all([
      admin.from("properties").select("id,active,partners!inner(status)").eq("id", body.propertyId).maybeSingle(),
      admin.from("irp_pms_outbox_connections").select("property_id,pms_property_id,enabled")
        .eq("connection_id", body.connectionId).maybeSingle(),
      admin.from("rooms").select("id,property_id,active").eq("property_id", body.propertyId)
        .in("id", rows.map((item) => item.otaRoomId)),
    ]);
    if (property.error || source.error || mappedRooms.error) throw property.error ?? source.error ?? mappedRooms.error;
    const partner = property.data?.partners as unknown as { status?: string } | null;
    if (!property.data?.active || partner?.status !== "approved") return reply({ error: "An active approved marketplace property is required." }, 409);
    if (!source.data?.enabled || source.data.property_id !== body.propertyId || source.data.pms_property_id !== body.pmsPropertyId) {
      return reply({ error: "Enable the matching reservation connector for this exact property before configuring ARI." }, 409);
    }
    if ((mappedRooms.data ?? []).length !== rows.length || (mappedRooms.data ?? []).some((room) => !room.active || room.property_id !== body.propertyId)) {
      return reply({ error: "Every mapped marketplace room must be active and belong to the selected property." }, 409);
    }

    const encrypted = encryptPmsCredentials({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: body.signingSecret });
    const saved = await admin.rpc("irp_pms_save_native_ari_connection", {
      p_connection: body.connectionId,
      p_property: body.propertyId,
      p_pms_property: body.pmsPropertyId,
      p_secret_ciphertext: encrypted.ciphertext,
      p_secret_iv: encrypted.initializationVector,
      p_secret_tag: encrypted.authenticationTag,
      p_secret_key_version: encrypted.keyVersion,
      p_mappings: rows,
    });
    if (saved.error) throw saved.error;
    return reply({ ...saved.data, message: "Connection and mappings saved disabled. Run the isolated ARI test before any activation." });
  } catch {
    return reply({ error: "Native ARI configuration could not be saved." }, 503);
  }
}
