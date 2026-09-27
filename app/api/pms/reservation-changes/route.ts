import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { nativeAriPayloadDigest, verifyNativeAriSignature } from "@/lib/iratepilot-pms-ari";
import { parseNativeReservationChange, reservationChangeBodyLimit } from "@/lib/iratepilot-pms-reservation-change";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reply = (status: number, body: unknown) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
});

async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > reservationChangeBodyLimit) {
        await reader.cancel();
        throw new Error("payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength; }
  return raw;
}

type ReceiverDependencies = {
  createAdminClient: typeof createAdminClient;
  decryptPmsCredentials: typeof decryptPmsCredentials;
  enabled: () => boolean;
};

export function createReservationChangePostHandler(overrides: Partial<ReceiverDependencies> = {}) {
  const getAdminClient = overrides.createAdminClient ?? createAdminClient;
  const decryptCredentials = overrides.decryptPmsCredentials ?? decryptPmsCredentials;
  const isEnabled = overrides.enabled ?? (() => process.env.IRATEPILOT_PMS_RESERVATION_CHANGES_ENABLED === "true");

  return async function POST(request: Request) {
  if (!isEnabled()) {
    return reply(503, { error: "receiver_unavailable" });
  }
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply(415, { error: "json_required" });
  }
  const connectionId = request.headers.get("x-irp-connection") ?? "";
  const timestamp = request.headers.get("x-irp-timestamp") ?? "";
  const signature = request.headers.get("x-irp-signature") ?? "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(connectionId) || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) {
    return reply(401, { error: "invalid_authentication" });
  }

  let rawBody: Uint8Array;
  try { rawBody = await readBoundedBody(request); }
  catch (error) {
    return reply(error instanceof Error && error.message === "payload_too_large" ? 413 : 400,
      { error: error instanceof Error ? error.message : "invalid_body" });
  }

  try {
    const admin = getAdminClient();
    const connection = await admin.from("irp_pms_native_ari_connections")
      .select("pms_property_id,enabled,secret_ciphertext,secret_initialization_vector,secret_authentication_tag,secret_key_version")
      .eq("connection_id", connectionId).maybeSingle();
    if (connection.error) throw connection.error;
    if (!connection.data?.enabled) return reply(503, { error: "receiver_unavailable" });

    const credentials = decryptCredentials({
      ciphertext: connection.data.secret_ciphertext,
      initializationVector: connection.data.secret_initialization_vector,
      authenticationTag: connection.data.secret_authentication_tag,
      keyVersion: connection.data.secret_key_version,
    });
    const secret = credentials.IRATEPILOT_PMS_ARI_SIGNING_SECRET;
    if (!secret || !verifyNativeAriSignature({ secret, connectionId, timestamp, signature, rawBody })) {
      return reply(401, { error: "invalid_authentication" });
    }

    let decoded: unknown;
    try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); }
    catch { return reply(400, { error: "invalid_json" }); }
    let change;
    try { change = parseNativeReservationChange(decoded, connectionId); }
    catch (error) { return reply(422, { error: error instanceof Error ? error.message : "invalid_change" }); }
    if (change.propertyId !== connection.data.pms_property_id) return reply(422, { error: "property_mapping_mismatch" });

    const applied = await admin.rpc("irp_pms_apply_reservation_change", {
      p_connection: connectionId,
      p_request: change.requestId,
      p_property: change.propertyId,
      p_booking: change.bookingId,
      p_expected_source_version: change.expectedSourceVersion,
      p_check_in: change.stay.checkIn,
      p_check_out: change.stay.checkOut,
      p_guests: change.stay.guests,
      p_approved_by: change.approvedBy,
      p_payload_digest: nativeAriPayloadDigest(rawBody),
    });
    if (applied.error) {
      if (/request ID conflict|connection is unavailable|synchronization is not enabled|booking is unavailable|property is not active|permission/i.test(applied.error.message)) {
        return reply(409, { error: "reservation_change_conflict" });
      }
      throw applied.error;
    }
    const result = applied.data as { outcome?: unknown; reasonCode?: unknown; sourceVersion?: unknown; duplicate?: unknown } | null;
    if (!result || !["applied", "review"].includes(String(result.outcome))) throw new Error("invalid_change_acknowledgement");
    return reply(200, {
      outcome: result.outcome,
      requestId: change.requestId,
      ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
      ...(result.sourceVersion ? { sourceVersion: result.sourceVersion } : {}),
      duplicate: result.duplicate === true,
    });
  } catch {
    return reply(503, { error: "receiver_unavailable" });
  }
  };
}

export const POST = createReservationChangePostHandler();

export async function GET() { return reply(405, { error: "method_not_allowed" }); }
