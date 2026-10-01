import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { nativeAriPayloadDigest, parseNativeAriBatch, verifyNativeAriSignature } from "../lib/iratepilot-pms-ari";

const now = Date.parse("2026-09-23T12:00:00.000Z");
const batch = {
  contractVersion: 1,
  eventId: "e2f76b92-115d-4b05-9b76-88de3ee809d2",
  propertyId: "pms-property-redroof",
  connector: "iratepilot",
  connectionId: "redroof-native-01",
  sourceVersion: 1,
  generatedAt: "2026-09-23T11:59:30.000Z",
  updates: [{
    date: "2026-09-24",
    roomTypeId: "ndq2",
    ratePlanId: "bar",
    available: 14,
    rateMinor: 10750,
    currency: "USD",
    minimumStay: 1,
    maximumStay: null,
    restrictions: [],
  }],
};

describe("iRatePilot PMS native ARI receiver", () => {
  it("accepts a bounded USD availability/rate batch scoped to the authenticated connection", () => {
    expect(parseNativeAriBatch(batch, "redroof-native-01", now)).toEqual(batch);
  });

  it("rejects identity, contact, payment, and unknown fields instead of silently dropping them", () => {
    expect(() => parseNativeAriBatch({ ...batch, guestName: "Private Guest" }, "redroof-native-01", now)).toThrow("invalid_envelope");
    expect(() => parseNativeAriBatch({ ...batch, updates: [{ ...batch.updates[0], email: "guest@example.test" }] }, "redroof-native-01", now)).toThrow("invalid_update");
  });

  it("rejects a wrong connection, stale/future timestamp, conflicting restrictions, and duplicate rows", () => {
    expect(() => parseNativeAriBatch(batch, "other-connection", now)).toThrow("invalid_envelope");
    expect(() => parseNativeAriBatch({ ...batch, generatedAt: "2026-09-23T12:10:00.000Z" }, "redroof-native-01", now)).toThrow("invalid_envelope");
    expect(() => parseNativeAriBatch({ ...batch, updates: [{ ...batch.updates[0], restrictions: ["closed"] }] }, "redroof-native-01", now)).toThrow("unsupported_restrictions");
    expect(() => parseNativeAriBatch({ ...batch, updates: [batch.updates[0], batch.updates[0]] }, "redroof-native-01", now)).toThrow("duplicate_update");
  });

  it("verifies the exact raw body with the shared signed-gateway timestamp envelope", () => {
    const secret = "native-ari-sandbox-secret-with-at-least-32-bytes";
    const timestamp = String(Math.floor(now / 1000));
    const raw = Buffer.from(JSON.stringify(batch));
    const signature = createHmac("sha256", secret).update(`${timestamp}.redroof-native-01.${raw.toString("utf8")}`).digest("hex");
    expect(verifyNativeAriSignature({ secret, connectionId: "redroof-native-01", timestamp, signature, rawBody: raw, now })).toBe(true);
    expect(verifyNativeAriSignature({ secret, connectionId: "redroof-native-01", timestamp, signature, rawBody: Buffer.from(`${raw.toString("utf8")} `), now })).toBe(false);
    expect(verifyNativeAriSignature({ secret, connectionId: "redroof-native-01", timestamp: String(Number(timestamp) - 301), signature, rawBody: raw, now })).toBe(false);
  });

  it("hashes the exact bytes used for idempotency evidence", () => {
    const raw = new TextEncoder().encode(JSON.stringify(batch));
    expect(nativeAriPayloadDigest(raw)).toBe(createHash("sha256").update(raw).digest("hex"));
  });

  it("keeps connection and event tables private and performs each mapped inventory batch atomically", async () => {
    const sql = await readFile(new URL("../supabase/migrations/202609230140_iratepilot_pms_native_ari_receiver.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/enabled boolean not null default false/);
    expect(sql).toMatch(/alter table public\.irp_pms_native_ari_connections enable row level security/);
    expect(sql).toMatch(/revoke all on function public\.irp_pms_apply_native_ari[\s\S]*?from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.irp_pms_apply_native_ari[\s\S]*?to service_role/);
    expect(sql).toMatch(/for update/);
    expect(sql).toMatch(/state <> 'delivered'/);
    expect(sql).toMatch(/on conflict\(room_id, stay_date\) do update/);
    expect(sql).toMatch(/unique \(connection_id, source_version\)/);
  });
});
