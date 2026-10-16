import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { decryptPmsCredentials, encryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApaleoReservationReadError,
  fetchApaleoReservation,
  getApaleoAccessToken,
} from "@/services/hotel-suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createAdminClient>;
type Receipt = {
  id: string;
  connection_id: string;
  provider_entity_id: string;
  property_code: string;
  event_type: string;
  processing_attempts: number;
};

function batchSize() {
  const value = Number.parseInt(process.env.APALEO_RECONCILIATION_BATCH_SIZE || "10", 10);
  return Number.isFinite(value) ? Math.min(25, Math.max(1, value)) : 10;
}

function tombstoneDigest(receipt: Receipt) {
  return createHash("sha256").update(JSON.stringify({
    reservationId: receipt.provider_entity_id,
    propertyCode: receipt.property_code,
    status: "deleted",
  }), "utf8").digest("hex");
}

function safeFailureCode(error: unknown) {
  if (error instanceof ApaleoReservationReadError) return error.detailCode.slice(0, 500);
  return "reconciliation_failed";
}

async function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return { ok: true as const };
  }
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return { ok: false as const };
  return { ok: true as const };
}

async function loadConnection(admin: AdminClient, receipt: Receipt) {
  const [connection, stored] = await Promise.all([
    admin.from("property_pms_connections")
      .select("id,provider_id,external_property_code")
      .eq("id", receipt.connection_id)
      .maybeSingle(),
    admin.from("property_pms_credentials")
      .select("ciphertext,initialization_vector,authentication_tag,key_version")
      .eq("connection_id", receipt.connection_id)
      .maybeSingle(),
  ]);
  if (connection.error) throw connection.error;
  if (stored.error) throw stored.error;
  if (
    !connection.data
    || connection.data.provider_id !== "apaleo"
    || connection.data.external_property_code !== receipt.property_code
    || !stored.data
  ) {
    throw new Error("Apaleo reconciliation connection is unavailable");
  }
  const credentials = decryptPmsCredentials({
    ciphertext: stored.data.ciphertext,
    initializationVector: stored.data.initialization_vector,
    authenticationTag: stored.data.authentication_tag,
    keyVersion: stored.data.key_version,
  });
  if (credentials.PMS_APALEO_WEBHOOK_PROPERTY_CODE !== receipt.property_code) {
    throw new Error("Apaleo reconciliation property selection has changed");
  }
  return credentials;
}

async function persistRotatedRefreshToken(
  admin: AdminClient,
  receipt: Receipt,
  credentials: Record<string, string>,
  refreshToken: string | undefined,
) {
  if (!refreshToken || refreshToken === credentials.PMS_APALEO_REFRESH_TOKEN) return;
  const encrypted = encryptPmsCredentials({
    ...credentials,
    PMS_APALEO_REFRESH_TOKEN: refreshToken,
  });
  const updated = await admin.from("property_pms_credentials").update({
    ciphertext: encrypted.ciphertext,
    initialization_vector: encrypted.initializationVector,
    authentication_tag: encrypted.authenticationTag,
    key_version: encrypted.keyVersion,
    updated_at: new Date().toISOString(),
  }).eq("connection_id", receipt.connection_id);
  if (updated.error) throw updated.error;
}

async function markReconciled(
  admin: AdminClient,
  receipt: Receipt,
  snapshotSha256: string,
  providerStatus: string,
) {
  const timestamp = new Date().toISOString();
  const result = await admin.from("pms_webhook_event_receipts").update({
    processing_status: "reconciled",
    processing_started_at: null,
    processed_at: timestamp,
    last_error: null,
    reservation_snapshot_sha256: snapshotSha256,
    provider_status: providerStatus,
    provider_fetched_at: timestamp,
  }).eq("id", receipt.id).eq("processing_status", "processing");
  if (result.error) throw result.error;
}

async function markFailed(admin: AdminClient, receipt: Receipt, error: unknown) {
  const retryMinutes = Math.min(60, 2 ** Math.max(0, receipt.processing_attempts - 1));
  const result = await admin.from("pms_webhook_event_receipts").update({
    processing_status: "failed",
    processing_started_at: null,
    processed_at: null,
    last_error: safeFailureCode(error),
    reservation_snapshot_sha256: null,
    provider_status: null,
    provider_fetched_at: null,
    next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
  }).eq("id", receipt.id).eq("processing_status", "processing");
  if (result.error) {
    console.error("Apaleo reconciliation failure persistence failed", {
      receiptId: receipt.id,
      name: result.error.name ?? "DatabaseError",
    });
  }
}

async function processReceipts(request: Request) {
  if (!(await authorize(request)).ok) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  const requestedConnectionId = new URL(request.url).searchParams.get("connectionId")?.trim() || null;
  if (requestedConnectionId && !uuidPattern.test(requestedConnectionId)) {
    return NextResponse.json({ success: false, error: "A valid connection ID is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const summary = { claimed: 0, reconciled: 0, deleted: 0, failed: 0 };
  const accessCache = new Map<string, { accessToken: string; baseUrl?: string }>();
  for (let index = 0; index < batchSize(); index += 1) {
    const claimed = await admin.rpc("claim_apaleo_reservation_reconciliation_receipt", {
      p_connection_id: requestedConnectionId,
    });
    if (claimed.error) {
      return NextResponse.json({ success: false, error: "Apaleo reconciliation claim failed.", summary }, {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const receipt = (Array.isArray(claimed.data) ? claimed.data[0] : claimed.data) as Receipt | null;
    if (!receipt) break;
    summary.claimed += 1;

    try {
      let access = accessCache.get(receipt.connection_id);
      if (!access) {
        const credentials = await loadConnection(admin, receipt);
        const token = await getApaleoAccessToken({
          baseUrl: credentials.PMS_APALEO_BASE_URL,
          clientId: credentials.PMS_APALEO_CLIENT_ID,
          clientSecret: credentials.PMS_APALEO_CLIENT_SECRET,
          refreshToken: credentials.PMS_APALEO_REFRESH_TOKEN,
        });
        await persistRotatedRefreshToken(admin, receipt, credentials, token.refreshToken);
        access = {
          accessToken: token.accessToken,
          baseUrl: credentials.PMS_APALEO_BASE_URL,
        };
        accessCache.set(receipt.connection_id, access);
      }
      try {
        const snapshot = await fetchApaleoReservation({
          baseUrl: access.baseUrl,
          accessToken: access.accessToken,
          reservationId: receipt.provider_entity_id,
          propertyCode: receipt.property_code,
        });
        await markReconciled(admin, receipt, snapshot.snapshotSha256, snapshot.status);
        summary.reconciled += 1;
      } catch (error) {
        if (
          error instanceof ApaleoReservationReadError
          && error.status === 404
          && receipt.event_type.toLowerCase() === "deleted"
        ) {
          await markReconciled(admin, receipt, tombstoneDigest(receipt), "deleted");
          summary.reconciled += 1;
          summary.deleted += 1;
        } else {
          throw error;
        }
      }
    } catch (error) {
      await markFailed(admin, receipt, error);
      summary.failed += 1;
      console.error("Apaleo reservation reconciliation failed", {
        receiptId: receipt.id,
        connectionId: receipt.connection_id,
        code: safeFailureCode(error),
      });
    }
  }

  return NextResponse.json({ success: true, summary }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  return processReceipts(request);
}

export async function POST(request: Request) {
  return processReceipts(request);
}
