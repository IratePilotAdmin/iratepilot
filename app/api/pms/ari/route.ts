import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import {
  nativeAriBodyLimit,
  nativeAriPayloadDigest,
  parseNativeAriBatch,
  verifyNativeAriSignature,
} from "@/lib/iratepilot-pms-ari";

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
      if (size > nativeAriBodyLimit) {
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

export async function POST(request: Request) {
  if (process.env.IRATEPILOT_PMS_ARI_ENABLED !== "true") return reply(503, { error: "receiver_unavailable" });
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
  catch (error) { return reply(error instanceof Error && error.message === "payload_too_large" ? 413 : 400, { error: error instanceof Error ? error.message : "invalid_body" }); }

  try {
    const admin = createAdminClient();
    const connection = await admin.from("irp_pms_native_ari_connections")
      .select("pms_property_id,enabled,secret_ciphertext,secret_initialization_vector,secret_authentication_tag,secret_key_version")
      .eq("connection_id", connectionId).maybeSingle();
    if (connection.error) throw connection.error;
    if (!connection.data?.enabled) return reply(503, { error: "receiver_unavailable" });

    const credentials = decryptPmsCredentials({
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
    let batch;
    try { batch = parseNativeAriBatch(decoded, connectionId); }
    catch (error) { return reply(422, { error: error instanceof Error ? error.message : "invalid_ari_batch" }); }
    if (batch.propertyId !== connection.data.pms_property_id) return reply(422, { error: "property_mapping_mismatch" });

    const applied = await admin.rpc("irp_pms_apply_native_ari", {
      p_connection: connectionId,
      p_event: batch.eventId,
      p_source_version: batch.sourceVersion,
      p_payload_digest: nativeAriPayloadDigest(rawBody),
      p_generated_at: batch.generatedAt,
      p_updates: batch.updates,
    });
    if (applied.error) {
      if (/event conflict|source version|mapping|room is not active|inventory/i.test(applied.error.message)) {
        return reply(409, { error: "ari_conflict" });
      }
      throw applied.error;
    }
    const result = applied.data as { outcome?: unknown } | null;
    if (!result || !["applied", "duplicate"].includes(String(result.outcome))) throw new Error("invalid_ari_acknowledgement");
    return reply(200, { outcome: result.outcome, eventId: batch.eventId, sourceVersion: batch.sourceVersion, updates: batch.updates.length });
  } catch {
    return reply(503, { error: "receiver_unavailable" });
  }
}

export async function GET() { return reply(405, { error: "method_not_allowed" }); }
