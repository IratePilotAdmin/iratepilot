import { createHash } from "node:crypto";

const connectionToken = /^[A-Za-z0-9_-]{1,80}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const reservationChangeBodyLimit = 16 * 1024;

export type NativeReservationChange = {
  contractVersion: 1;
  requestId: string;
  connectionId: string;
  propertyId: string;
  bookingId: string;
  expectedSourceVersion: number;
  generatedAt: string;
  approvedBy: string;
  stay: { checkIn: string; checkOut: string; guests: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isValidDate(value: string) {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseNativeReservationChange(value: unknown, headerConnectionId: string, now = Date.now()): NativeReservationChange {
  if (!isRecord(value) || !hasExactKeys(value, [
    "contractVersion", "requestId", "connectionId", "propertyId", "bookingId",
    "expectedSourceVersion", "generatedAt", "approvedBy", "stay",
  ])) throw new Error("invalid_envelope");
  if (value.contractVersion !== 1
    || typeof value.requestId !== "string" || !uuid.test(value.requestId)
    || typeof value.connectionId !== "string" || !connectionToken.test(value.connectionId)
    || value.connectionId !== headerConnectionId
    || typeof value.propertyId !== "string" || value.propertyId.length < 1 || value.propertyId.length > 128
    || typeof value.bookingId !== "string" || !uuid.test(value.bookingId)
    || !Number.isSafeInteger(value.expectedSourceVersion) || Number(value.expectedSourceVersion) < 1
    || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))
    || new Date(value.generatedAt).toISOString() !== value.generatedAt
    // The command body is immutable across retries, while the signed transport
    // timestamp is refreshed per attempt. Freshness is enforced by HMAC header.
    || Date.parse(value.generatedAt) > now + 5 * 60_000
    || typeof value.approvedBy !== "string" || !uuid.test(value.approvedBy)
    || !isRecord(value.stay) || !hasExactKeys(value.stay, ["checkIn", "checkOut", "guests"])
    || typeof value.stay.checkIn !== "string" || !isValidDate(value.stay.checkIn)
    || typeof value.stay.checkOut !== "string" || !isValidDate(value.stay.checkOut)
    || value.stay.checkOut <= value.stay.checkIn
    || !Number.isInteger(value.stay.guests) || Number(value.stay.guests) < 1 || Number(value.stay.guests) > 20) {
    throw new Error("invalid_envelope");
  }
  return value as NativeReservationChange;
}

export function reservationChangeDigest(rawBody: Uint8Array) {
  return createHash("sha256").update(rawBody).digest("hex");
}
