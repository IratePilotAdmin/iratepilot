import { createHmac } from "node:crypto";
import { after } from "next/server";
import { decryptPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONNECTION_ID = /^[A-Za-z0-9_-]{1,80}$/;
const SAFE_CODE = /^[a-z0-9_-]{1,80}$/;
const MAX_ACKNOWLEDGEMENT_BYTES = 64 * 1024;
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
  secret: string | null;
};

type StoredDeliveryConnection = {
  connection_id: string;
  property_id: string;
  tenant_id: string;
  pms_property_id: string;
  secret_ciphertext: string | null;
  secret_initialization_vector: string | null;
  secret_authentication_tag: string | null;
  secret_key_version: number | null;
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

function destinationConfiguration(env: DeliveryEnvironment) {
  if (env.IRP_PMS_SYNC_ENABLED !== "true") return null;
  const endpoint = env.IRP_PMS_DESTINATION_URL?.trim() ?? "";
  const publishableKey = env.IRP_PMS_DESTINATION_PUBLISHABLE_KEY?.trim() ?? "";
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,240}$/.test(publishableKey)) {
    throw new Error("Native PMS delivery configuration is incomplete.");
  }
  let destination: URL;
  try {
    destination = new URL(endpoint);
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
  return { endpoint: destination.href, publishableKey };
}

function configuredConnections(rows: unknown, destination: ReturnType<typeof destinationConfiguration>): NativePmsConnection[] {
  if (!destination) return [];
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("Native PMS delivery connections were invalid.");
  const scopes = new Set<string>();
  return rows.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Native PMS delivery connections were invalid.");
    const row = value as StoredDeliveryConnection;
    if (typeof row.connection_id !== "string" || !CONNECTION_ID.test(row.connection_id)
      || typeof row.property_id !== "string" || !UUID.test(row.property_id)
      || typeof row.tenant_id !== "string" || !UUID.test(row.tenant_id)
      || typeof row.pms_property_id !== "string" || !UUID.test(row.pms_property_id)) {
      throw new Error("Native PMS delivery connections were invalid.");
    }
    const key = `${row.connection_id}/${row.property_id}/${row.tenant_id}/${row.pms_property_id}`;
    if (scopes.has(key)) throw new Error("Native PMS delivery connections were ambiguous.");
    scopes.add(key);

    let secret: string | null = null;
    if (typeof row.secret_ciphertext === "string"
      && typeof row.secret_initialization_vector === "string"
      && typeof row.secret_authentication_tag === "string"
      && Number.isInteger(row.secret_key_version)
      && row.secret_key_version === 1) {
      try {
        const credentials = decryptPmsCredentials({
          ciphertext: row.secret_ciphertext,
          initializationVector: row.secret_initialization_vector,
          authenticationTag: row.secret_authentication_tag,
          keyVersion: row.secret_key_version,
        });
        const candidate = credentials.IRATEPILOT_PMS_ARI_SIGNING_SECRET;
        if (typeof candidate === "string"
          && Buffer.byteLength(candidate) >= 32
          && Buffer.byteLength(candidate) <= 512) secret = candidate;
      } catch {
        // Keep this property's event claimable so it can be acknowledged into
        // review with a safe code; never log or return encrypted credentials.
      }
    }
    return {
      id: row.connection_id,
      tenantId: row.tenant_id,
      propertyId: row.pms_property_id,
      otaPropertyId: row.property_id,
      endpoint: destination.endpoint,
      publishableKey: destination.publishableKey,
      secret,
    };
  });
}

function signedBody(event: unknown, connection: NativePmsConnection, now: number) {
  if (!connection.secret) throw new Error("Native PMS delivery credentials are unavailable.");
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
  if ((response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
    void response.body?.cancel().catch(() => undefined);
    return { outcome: "retry" as const, reason: "invalid_acknowledgement" };
  }
  let wrapper: { status?: unknown; body?: unknown };
  try {
    const text = await readBoundedResponse(response, MAX_ACKNOWLEDGEMENT_BYTES);
    if (text === null) throw new Error("large response");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid acknowledgement object");
    wrapper = parsed as typeof wrapper;
  } catch {
    return { outcome: "retry" as const, reason: "invalid_acknowledgement" };
  }
  const reply = wrapper.body;
  const receipt = reply as Record<string, unknown> | null | undefined;
  if (wrapper.status !== 200
    || !reply
    || typeof reply !== "object"
    || Array.isArray(reply)
    || receipt?.eventId !== event.eventId
    || receipt?.sourceVersion !== event.sourceVersion
    || typeof receipt?.outcome !== "string"
    || !ACKNOWLEDGEMENTS.has(receipt.outcome)) {
    return { outcome: "retry" as const, reason: "invalid_acknowledgement" };
  }
  return { outcome: "acknowledged" as const, receiverOutcome: receipt.outcome };
}

async function readBoundedResponse(response: Response, maximumBytes: number): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes));
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
  const destination = destinationConfiguration(env);
  if (!destination) return { outcome: "disabled" };

  const admin = createAdminClient();
  const configured = await admin.rpc("irp_pms_list_configured_delivery_connections");
  if (configured.error) throw new Error("Native PMS delivery configuration could not be loaded.");
  const connections = configuredConnections(configured.data, destination);
  if (connections.length === 0) return { outcome: "idle" };
  const scope = connections.map((connection) => ({
    connection_id: connection.id,
    property_id: connection.otaPropertyId,
    tenant_id: connection.tenantId,
    pms_property_id: connection.propertyId,
  }));
  const claim = await admin.rpc("irp_pms_claim_configured_event", { p_connections: scope });
  if (claim.error) throw new Error("Native PMS outbox claim failed.");
  const rows = claim.data as OutboxRow[] | null;
  if (!Array.isArray(rows)) throw new Error("Native PMS outbox claim was invalid.");
  if (rows.length === 0) return { outcome: "idle" };
  if (rows.length !== 1) throw new Error("Native PMS outbox returned an unexpected claim count.");

  const row = rows[0];
  const connection = connections.find((candidate) => candidate.id === row.connection_id
    && candidate.tenantId === row.tenant_id
    && candidate.propertyId === row.pms_property_id
    && candidate.otaPropertyId === row.property_id);
  let result: Awaited<ReturnType<typeof sendEvent>> | { outcome: "review-required"; reason: string };
  const sourceVersion = Number(row.source_version);
  if (!connection) {
    result = { outcome: "review-required", reason: "connection_scope_mismatch" };
  } else if (row.event_payload?.eventId !== row.event_id
    || row.event_payload?.sourceVersion !== sourceVersion
    || row.event_payload?.booking?.id !== row.booking_id
    || row.event_payload?.booking?.property_id !== row.property_id) {
    result = { outcome: "review-required", reason: "event_scope_mismatch" };
  } else if (!connection.secret) {
    result = { outcome: "review-required", reason: "credential_unavailable" };
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
    // A malformed property event is durably moved to review; allow unrelated
    // property events to continue through the same bounded drain.
    if (["disabled", "idle", "retry", "lease-lost"].includes(result.outcome)) break;
  }
  return results;
}

/** Wake durable reservation delivery after a booking mutation. The scheduled
 * worker remains the recovery path if the post-response run cannot finish. */
export function scheduleNativePmsOutboxDelivery() {
  after(async () => {
    try {
      await drainNativePmsEvents(10);
    } catch (error) {
      console.error("Native PMS event delivery deferred to authenticated cron recovery", error);
    }
  });
}
