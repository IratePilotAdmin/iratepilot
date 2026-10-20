import "server-only";
import { nativePmsReservationSignature } from "@/lib/native-pms-reservation-delivery";
import { decryptPmsCredentials, type EncryptedPmsCredentials } from "@/lib/integrations/pms-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingComMachineAccountToken } from "@/services/hotel-channels/booking-com/machine-account";
import { decryptBookingComReservation } from "@/services/hotel-channels/booking-com/inbox";
import { mapBookingComRoomToPmsFolio } from "@/services/hotel-channels/booking-com/folio-mapping";
import { buildBookingComReservationAcknowledgement, callBookingComReservationTestApi } from "@/services/hotel-channels/booking-com/reservations";
import { getBookingComReservationId } from "@/services/hotel-channels/booking-com/reservation-parser";
import { bookingComAcknowledgementSucceeded } from "@/services/hotel-channels/booking-com/reservation-parser";

type ImportedConnection = {
  connectionId: string;
  propertyId: string;
  providerPropertyId: string;
  machineAccountId: string;
  pmsConnectionId: string;
  tenantId: string;
  pmsPropertyId: string;
  encryptedSecret: EncryptedPmsCredentials;
};

type InboxItem = {
  id: string;
  connection_id: string;
  property_id: string;
  provider_reservation_id_sha256: string;
  payload_sha256: string;
  event_kind: "new" | "modified" | "cancelled";
  source_version: number;
  pii_ciphertext: string;
  pii_initialization_vector: string;
  pii_authentication_tag: string;
  pii_key_version: number;
  lease_token: string;
};

type Store = {
  listConnections(): Promise<ImportedConnection[]>;
  claim(): Promise<InboxItem | null>;
  finish(item: InboxItem, outcome: "imported" | "retry" | "review", code: string): Promise<boolean>;
};

type ImportConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  credentialEncryptionKey: string;
  reservationEncryptionKey: string;
  destinationUrl: string;
  destinationPublishableKey: string;
  hotelFeesEnabled?: boolean;
};

type Dependencies = {
  store?: Store;
  fetcher?: typeof fetch;
  getToken?: (accountId: string, fetcher: typeof fetch) => Promise<string>;
  decryptSecret?: (value: EncryptedPmsCredentials, key: string) => Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTION = /^[A-Za-z0-9_-]{1,80}$/;
const PUBLISHABLE = /^sb_publishable_[A-Za-z0-9_-]{16,240}$/;
// Only these gateway receipts prove that a cancellation is already durable or
// superseded. Review-required and reservation-staged are not acknowledgements.
const CANCELLATION_RECEIPTS = new Set(["cancellation-staged", "duplicate", "stale"]);

function validSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
      && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

function createStore(): Store {
  const admin = () => createAdminClient();
  return {
    async listConnections() {
      const client = admin();
      const [channelResult, sourceResult, secretResult] = await Promise.all([
        client.from("irp_ota_channel_connections")
          .select("connection_id,property_id,provider_property_id,machine_account_id")
          .eq("provider", "booking_com").eq("environment", "test").eq("enabled", true)
          .eq("partner_approved", true).eq("pii_compliance_approved", true)
          .not("machine_account_id", "is", null).limit(50),
        client.from("irp_pms_outbox_connections")
          .select("property_id,connection_id,tenant_id,pms_property_id")
          .eq("enabled", true).eq("delivery_enabled", true).eq("environment", "sandbox").limit(100),
        client.from("irp_pms_native_ari_connections")
          .select("property_id,connection_id,enabled,secret_ciphertext,secret_initialization_vector,secret_authentication_tag,secret_key_version")
          .eq("enabled", true).limit(100),
      ]);
      if (channelResult.error || sourceResult.error || secretResult.error
        || !Array.isArray(channelResult.data) || !Array.isArray(sourceResult.data) || !Array.isArray(secretResult.data)) {
        throw new Error("booking_com_reservation_import_registry_unavailable");
      }
      const sources = sourceResult.data as Array<Record<string, unknown>>;
      const secrets = secretResult.data as Array<Record<string, unknown>>;
      const result: ImportedConnection[] = [];
      for (const raw of channelResult.data as Array<Record<string, unknown>>) {
        const sourceMatches = sources.filter((row) => row.property_id === raw.property_id);
        if (sourceMatches.length !== 1) continue;
        const source = sourceMatches[0]!;
        const secretMatches = secrets.filter((row) => row.property_id === raw.property_id && row.connection_id === source.connection_id);
        if (secretMatches.length !== 1) continue;
        const secret = secretMatches[0]!;
        if (!CONNECTION.test(String(raw.connection_id ?? "")) || !UUID.test(String(raw.property_id ?? ""))
          || !CONNECTION.test(String(raw.provider_property_id ?? "")) || !UUID.test(String(raw.machine_account_id ?? ""))
          || !CONNECTION.test(String(source.connection_id ?? "")) || !UUID.test(String(source.tenant_id ?? ""))
          || !UUID.test(String(source.pms_property_id ?? "")) || secret.secret_key_version !== 1
          || typeof secret.secret_ciphertext !== "string" || typeof secret.secret_initialization_vector !== "string"
          || typeof secret.secret_authentication_tag !== "string") continue;
        result.push({
          connectionId: String(raw.connection_id), propertyId: String(raw.property_id),
          providerPropertyId: String(raw.provider_property_id), machineAccountId: String(raw.machine_account_id),
          pmsConnectionId: String(source.connection_id), tenantId: String(source.tenant_id), pmsPropertyId: String(source.pms_property_id),
          encryptedSecret: {
            ciphertext: String(secret.secret_ciphertext), initializationVector: String(secret.secret_initialization_vector),
            authenticationTag: String(secret.secret_authentication_tag), keyVersion: 1,
          },
        });
      }
      return result;
    },
    async claim() {
      const { data, error } = await admin().rpc("irp_ota_claim_booking_com_reservation", { p_limit: 1 });
      if (error || !Array.isArray(data) || data.length > 1) throw new Error("booking_com_reservation_claim_failed");
      if (!data.length) return null;
      const row = data[0] as Record<string, unknown>;
      if (!UUID.test(String(row.id ?? "")) || !CONNECTION.test(String(row.connection_id ?? ""))
        || !UUID.test(String(row.property_id ?? "")) || !UUID.test(String(row.lease_token ?? ""))
        || !/^[a-f0-9]{64}$/.test(String(row.provider_reservation_id_sha256 ?? ""))
        || !/^[a-f0-9]{64}$/.test(String(row.payload_sha256 ?? ""))
        || !["new", "modified", "cancelled"].includes(String(row.event_kind))
        || typeof row.source_version !== "number" || !Number.isSafeInteger(row.source_version) || row.source_version < 1
        || typeof row.pii_ciphertext !== "string" || typeof row.pii_initialization_vector !== "string"
        || typeof row.pii_authentication_tag !== "string" || row.pii_key_version !== 1) {
        throw new Error("booking_com_reservation_claim_invalid");
      }
      return row as unknown as InboxItem;
    },
    async finish(item, outcome, code) {
      const { data, error } = await admin().rpc("irp_ota_finish_booking_com_reservation", {
        p_inbox_id: item.id, p_lease_token: item.lease_token, p_outcome: outcome, p_result_code: code,
      });
      if (error || typeof data !== "boolean") throw new Error("booking_com_reservation_finish_failed");
      return data;
    },
  };
}

async function boundedText(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel().catch(() => undefined); return null; }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();if (done) break;
      size += value.byteLength;if (size > maxBytes) { await reader.cancel().catch(() => undefined);return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size)); }
  catch { return null; }
}

/** Imports and acknowledges only cancellations until OTA charge components can be mapped without changing tax classifications. */
export async function runBookingComReservationImport(
  input: ImportConfig,
  dependencies: Dependencies = {},
  now = Date.now(),
) {
  if (!input || !validSupabaseUrl(input.supabaseUrl) || input.serviceRoleKey.length < 32
    || Buffer.from(input.credentialEncryptionKey, "base64").byteLength !== 32
    || Buffer.from(input.reservationEncryptionKey, "base64").byteLength !== 32
    || !PUBLISHABLE.test(input.destinationPublishableKey)) throw new Error("booking_com_reservation_import_configuration_invalid");
  const destination = new URL(input.destinationUrl);
  if (destination.protocol !== "https:" || !/[a-z0-9-]+\.supabase\.co$/.test(destination.hostname)
    || destination.username || destination.password || destination.port
    || destination.pathname !== "/rest/v1/rpc/irp_pms_ota_gateway" || destination.search || destination.hash) {
    throw new Error("booking_com_reservation_import_configuration_invalid");
  }
  const store = dependencies.store ?? createStore();
  const fetcher = dependencies.fetcher ?? fetch;
  const getToken = dependencies.getToken ?? ((id, transport) => getBookingComMachineAccountToken(id, { fetcher: transport }));
  const decryptSecret = dependencies.decryptSecret ?? decryptPmsCredentials;
  const connections = await store.listConnections();
  if (connections.length > 50) throw new Error("booking_com_reservation_import_connection_limit_exceeded");
  const item = await store.claim();
  if (!item) return { outcome: "idle" as const };
  const connection = connections.find((row) => row.connectionId === item.connection_id && row.propertyId === item.property_id);
  const finish = (outcome: "imported" | "retry" | "review", code: string) => store.finish(item, outcome, code);
  if (!connection) {
    const saved = await finish("review", "pms_connection_missing");
    return { outcome: saved ? "review" as const : "lease_lost" as const, code: "pms_connection_missing" };
  }

  let decoded: ReturnType<typeof decryptBookingComReservation>;
  let pmsSecret: string;
  try {
    decoded = decryptBookingComReservation({
      connectionId: connection.connectionId, propertyId: connection.propertyId,
      reservationIdDigest: item.provider_reservation_id_sha256, payloadDigest: item.payload_sha256,
      ciphertext: item.pii_ciphertext, iv: item.pii_initialization_vector, tag: item.pii_authentication_tag,
    }, input.reservationEncryptionKey);
    pmsSecret = decryptSecret(connection.encryptedSecret, input.credentialEncryptionKey).IRATEPILOT_PMS_ARI_SIGNING_SECRET ?? "";
  } catch {
    const saved = await finish("review", "credential_or_payload_invalid");
    return { outcome: saved ? "review" as const : "lease_lost" as const, code: "credential_or_payload_invalid" };
  }

  if (item.event_kind !== decoded.eventKind) {
    const saved = await finish("review", "provider_event_kind_mismatch");
    return { outcome: saved ? "review" as const : "lease_lost" as const, code: "provider_event_kind_mismatch" };
  }
  const parentReservationId = getBookingComReservationId(decoded.reservation.reservationIds);
  const isCancellation = decoded.eventKind === "cancelled";
  const rooms = decoded.reservation.rooms;
  const isGroup = rooms.length > 1;
  if (isGroup && (decoded.eventKind !== "new" || parentReservationId.length > 60)) {
    const saved = await finish("review", "multi_room_change_requires_review");
    return { outcome: saved ? "review" as const : "lease_lost" as const, code: "multi_room_change_requires_review" };
  }
  let bookingRecords: Array<Record<string, unknown>> = [];
  if (isCancellation) {
    if (isGroup) {
      const saved = await finish("review", "multi_room_cancellation_requires_review");
      return { outcome: saved ? "review" as const : "lease_lost" as const, code: "multi_room_cancellation_requires_review" };
    }
    bookingRecords = [{ id: parentReservationId, property_id: connection.propertyId, status: "cancelled" }];
  } else {
    const mapped = rooms.map((room) => mapBookingComRoomToPmsFolio(room, decoded.reservation.paymentMode));
    const issue = mapped.find((result) => result.outcome === "review");
    if (issue?.outcome === "review") {
      const saved = await finish("review", issue.code);
      return { outcome: saved ? "review" as const : "lease_lost" as const, code: issue.code };
    }
    const records: Array<Record<string, unknown>> = [];
    for (let index = 0; index < rooms.length; index++) {
      const room = rooms[index]!;
      const mapping = mapped[index]!;
      if (mapping.outcome !== "mapped") throw new Error("booking_com_folio_mapping_inconsistent");
      if (!input.hotelFeesEnabled && mapping.amounts.hotel_fees !== "0.00") {
        const saved = await finish("review", "hotel_fee_migration_required");
        return { outcome: saved ? "review" as const : "lease_lost" as const, code: "hotel_fee_migration_required" };
      }
      const mappedAmounts: Record<string, unknown> = { ...mapping.amounts };
      if (!input.hotelFeesEnabled) delete mappedAmounts.hotel_fees;
      records.push({
        id: isGroup ? `${parentReservationId}_r${room.providerRoomIndex}` : parentReservationId,
        property_id: connection.propertyId,
        room_id: room.providerRoomTypeId,
        customer_id: null,
        confirmation_code: parentReservationId,
        status: "confirmed",
        check_in: room.checkIn,
        check_out: room.checkOut,
        guests: room.guests,
        ...mappedAmounts,
        guest_name: decoded.reservation.guest.name,
      });
    }
    bookingRecords = records;
  }
  const rawBody = isGroup
    ? JSON.stringify({ parentReservationId, sourceVersion: 1, rooms: rooms.map((room, index) => ({
      roomIndex: room.providerRoomIndex,
      eventId: `bc-${parentReservationId}_r${room.providerRoomIndex}-1`,
      sourceVersion: 1,
      booking: bookingRecords[index],
    })) })
    : JSON.stringify({
      source: "booking_com", eventId: item.id, sourceVersion: item.source_version,
      booking: bookingRecords[0],
    });
  const pmsUrl = new URL(input.destinationUrl);
  if (isGroup) pmsUrl.pathname = pmsUrl.pathname.replace(/irp_pms_ota_gateway$/, "irp_pms_ota_gateway_group");
  const expectedPmsOutcomes = isGroup ? new Set(["reservation-group-staged", "duplicate"])
    : isCancellation ? CANCELLATION_RECEIPTS : new Set(["reservation-staged", "duplicate", "stale"]);
  if (typeof pmsSecret !== "string" || pmsSecret.length < 32) {
    const saved = await finish("review", "pms_signing_secret_invalid");
    return { outcome: saved ? "review" as const : "lease_lost" as const, code: "pms_signing_secret_invalid" };
  }
  let token: string;
  try {
    token = await getToken(connection.machineAccountId, fetcher);
  } catch {
    const saved = await finish("retry", "provider_token_unavailable");
    return { outcome: saved ? "retry" as const : "lease_lost" as const, code: "provider_token_unavailable" };
  }
  let receipt: Record<string, unknown> | null = null;
  try {
    const timestamp = String(Math.floor(now / 1000));
    const response = await fetcher(pmsUrl.href, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { apikey: input.destinationPublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_raw_body: rawBody, p_connection: connection.pmsConnectionId, p_timestamp: timestamp,
        p_signature: nativePmsReservationSignature(pmsSecret, timestamp, connection.pmsConnectionId, rawBody) }),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await boundedText(response, 8192);
    const parsed = text ? JSON.parse(text) as unknown : null;
    if (response.ok && parsed && typeof parsed === "object" && !Array.isArray(parsed)) receipt = parsed as Record<string, unknown>;
  } catch { /* a timed-out or malformed gateway response must be retried */ }
  const gatewayBody = receipt?.body && typeof receipt.body === "object" && !Array.isArray(receipt.body)
    ? receipt.body as Record<string, unknown> : null;
  const matchingReceipt = receipt?.status === 200 && typeof gatewayBody?.outcome === "string"
    && (isGroup ? gatewayBody?.roomCount === rooms.length : gatewayBody?.eventId === item.id
      && gatewayBody?.sourceVersion === item.source_version);
  if (matchingReceipt && gatewayBody?.outcome === "review-required") {
    const saved = await finish("review", "pms_review_required");
    return { outcome: saved ? "review" as const : "lease_lost" as const, code: "pms_review_required" };
  }
  const persisted = matchingReceipt && expectedPmsOutcomes.has(gatewayBody.outcome as string);
  if (!persisted) {
    const gatewayStatus = typeof receipt?.status === "number" ? receipt.status : null;
    const retryable = gatewayStatus === null || gatewayStatus === 408 || gatewayStatus === 425 || gatewayStatus === 429 || gatewayStatus >= 500;
    const saved = await finish(retryable ? "retry" : "review", retryable ? "pms_transport_or_storage_failure" : "pms_rejected_event");
    return { outcome: !saved ? "lease_lost" as const : retryable ? "retry" as const : "review" as const };
  }

  const acknowledgement = buildBookingComReservationAcknowledgement({
    kind: decoded.eventKind === "new" ? "new" : "modified_or_cancelled",
    reservationIds: decoded.reservation.reservationIds, persisted: true, timestamp: new Date(now).toISOString(),
  });
  const ack = await callBookingComReservationTestApi(acknowledgement, {
    mode: "test", propertyId: connection.providerPropertyId, machineAccountPropertyScope: connection.providerPropertyId,
    partnerApproved: true, reservationConnectionApproved: true, endpointEnabled: true,
    certificationComplete: true, piiComplianceApproved: true, testProperty: true,
  }, { bearerToken: token, fetcher });
  if (ack.outcome !== "received" || !bookingComAcknowledgementSucceeded(ack.body,
    decoded.eventKind === "new" ? "new" : "modified_or_cancelled")) {
    const retryable = ack.outcome === "retryable" || ack.outcome === "unknown";
    const saved = await finish(retryable ? "retry" : "review", retryable ? "provider_ack_retry" : "provider_ack_rejected");
    return { outcome: !saved ? "lease_lost" as const : retryable ? "retry" as const : "review" as const };
  }
  const saved = await finish("imported", "pms_persisted_and_provider_acknowledged");
  return { outcome: saved ? "imported" as const : "lease_lost" as const, eventId: item.id, sourceVersion: item.source_version };
}
