import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const nativeAriBodyLimit = 256 * 1024;
const token = /^[A-Za-z0-9_-]{1,128}$/;
const connectionToken = /^[A-Za-z0-9_-]{1,80}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const restrictions = new Set(["closed", "closed_to_arrival", "closed_to_departure"]);

export type NativeAriUpdate = {
  date: string;
  roomTypeId: string;
  ratePlanId: string;
  available: number;
  rateMinor: number;
  currency: "USD";
  minimumStay: number;
  maximumStay: number | null;
  restrictions: string[];
};

export type NativeAriBatch = {
  contractVersion: 1;
  eventId: string;
  propertyId: string;
  connector: "iratepilot";
  connectionId: string;
  sourceVersion: number;
  generatedAt: string;
  updates: NativeAriUpdate[];
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function validDate(value: string) {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseNativeAriBatch(value: unknown, headerConnectionId: string, now = Date.now()): NativeAriBatch {
  if (!record(value) || !exactKeys(value, [
    "contractVersion", "eventId", "propertyId", "connector", "connectionId", "sourceVersion", "generatedAt", "updates",
  ])) throw new Error("invalid_envelope");
  if (value.contractVersion !== 1 || value.connector !== "iratepilot"
    || typeof value.eventId !== "string" || !token.test(value.eventId)
    || typeof value.propertyId !== "string" || !token.test(value.propertyId)
    || typeof value.connectionId !== "string" || !connectionToken.test(value.connectionId)
    || value.connectionId !== headerConnectionId
    || !Number.isSafeInteger(value.sourceVersion) || Number(value.sourceVersion) < 1
    || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))
    || new Date(value.generatedAt).toISOString() !== value.generatedAt
    || Date.parse(value.generatedAt) > now + 5 * 60_000
    || !Array.isArray(value.updates) || value.updates.length < 1 || value.updates.length > 366) {
    throw new Error("invalid_envelope");
  }

  const seen = new Set<string>();
  for (const update of value.updates) {
    if (!record(update) || !exactKeys(update, [
      "date", "roomTypeId", "ratePlanId", "available", "rateMinor", "currency", "minimumStay", "maximumStay", "restrictions",
    ])) throw new Error("invalid_update");
    if (typeof update.date !== "string" || !validDate(update.date)) throw new Error("invalid_date");
    const stayDate = Date.parse(`${update.date}T00:00:00.000Z`);
    if (stayDate < Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z")
      || stayDate > now + 367 * 24 * 60 * 60_000) throw new Error("date_out_of_range");
    if (typeof update.roomTypeId !== "string" || !token.test(update.roomTypeId)
      || typeof update.ratePlanId !== "string" || !token.test(update.ratePlanId)) throw new Error("invalid_mapping");
    if (!Number.isInteger(update.available) || Number(update.available) < 0 || Number(update.available) > 500) throw new Error("unsupported_availability");
    if (!Number.isInteger(update.rateMinor) || Number(update.rateMinor) < 2500 || Number(update.rateMinor) > 2_500_000) throw new Error("unsupported_rate");
    if (update.currency !== "USD") throw new Error("unsupported_currency");
    // The current marketplace schema has no per-rate-plan or stay-restriction columns.
    // Reject unsupported values rather than silently dropping them.
    if (update.minimumStay !== 1 || update.maximumStay !== null
      || !Array.isArray(update.restrictions) || update.restrictions.length !== 0
      || update.restrictions.some((item) => typeof item !== "string" || !restrictions.has(item))) {
      throw new Error("unsupported_restrictions");
    }
    const identity = `${update.date}/${update.roomTypeId}/${update.ratePlanId}`;
    if (seen.has(identity)) throw new Error("duplicate_update");
    seen.add(identity);
  }
  return value as NativeAriBatch;
}

export function verifyNativeAriSignature(input: {
  secret: string;
  connectionId: string;
  timestamp: string;
  signature: string;
  rawBody: Uint8Array;
  now?: number;
}) {
  if (!connectionToken.test(input.connectionId) || !/^\d{10}$/.test(input.timestamp)
    || !/^[a-f0-9]{64}$/.test(input.signature)
    || new TextEncoder().encode(input.secret).byteLength < 32
    || new TextEncoder().encode(input.secret).byteLength > 512) return false;
  const seconds = Number(input.timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor((input.now ?? Date.now()) / 1000) - seconds) > 300) return false;
  const body = Buffer.from(input.rawBody).toString("utf8");
  const expected = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.connectionId}.${body}`, "utf8")
    .digest();
  const supplied = Buffer.from(input.signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function nativeAriPayloadDigest(rawBody: Uint8Array) {
  return createHash("sha256").update(rawBody).digest("hex");
}
