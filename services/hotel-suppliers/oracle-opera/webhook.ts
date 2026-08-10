import { timingSafeEqual } from "node:crypto";

export type OracleOperaDistributionEvent = {
  eventId: string;
  eventType: string;
  hotelCode: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
};

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifies the bearer credential configured with Oracle during outbound-channel
 * onboarding. The endpoint must still enforce HTTPS and replay protection.
 */
export function verifyOracleOperaWebhookAuthorization(
  authorization: string | null | undefined,
  expectedSecret: string,
) {
  const expected = expectedSecret.trim();
  if (!expected) throw new Error("Oracle OPERA webhook secret is not configured");
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() || "");
  return Boolean(match && secureEqual(match[1], expected));
}

export function parseOracleOperaDistributionEvent(body: unknown): OracleOperaDistributionEvent {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Oracle OPERA webhook body must be an object");
  }
  const value = body as Record<string, unknown>;
  const eventId = typeof value.eventId === "string" ? value.eventId.trim() : "";
  const eventType = typeof value.eventType === "string" ? value.eventType.trim() : "";
  const hotelCode = typeof value.hotelCode === "string" ? value.hotelCode.trim() : "";
  if (!eventId || !eventType || !hotelCode) {
    throw new Error("Oracle OPERA webhook is missing eventId, eventType, or hotelCode");
  }
  return {
    eventId,
    eventType,
    hotelCode,
    occurredAt: typeof value.occurredAt === "string" ? value.occurredAt : undefined,
    payload: value,
  };
}
