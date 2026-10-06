import { createHmac } from "node:crypto";
import { decryptPmsCredentials, type EncryptedPmsCredentials } from "@/lib/integrations/pms-credentials";

export type NativePmsReservationDeliveryConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  credentialEncryptionKey: string;
  endpoint: string;
  publishableKey: string;
  decryptCredentials?: (value: EncryptedPmsCredentials, key?: string) => Record<string, string>;
};

export type NativePmsReservationDeliveryResult = {
  outcome: "idle" | "delivered" | "retry" | "review" | "lease_lost";
  eventId?: string;
  code?: string;
};

type ClaimedReservation = {
  eventId: string;
  connectionId: string;
  propertyId: string;
  tenantId: string;
  pmsPropertyId: string;
  leaseToken: string;
  attempt: number;
  sourceVersion: number;
  payload: Record<string, unknown>;
};

type Connection = {
  connection_id: string;
  property_id: string;
  tenant_id: string;
  pms_property_id: string;
  secret_ciphertext: string;
  secret_initialization_vector: string;
  secret_authentication_tag: string;
  secret_key_version: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const connectionId = /^[A-Za-z0-9_-]{1,80}$/;
const allowedOutcomes = new Set([
  "applied", "duplicate", "stale", "review-required", "reservation-staged", "cancellation-staged",
]);
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

function parseSettings(input: NativePmsReservationDeliveryConfig) {
  let supabase: URL;
  try { supabase = new URL(input.supabaseUrl); } catch { throw new Error("Reservation worker Supabase URL is invalid."); }
  if (supabase.protocol !== "https:" || !/[a-z0-9-]+\.supabase\.co$/.test(supabase.hostname)
    || supabase.username || supabase.password || supabase.port || supabase.pathname !== "/" || supabase.search || supabase.hash) {
    throw new Error("Reservation worker Supabase URL is invalid.");
  }
  if (typeof input.serviceRoleKey !== "string" || input.serviceRoleKey.length < 32 || input.serviceRoleKey.length > 8192) {
    throw new Error("Reservation worker database credential is invalid.");
  }
  if (typeof input.credentialEncryptionKey !== "string" || Buffer.from(input.credentialEncryptionKey, "base64").byteLength !== 32) {
    throw new Error("Reservation credential encryption is unavailable.");
  }
  let gateway: URL;
  try { gateway = new URL(input.endpoint); } catch { throw new Error("Reservation worker gateway URL is invalid."); }
  if (gateway.protocol !== "https:" || !/[a-z0-9-]+\.supabase\.co$/.test(gateway.hostname)
    || gateway.username || gateway.password || gateway.port || gateway.pathname !== "/rest/v1/rpc/irp_pms_ota_gateway"
    || gateway.search || gateway.hash) throw new Error("Reservation worker gateway URL is invalid.");
  if (typeof input.publishableKey !== "string" || !/^sb_publishable_[A-Za-z0-9_-]{16,240}$/.test(input.publishableKey)) {
    throw new Error("Reservation worker gateway credential is invalid.");
  }
  return {
    rpcUrl: `${supabase.href}rest/v1/rpc/`, serviceRoleKey: input.serviceRoleKey,
    endpoint: gateway.href, publishableKey: input.publishableKey,
    credentialEncryptionKey: input.credentialEncryptionKey,
    decryptCredentials: input.decryptCredentials ?? decryptPmsCredentials,
  };
}

async function callRpc(fetcher: typeof fetch, base: string, key: string, name: string, args: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  // Supabase's modern secret keys are API keys, not JWT bearer tokens.
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetcher(base + name, {
    method: "POST", redirect: "error", cache: "no-store",
    headers,
    body: JSON.stringify(args), signal: AbortSignal.timeout(12000),
  });
  const text = await readBoundedText(response, 512 * 1024);
  if (text === null) throw new Error("Reservation worker database response is too large.");
  if (!response.ok) throw new Error(`Reservation worker database call failed: ${name}.`);
  try { return JSON.parse(text) as unknown; } catch { throw new Error(`Reservation worker database response is invalid: ${name}.`); }
}

async function readBoundedText(response: Response, maximumBytes: number): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size)); }
  catch { return null; }
}

function readClaim(value: unknown): ClaimedReservation | null {
  if (!Array.isArray(value) || value.length > 1) throw new Error("Reservation worker claim response is invalid.");
  if (value.length === 0) return null;
  const row = value[0] as Record<string, unknown>;
  const payload = row.event_payload;
  if (!uuid.test(String(row.event_id)) || !connectionId.test(String(row.connection_id))
    || !uuid.test(String(row.property_id)) || !uuid.test(String(row.tenant_id)) || !uuid.test(String(row.pms_property_id))
    || !uuid.test(String(row.lease_token)) || typeof row.attempts !== "number"
    || !Number.isInteger(row.attempts) || row.attempts < 1 || row.attempts > 5
    || typeof row.source_version !== "number" || !Number.isSafeInteger(row.source_version) || row.source_version < 1
    || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Reservation worker claim row is invalid.");
  }
  const envelope = payload as Record<string, unknown>;
  if (envelope.eventId !== row.event_id || envelope.sourceVersion !== row.source_version
    || !envelope.booking || typeof envelope.booking !== "object" || Array.isArray(envelope.booking)) {
    throw new Error("Reservation worker event envelope is invalid.");
  }
  return {
    eventId: String(row.event_id), connectionId: String(row.connection_id), propertyId: String(row.property_id),
    tenantId: String(row.tenant_id), pmsPropertyId: String(row.pms_property_id), leaseToken: String(row.lease_token),
    attempt: row.attempts, sourceVersion: row.source_version, payload: envelope,
  };
}

function readConnections(value: unknown): Array<{ scope: Omit<Connection, "secret_ciphertext" | "secret_initialization_vector" | "secret_authentication_tag" | "secret_key_version">; encrypted: EncryptedPmsCredentials }> {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Reservation worker connection registry is invalid.");
  const seenConnections = new Set<string>();
  const seenProperties = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Reservation worker connection registry is invalid.");
    const row = raw as Record<string, unknown>;
    const id = String(row.connection_id ?? "");
    const property = String(row.property_id ?? "");
    const tenant = String(row.tenant_id ?? "");
    const pmsProperty = String(row.pms_property_id ?? "");
    if (!connectionId.test(id) || !uuid.test(property) || !uuid.test(tenant) || !uuid.test(pmsProperty)
      || typeof row.secret_ciphertext !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.secret_ciphertext) || row.secret_ciphertext.length > 4096
      || typeof row.secret_initialization_vector !== "string" || !/^[A-Za-z0-9+/]{16}$/.test(row.secret_initialization_vector)
      || typeof row.secret_authentication_tag !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(row.secret_authentication_tag)
      || typeof row.secret_key_version !== "number" || !Number.isInteger(row.secret_key_version) || row.secret_key_version !== 1
      || seenConnections.has(id) || seenProperties.has(property)) {
      throw new Error("Reservation worker connection registry is invalid.");
    }
    seenConnections.add(id);
    seenProperties.add(property);
    return {
      scope: { connection_id: id, property_id: property, tenant_id: tenant, pms_property_id: pmsProperty },
      encrypted: {
        ciphertext: row.secret_ciphertext,
        initializationVector: row.secret_initialization_vector,
        authenticationTag: row.secret_authentication_tag,
        keyVersion: row.secret_key_version,
      },
    };
  });
}

function sign(secret: string, timestamp: string, connection: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${connection}.${rawBody}`, "utf8").digest("hex");
}

function classifyResponse(status: number, body: unknown, eventId: string, sourceVersion: number): { outcome: "acknowledged" | "retry" | "review-required"; code: string } {
  if (status >= 200 && status < 300) {
    const receipt = body && typeof body === "object" ? body as Record<string, unknown> : null;
    const outcome = receipt?.outcome;
    if (receipt?.eventId === eventId && receipt.sourceVersion === sourceVersion
      && typeof outcome === "string" && allowedOutcomes.has(outcome)) {
      return { outcome: "acknowledged", code: `pms_${outcome}` };
    }
    return { outcome: "retry", code: "invalid_pms_ack" };
  }
  if ([408, 425, 429].includes(status) || status >= 500) return { outcome: "retry", code: `http_${status}` };
  return { outcome: "review-required", code: `http_${status}` };
}

export async function runNativePmsReservationDelivery(
  input: NativePmsReservationDeliveryConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<NativePmsReservationDeliveryResult> {
  const config = parseSettings(input);
  const listed = readConnections(await callRpc(fetcher, config.rpcUrl, config.serviceRoleKey, "irp_pms_list_configured_delivery_connections"));
  if (!listed.length) return { outcome: "idle" };
  const connections = listed.map((item) => {
    let secret = "";
    try {
      secret = config.decryptCredentials(item.encrypted, config.credentialEncryptionKey).IRATEPILOT_PMS_ARI_SIGNING_SECRET ?? "";
    } catch { /* Invalid encrypted credentials stay unclaimed for operator review. */ }
    if (byteLength(secret) < 32 || byteLength(secret) > 512) return null;
    return { ...item.scope, secret };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  if (!connections.length) return { outcome: "idle", code: "no_valid_connection_credentials" };
  const scopes = connections.map(({ connection_id, property_id, tenant_id, pms_property_id }) => ({ connection_id, property_id, tenant_id, pms_property_id }));
  const claimed = readClaim(await callRpc(fetcher, config.rpcUrl, config.serviceRoleKey, "irp_pms_claim_configured_event", { p_connections: scopes }));
  if (!claimed) return { outcome: "idle" };

  const connection = connections.find((item) => item.connection_id === claimed.connectionId
    && item.property_id === claimed.propertyId && item.tenant_id === claimed.tenantId && item.pms_property_id === claimed.pmsPropertyId);
  let decision: { outcome: "acknowledged" | "retry" | "review-required"; code: string };
  if (!connection) {
    decision = { outcome: "review-required", code: "connection_scope_mismatch" };
  } else {
    const secret = connection.secret;
    const rawBody = JSON.stringify(claimed.payload);
    if (byteLength(rawBody) > 65536) {
      decision = { outcome: "review-required", code: "payload_too_large" };
    } else {
      const timestamp = String(Math.floor(now / 1000));
      try {
        const response = await fetcher(config.endpoint, {
          method: "POST", redirect: "error", cache: "no-store",
          headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            p_raw_body: rawBody,
            p_connection: claimed.connectionId,
            p_timestamp: timestamp,
            p_signature: sign(secret, timestamp, claimed.connectionId, rawBody),
          }),
          signal: AbortSignal.timeout(12000),
        });
        let body: unknown = null;
        const responseText = await readBoundedText(response, 8192);
        if (responseText !== null) {
          try { body = JSON.parse(responseText) as unknown; } catch { /* malformed acknowledgements require review */ }
        }
        if (response.status < 200 || response.status >= 300) {
          decision = classifyResponse(response.status, body, claimed.eventId, claimed.sourceVersion);
        } else if (body && typeof body === "object" && !Array.isArray(body)) {
          const gatewayReply = body as Record<string, unknown>;
          if (typeof gatewayReply.status !== "number" || !Number.isInteger(gatewayReply.status)) {
            decision = { outcome: "retry", code: "invalid_gateway_ack" };
          } else {
            decision = classifyResponse(gatewayReply.status, gatewayReply.body, claimed.eventId, claimed.sourceVersion);
          }
        } else {
          decision = { outcome: "retry", code: "invalid_gateway_ack" };
        }
      } catch {
        decision = { outcome: "retry", code: "transport_failure" };
      }
    }
  }

  const saved = await callRpc(fetcher, config.rpcUrl, config.serviceRoleKey, "irp_pms_finish_event", {
    p_event: claimed.eventId,
    p_lease: claimed.leaseToken,
    p_outcome: decision.outcome,
    p_code: decision.code,
  });
  if (saved !== true) return { outcome: "lease_lost", eventId: claimed.eventId, code: "lease_lost" };
  const outcome = decision.outcome === "acknowledged" ? "delivered" : decision.outcome === "retry" ? "retry" : "review";
  return { outcome, eventId: claimed.eventId, code: decision.code };
}

export function nativePmsReservationSignature(secret: string, timestamp: string, connection: string, rawBody: string) {
  if (byteLength(secret) < 32 || byteLength(secret) > 512 || !/^\d{10}$/.test(timestamp) || !connectionId.test(connection)) {
    throw new Error("Reservation signature inputs are invalid.");
  }
  return sign(secret, timestamp, connection, rawBody);
}

export async function drainNativePmsReservationDelivery(
  input: NativePmsReservationDeliveryConfig,
  fetcher: typeof fetch = fetch,
  limit = 3,
): Promise<NativePmsReservationDeliveryResult[]> {
  const bounded = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 3)) : 3;
  const results: NativePmsReservationDeliveryResult[] = [];
  for (let index = 0; index < bounded; index += 1) {
    const result = await runNativePmsReservationDelivery(input, fetcher);
    results.push(result);
    if (result.outcome !== "delivered") break;
  }
  return results;
}
