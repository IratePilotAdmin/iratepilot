import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { decryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxPayloadBytes = 32_768;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const eventNamePattern = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function tokenMatches(received: string, expected: string) {
  const receivedHash = createHash("sha256").update(received, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

function noStore(status: number) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  if (!uuidPattern.test(connectionId)) return noStore(404);
  const token = new URL(request.url).searchParams.get("token") || "";
  if (token.length < 32 || token.length > 128) return noStore(401);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(contentLength) || contentLength > maxPayloadBytes) return noStore(413);

  const admin = createAdminClient();
  try {
    const [connection, stored] = await Promise.all([
      admin.from("property_pms_connections")
        .select("id,provider_id,external_property_code")
        .eq("id", connectionId)
        .maybeSingle(),
      admin.from("property_pms_credentials")
        .select("ciphertext,initialization_vector,authentication_tag,key_version")
        .eq("connection_id", connectionId)
        .maybeSingle(),
    ]);
    if (connection.error) throw connection.error;
    if (stored.error) throw stored.error;
    if (!connection.data || connection.data.provider_id !== "apaleo" || !stored.data) return noStore(404);
    const credentials = decryptPmsCredentials({
      ciphertext: stored.data.ciphertext,
      initializationVector: stored.data.initialization_vector,
      authenticationTag: stored.data.authentication_tag,
      keyVersion: stored.data.key_version,
    });
    const expectedToken = credentials.PMS_APALEO_WEBHOOK_SECRET || "";
    const propertyCode = credentials.PMS_APALEO_WEBHOOK_PROPERTY_CODE || "";
    if (!expectedToken || !propertyCode || !tokenMatches(token, expectedToken)) return noStore(401);
    if (connection.data.external_property_code !== propertyCode) return noStore(409);

    const raw = await request.text();
    if (!raw || Buffer.byteLength(raw, "utf8") > maxPayloadBytes) return noStore(413);
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return noStore(400);
      payload = parsed as Record<string, unknown>;
    } catch {
      return noStore(400);
    }

    const eventId = typeof payload.id === "string" ? payload.id.trim() : "";
    const topic = typeof payload.topic === "string" ? payload.topic.trim() : "";
    const eventType = typeof payload.type === "string" ? payload.type.trim() : "";
    const timestamp = typeof payload.timestamp === "number" ? payload.timestamp : Number.NaN;
    if (!identifierPattern.test(eventId) || !eventNamePattern.test(topic) || !eventNamePattern.test(eventType)) {
      return noStore(400);
    }
    const occurredAt = new Date(timestamp);
    if (!Number.isFinite(timestamp) || Number.isNaN(occurredAt.getTime())) return noStore(400);
    if (occurredAt.getTime() < Date.UTC(2020, 0, 1) || occurredAt.getTime() > Date.now() + 300_000) {
      return noStore(400);
    }

    if (topic.toLowerCase() === "system" && eventType.toLowerCase() === "healthcheck") {
      const propertyIds = Array.isArray(payload.propertyIds) ? payload.propertyIds : [];
      return propertyIds.length === 1 && propertyIds[0] === propertyCode ? noStore(204) : noStore(403);
    }

    const eventProperty = typeof payload.propertyId === "string" ? payload.propertyId.trim() : "";
    if (eventProperty !== propertyCode) return noStore(403);
    if (topic.toLowerCase() !== "reservation") return noStore(204);

    const trackingId = request.headers.get("apaleo-tracking-id")?.trim();
    const inserted = await admin.from("pms_webhook_event_receipts").insert({
      connection_id: connectionId,
      provider_id: "apaleo",
      provider_event_id: eventId,
      topic,
      event_type: eventType,
      property_code: eventProperty,
      provider_occurred_at: occurredAt.toISOString(),
      payload_sha256: sha256(raw),
      tracking_id_sha256: trackingId && trackingId.length <= 300 ? sha256(trackingId) : null,
    });
    if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    return noStore(204);
  } catch (error) {
    console.error("Apaleo webhook receipt failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return noStore(503);
  }
}
