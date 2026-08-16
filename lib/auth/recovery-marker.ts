import { createHmac, timingSafeEqual } from "node:crypto";

export const recoveryMarkerCookieName = "__Host-iratepilot-recovery";
export const recoveryMarkerMaxAge = 10 * 60;
export const recoveryMarkerCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

type RecoveryMarkerPayload = {
  exp: number;
  purpose: "password_recovery";
  sub: string;
};

const getSigningSecret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const sign = (encodedPayload: string, secret: string) => createHmac("sha256", secret)
  .update(`iratepilot-password-recovery-v1.${encodedPayload}`)
  .digest("base64url");

export function createRecoveryMarker(userId: string, now = Date.now()) {
  const secret = getSigningSecret();
  if (!secret) throw new Error("Password recovery signing configuration is missing.");

  const payload: RecoveryMarkerPayload = {
    exp: Math.floor(now / 1000) + recoveryMarkerMaxAge,
    purpose: "password_recovery",
    sub: userId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyRecoveryMarker(marker: string | null | undefined, userId: string, now = Date.now()) {
  const secret = getSigningSecret();
  if (!marker || !secret) return false;

  const [encodedPayload, providedSignature, extra] = marker.split(".");
  if (!encodedPayload || !providedSignature || extra) return false;

  const expected = Buffer.from(sign(encodedPayload, secret), "utf8");
  const provided = Buffer.from(providedSignature, "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<RecoveryMarkerPayload>;
    const nowSeconds = Math.floor(now / 1000);

    return payload.purpose === "password_recovery"
      && payload.sub === userId
      && Number.isInteger(payload.exp)
      && typeof payload.exp === "number"
      && payload.exp > nowSeconds;
  } catch {
    return false;
  }
}

