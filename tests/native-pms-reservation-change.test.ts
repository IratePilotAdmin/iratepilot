import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseNativeReservationChange, reservationChangeDigest } from "../lib/iratepilot-pms-reservation-change";

const now = Date.parse("2026-09-26T12:00:00.000Z");
const change = {
  contractVersion: 1,
  requestId: "50000000-0000-4000-8000-000000000001",
  connectionId: "redroof-native-01",
  propertyId: "pms-property-redroof",
  bookingId: "40000000-0000-4000-8000-000000000001",
  expectedSourceVersion: 4,
  generatedAt: "2026-09-26T11:59:30.000Z",
  approvedBy: "30000000-0000-4000-8000-000000000001",
  stay: { checkIn: "2026-10-01", checkOut: "2026-10-03", guests: 2 },
};

describe("native PMS reservation change contract", () => {
  it("accepts a scoped, manager-approved date change and only the allowlisted fields", () => {
    expect(parseNativeReservationChange(change, "redroof-native-01", now)).toEqual(change);
  });

  it("rejects unexpected personal, payment, room, cancellation, or price fields", () => {
    expect(() => parseNativeReservationChange({ ...change, guestEmail: "guest@example.test" }, "redroof-native-01", now)).toThrow("invalid_envelope");
    expect(() => parseNativeReservationChange({ ...change, paymentIntent: "pi_secret" }, "redroof-native-01", now)).toThrow("invalid_envelope");
    expect(() => parseNativeReservationChange({ ...change, roomId: "20000000-0000-4000-8000-000000000001" }, "redroof-native-01", now)).toThrow("invalid_envelope");
    expect(() => parseNativeReservationChange({ ...change, stay: { ...change.stay, total: 1 } }, "redroof-native-01", now)).toThrow("invalid_envelope");
  });

  it("rejects a mismatched connection, malformed identity, invalid stay, or a future command timestamp", () => {
    expect(() => parseNativeReservationChange(change, "other-connection", now)).toThrow("invalid_envelope");
    expect(() => parseNativeReservationChange({ ...change, requestId: "not-a-uuid" }, "redroof-native-01", now)).toThrow("invalid_envelope");
    expect(() => parseNativeReservationChange({ ...change, stay: { ...change.stay, checkOut: "2026-10-01" } }, "redroof-native-01", now)).toThrow("invalid_envelope");
    expect(parseNativeReservationChange(change, "redroof-native-01", now + 31 * 24 * 60 * 60_000)).toEqual(change);
    expect(() => parseNativeReservationChange({ ...change, generatedAt: "2026-09-26T12:06:00.000Z" }, "redroof-native-01", now)).toThrow("invalid_envelope");
  });

  it("digests the exact request bytes and keeps database access service-only", async () => {
    const raw = new TextEncoder().encode(JSON.stringify(change));
    expect(reservationChangeDigest(raw)).toBe(createHash("sha256").update(raw).digest("hex"));
    const sql = await readFile(new URL("../supabase/migrations/20260926140000_iratepilot_pms_reservation_change_receiver.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/alter table public\.irp_pms_reservation_change_receipts enable row level security/);
    expect(sql).toMatch(/revoke all on function public\.irp_pms_apply_reservation_change[\s\S]*?from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.irp_pms_apply_reservation_change[\s\S]*?to service_role/);
    expect(sql).toContain("source_version_conflict");
    expect(sql).toContain("price_change_requires_review");
    expect(sql).toContain("request_id uuid primary key");
  });
});
