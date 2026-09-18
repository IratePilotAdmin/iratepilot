import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONNECTION_ID = /^[A-Za-z0-9_-]{1,80}$/;
const SAFE_CODE = /^[a-z0-9_-]{1,80}$/;
const ACKNOWLEDGEMENTS = new Set([
  "duplicate", "stale", "review-required", "reservation-staged", "cancellation-staged",
]);

type NativePmsConnection = {
  id: string;
  tenantId: string;
  propertyId: string;
  otaPropertyId: string;
  endpoint: string;
  publishableKey: string;
  secret: string;
};

type OutboxRow = {
  event_id: string;
  booking_id: string;
  property_id: string;
  connection_id: string;
  tenant_id: string;
  pms_property_id: string;
  source_version: number | string;
  lease_token: string;
  event_payload: {
    eventId?: unknown;
    sourceVersion?: unknown;
    booking?: { id?: unknown; property_id?: unknown };
  };
};

export type NativeDeliveryResult = {
  outcome: "disabled" | "idle" | "acknowledged" | "retry" | "review-required" | "lease-lost";
  eventId?: string;
  receiverOutcome?: string | null;
};

type DeliveryEnvironment = Record<string, string | undefined>;

function configuredConnection(env: DeliveryEnvironment): NativePmsConnection | null {
  if (env.IRP_PMS_SYNC_ENABLED !== "true") return null;
  const values = {
    id: env.IRP_PMS_CONNECTION_ID?.trim() ?? "",
    tenantId: env.IRP_PMS_TENANT_ID?.trim() ?? "",
    propertyId: env.IRP_PMS_PROPERTY_ID?.trim() ?? "",
    otaPropertyId: env.IRP_PMS_OTA_PROPERTY_ID?.trim() ?? "",
    endpoint: env.IRP_PMS_DESTINATION_URL?.trim() ?? "",
    publishableKey: env.IRP_PMS_DESTINATION_PUBLISHABLE_KEY?.trim() ?? "",
    secret: env.IRP_PMS_SIGNING_SECRET ?? "",
  };
  if (!CONNECTION_ID.test(values.id)
    || !UUID.test(values.tenantId)
    || !UUID.test(values.propertyId)
    || !UUID.test(values.otaPropertyId)
    || !/^sb_publishable_[A-Za-z0-9_-]{16,240}$/.test(values.publishableKey)
    || Buffer.byteLength(values.secret) < 32
    || Buffer.byteLength(values.secret) > 512) {
    throw new Error("Native PMS delivery configuration is incomplete.");
  }
  let destination: URL;
  try {
    destination = new URL(values.endpoint);
  } catch {
    throw new Error("Native PMS destination is invalid.");
  }
  if (destination.protocol !== "https:"
    || destination.username
    || destination.password
    || destination.port
    || destination.search
    || destination.hash
    || destination.pathname !== "/rest/v1/rpc/irp_pms_ota_gateway"
    || !destination.hostname.endsWith(".supabase.co")) {
    throw new Error("Native PMS destination is invalid.");
  }
  return { ...values, endpoint: destination.href };
}

function signedBody(event: unknown, connection: NativePmsConnection, now: number) {
  const raw = JSON.stringify(event);
  if (Buffer.byteLength(raw) > 64 * 1024) throw new Error("Native PMS event is too large.");
  const timestamp = String(Math.floor(now / 1000));
  const signature = createHmac("sha256", connection.secret)
    .update(`${timestamp}.${connection.id}.`)
    .update(raw)
    .digest("hex");
  return JSON.stringify({
    p_raw_body: raw,
    p_connection: connection.id,
    p_timestamp: timestamp,
    p_signature: signature,
  });
}

async function sendEvent(
  event: OutboxRow["event_payload"],
  connection: NativePmsConnection,
  fetcher: typeof fetch,
  now: number,
) {
  let response: Response;
  try {
    response = await fetcher(connection.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: connection.publishableKey },
      body: signedBody(event, connection, now),
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { outcome: "retry" as const, reason: "transport_failure" };
  }
  if (response.status === 429 || response.status >= 500) {
    return { outcome: "retry" as const, reason: "receiver_unavailable" };
  }
  if (response.status !== 200) {
    return { outcome: "review-required" as const, reason: `http_${response.status}` };
  }
  let wrapper: { status?: unknown; body?: Record<string, unknown> };
  try {
    const text = await response.text();
    if (Buffer.byteLength(text) > 64 * 1024) throw new Error("large response");
    wrapper = JSON.parse(text) as typeof wrapper;
  } catch {
    return { outcome: "retry" as const, reason: "invalid_acknowledgement" };
  }
  const reply = wrapper.body;
  if (wrapper.status !== 200
    || !reply
    || reply.eventId !== event.eventId
    || reply.sourceVersion !== event.sourceVersion
    || typeof reply.outcome !== "string"
    || !ACKNOWLEDGEMENTS.has(reply.outcome)) {
    return { outcome: "retry" as const, reason: "invalid_acknowledgement" };
  }
  return { outcome: "acknowledged" as const, receiverOutcome: reply.outcome };
}

export async function deliverNativePmsEventOnce({
  env = process.env,
  fetcher = fetch,
  now = Date.now(),
}: {
  env?: DeliveryEnvironment;
  fetcher?: typeof fetch;
  now?: number;
} = {}): Promise<NativeDeliveryResult> {
  const connection = configuredConnection(env);
  if (!connection) return { outcome: "disabled" };

  const admin = createAdminClient();
  const scope = [{
    connection_id: connection.id,
    property_id: connection.otaPropertyId,
    tenant_id: connection.tenantId,
    pms_property_id: connection.propertyId,
  }];
  const claim = await admin.rpc("irp_pms_claim_configured_event", { p_connections: scope });
  if (claim.error) throw new Error("Native PMS outbox claim failed.");
  const rows = claim.data as OutboxRow[] | null;
  if (!Array.isArray(rows)) throw new Error("Native PMS outbox claim was invalid.");
  if (rows.length === 0) return { outcome: "idle" };
  if (rows.length !== 1) throw new Error("Native PMS outbox returned an unexpected claim count.");

  const row = rows[0];
  let result: Awaited<ReturnType<typeof sendEvent>> | { outcome: "review-required"; reason: string };
  const sourceVersion = Number(row.source_version);
  if (row.connection_id !== connection.id
    || row.tenant_id !== connection.tenantId
    || row.pms_property_id !== connection.propertyId
    || row.property_id !== connection.otaPropertyId) {
    result = { outcome: "review-required", reason: "connection_scope_mismatch" };
  } else if (row.event_payload?.eventId !== row.event_id
    || row.event_payload?.sourceVersion !== sourceVersion
    || row.event_payload?.booking?.id !== row.booking_id
    || row.event_payload?.booking?.property_id !== row.property_id) {
    result = { outcome: "review-required", reason: "event_scope_mismatch" };
  } else {
    result = await sendEvent(row.event_payload, connection, fetcher, now);
  }

  const detail = "receiverOutcome" in result ? result.receiverOutcome : result.reason;
  const code = typeof detail === "string" && SAFE_CODE.test(detail) ? detail : "delivery_result";
  const finish = await admin.rpc("irp_pms_finish_event", {
    p_event: row.event_id,
    p_lease: row.lease_token,
    p_outcome: result.outcome,
    p_code: code,
  });
  if (finish.error) throw new Error("Native PMS outbox acknowledgement failed.");
  if (finish.data !== true) return { outcome: "lease-lost", eventId: row.event_id };
  return {
    outcome: result.outcome,
    eventId: row.event_id,
    receiverOutcome: "receiverOutcome" in result ? result.receiverOutcome : null,
  };
}

export async function drainNativePmsEvents(limit = 10) {
  const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
  const results: NativeDeliveryResult[] = [];
  for (let index = 0; index < boundedLimit; index += 1) {
    const result = await deliverNativePmsEventOnce();
    results.push(result);
    if (["disabled", "idle", "retry", "review-required", "lease-lost"].includes(result.outcome)) break;
  }
  return results;
}
