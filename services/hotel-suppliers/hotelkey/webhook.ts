import { createHmac, timingSafeEqual } from "node:crypto";
export type HotelKeyEvent = { eventId: string; eventType: string; propertyCode: string; reservationId?: string; occurredAt?: string; data: Record<string, unknown> };
export function verifyHotelKeyWebhook(body: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const supplied = signature.replace(/^sha256=/i, "");
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (!/^[a-f\d]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}
export function parseHotelKeyEvent(payload: unknown): HotelKeyEvent {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("HotelKey event is malformed");
  const source = payload as Record<string, unknown>;
  const eventId = String(source.eventId ?? source.id ?? "").trim();
  const eventType = String(source.eventType ?? source.type ?? "").trim();
  const propertyCode = String(source.propertyCode ?? source.hotelCode ?? "").trim();
  if (!eventId || !eventType || !propertyCode) throw new Error("HotelKey event is missing required identifiers");
  return {
    eventId, eventType, propertyCode,
    reservationId: source.reservationId ? String(source.reservationId) : undefined,
    occurredAt: source.occurredAt ? String(source.occurredAt) : undefined,
    data: source.data && typeof source.data === "object" && !Array.isArray(source.data) ? source.data as Record<string, unknown> : {},
  };
}
