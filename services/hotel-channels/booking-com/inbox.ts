import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { BookingComInboundReservation } from "./reservation-parser";
import type { BookingComReservationKind } from "./reservations";

const envelopeVersion = 1;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function keyMaterial() {
  const encoded = process.env.OTA_RESERVATION_PII_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("ota_reservation_encryption_unavailable");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("ota_reservation_encryption_unavailable");
  return key;
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value: object, allowed: string[]) {
  return Object.keys(value).sort().join(",") === [...allowed].sort().join(",");
}

function validateNormalizedReservation(value: BookingComInboundReservation) {
  if (!value || typeof value !== "object" || !exactKeys(value, ["reservationIds", "providerPropertyId", "status", "guest", "rooms"])
    || !/^[A-Za-z0-9_-]{1,80}$/.test(value.providerPropertyId)
    || typeof value.status !== "string" || !/^[A-Za-z0-9 _-]{1,40}$/.test(value.status)
    || !Array.isArray(value.reservationIds) || value.reservationIds.length < 1 || value.reservationIds.length > 4
    || !value.reservationIds.every((id) => id && typeof id === "object"
      && exactKeys(id, ["value", ...(id.source !== undefined ? ["source"] : []), ...(id.type !== undefined ? ["type"] : [])])
      && typeof id.value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id.value)
      && (id.source === undefined || typeof id.source === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(id.source))
      && (id.type === undefined || typeof id.type === "string" && /^[A-Za-z0-9_-]{1,16}$/.test(id.type)))
    || !value.guest || typeof value.guest !== "object"
    || !exactKeys(value.guest, ["name", ...(value.guest.email !== undefined ? ["email"] : []), ...(value.guest.phone !== undefined ? ["phone"] : [])])
    || typeof value.guest.name !== "string" || !value.guest.name.trim() || value.guest.name.length > 200
    || /[\u0000-\u001f\u007f]/.test(value.guest.name)
    || (value.guest.email !== undefined && (typeof value.guest.email !== "string" || value.guest.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.guest.email)))
    || (value.guest.phone !== undefined && (typeof value.guest.phone !== "string" || value.guest.phone.length > 40 || /[\u0000-\u001f\u007f]/.test(value.guest.phone)))
    || !Array.isArray(value.rooms) || value.rooms.length < 1 || value.rooms.length > 20
    || !value.rooms.every((room) => room && typeof room === "object"
      && exactKeys(room, ["providerRoomTypeId", "providerRatePlanId", "checkIn", "checkOut", "guests", "totalMinor", "currency"])
      && typeof room.providerRoomTypeId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(room.providerRoomTypeId)
      && typeof room.providerRatePlanId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(room.providerRatePlanId)
      && typeof room.checkIn === "string" && typeof room.checkOut === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(room.checkIn) && /^\d{4}-\d{2}-\d{2}$/.test(room.checkOut)
      && room.checkOut > room.checkIn
      && Number.isInteger(room.guests) && room.guests >= 1 && room.guests <= 30
      && Number.isSafeInteger(room.totalMinor) && room.totalMinor >= 0
      && typeof room.currency === "string" && /^[A-Z]{3}$/.test(room.currency))) {
    throw new Error("invalid_ota_reservation_inbox_input");
  }
}

function associatedData(input: { connectionId: string; propertyId: string; reservationIdDigest: string; payloadDigest: string }) {
  return Buffer.from([
    "irp-ota-reservation-pii-v1", input.connectionId, input.propertyId,
    input.reservationIdDigest, input.payloadDigest,
  ].join("\u0000"), "utf8");
}

export type BookingComInboxInput = {
  connectionId: string;
  propertyId: string;
  providerPropertyId: string;
  eventKind: BookingComReservationKind;
  reservation: BookingComInboundReservation;
};

export type BookingComInboxRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: unknown;
}>;

/** Encrypts only the parser's normalized fields; guest PII and raw reservation IDs never enter inbox columns. */
export async function stageBookingComReservation(
  rpc: BookingComInboxRpc,
  input: BookingComInboxInput,
) {
  if (!rpc || !input || !/^[A-Za-z0-9_-]{1,80}$/.test(input.connectionId)
    || !uuidPattern.test(input.propertyId)
    || !/^[A-Za-z0-9_-]{1,80}$/.test(input.providerPropertyId)
    || input.reservation?.providerPropertyId !== input.providerPropertyId
    || !["new", "modified_or_cancelled"].includes(input.eventKind)
    || !input.reservation) {
    throw new Error("invalid_ota_reservation_inbox_input");
  }
  validateNormalizedReservation(input.reservation);
  const primaryId = input.reservation.reservationIds[0]!.value;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(primaryId)) throw new Error("invalid_ota_reservation_identity");
  const providerStatus = input.reservation.status.toLowerCase();
  const eventKind = providerStatus.includes("cancel") ? "cancelled"
    : providerStatus.includes("modify") ? "modified"
      : providerStatus === "book" || providerStatus === "new" ? "new" : null;
  if (!eventKind || (input.eventKind === "new" && eventKind === "cancelled")
    || (input.eventKind === "modified_or_cancelled" && eventKind === "new")) {
    throw new Error("unsupported_ota_reservation_status");
  }
  const reservationIdDigest = sha256(`booking_com\u0000${input.providerPropertyId}\u0000${primaryId}`);
  const payload = Buffer.from(JSON.stringify({
    version: envelopeVersion,
    provider: "booking_com",
    eventKind,
    reservation: input.reservation,
  }), "utf8");
  if (payload.length > 100_000) throw new Error("ota_reservation_payload_too_large");
  const payloadDigest = sha256(payload);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  cipher.setAAD(associatedData({ connectionId: input.connectionId, propertyId: input.propertyId, reservationIdDigest, payloadDigest }));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const roomMappings = [...new Map(input.reservation.rooms.map((room) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(room.providerRoomTypeId)
      || !/^[A-Za-z0-9_-]{1,80}$/.test(room.providerRatePlanId)) throw new Error("invalid_ota_room_mapping");
    const item = { roomTypeId: room.providerRoomTypeId, ratePlanId: room.providerRatePlanId };
    return [`${item.roomTypeId}/${item.ratePlanId}`, item];
  })).values()];
  const { data, error } = await rpc("irp_ota_stage_reservation", {
    p_connection: input.connectionId,
    p_property: input.propertyId,
    p_provider_property_id: input.providerPropertyId,
    p_reservation_id_sha256: reservationIdDigest,
    p_payload_sha256: payloadDigest,
    p_event_kind: eventKind,
    p_ciphertext: ciphertext.toString("base64"),
    p_iv: iv.toString("base64"),
    p_tag: cipher.getAuthTag().toString("base64"),
    p_key_version: envelopeVersion,
    p_room_mappings: roomMappings,
  });
  if (error) throw new Error("ota_reservation_staging_failed");
  if (!data || typeof data !== "object" || Array.isArray(data)
    || !["received", "duplicate"].includes(String((data as Record<string, unknown>).outcome))) {
    throw new Error("ota_reservation_staging_failed");
  }
  return data as { outcome: "received" | "duplicate"; inboxId: string; status?: string };
}

/** Worker-only decrypt helper. AAD binds ciphertext to its property and event digests. */
export function decryptBookingComReservation(input: {
  connectionId: string;
  propertyId: string;
  reservationIdDigest: string;
  payloadDigest: string;
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  if (!input || !/^[A-Za-z0-9_-]{1,80}$/.test(input.connectionId) || !uuidPattern.test(input.propertyId)
    || !/^[a-f0-9]{64}$/.test(input.reservationIdDigest) || !/^[a-f0-9]{64}$/.test(input.payloadDigest)
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.ciphertext) || !/^[A-Za-z0-9+/]{16}$/.test(input.iv)
    || !/^[A-Za-z0-9+/]{22}==$/.test(input.tag)) throw new Error("ota_reservation_envelope_invalid");
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(input.iv, "base64"));
  decipher.setAAD(associatedData({ connectionId: input.connectionId, propertyId: input.propertyId, reservationIdDigest: input.reservationIdDigest, payloadDigest: input.payloadDigest }));
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  const clear = Buffer.concat([decipher.update(Buffer.from(input.ciphertext, "base64")), decipher.final()]);
  if (!timingSafeEqual(Buffer.from(sha256(clear), "hex"), Buffer.from(input.payloadDigest, "hex"))) {
    throw new Error("ota_reservation_envelope_invalid");
  }
  const decoded: unknown = JSON.parse(clear.toString("utf8"));
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("ota_reservation_envelope_invalid");
  const record = decoded as Record<string, unknown>;
  if (record.version !== envelopeVersion || record.provider !== "booking_com"
    || !["new", "modified_or_cancelled"].includes(String(record.eventKind))
    || !record.reservation || typeof record.reservation !== "object" || Array.isArray(record.reservation)) {
    throw new Error("ota_reservation_envelope_invalid");
  }
  const reservation = record.reservation as BookingComInboundReservation;
  validateNormalizedReservation(reservation);
  const reservationIdDigest = sha256(`booking_com\u0000${reservation.providerPropertyId}\u0000${reservation.reservationIds[0]!.value}`);
  if (!timingSafeEqual(Buffer.from(reservationIdDigest, "hex"), Buffer.from(input.reservationIdDigest, "hex"))) {
    throw new Error("ota_reservation_envelope_invalid");
  }
  return {
    version: envelopeVersion,
    provider: "booking_com" as const,
    eventKind: record.eventKind as BookingComReservationKind,
    reservation,
  } as {
    version: typeof envelopeVersion;
    provider: "booking_com";
    eventKind: BookingComReservationKind;
    reservation: BookingComInboundReservation;
  };
}
