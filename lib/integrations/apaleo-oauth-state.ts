import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const apaleoOAuthCookieName = "__Host-iratepilot-apaleo-oauth";
export const apaleoOAuthMaxAge = 10 * 60;
export const apaleoOAuthCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

type ApaleoOAuthPayload = {
  connectionId: string;
  exp: number;
  state: string;
  sub: string;
};

function signingKey() {
  const rootKey = process.env.PMS_CREDENTIAL_ENCRYPTION_KEY;
  if (!rootKey || rootKey.length < 32) return null;
  return hkdfSync(
    "sha256",
    Buffer.from(rootKey, "utf8"),
    Buffer.from("iratepilot-pms-vault", "utf8"),
    Buffer.from("apaleo-oauth-state-v1", "utf8"),
    32,
  );
}

function sign(encodedPayload: string, key: ArrayBuffer) {
  return createHmac("sha256", Buffer.from(key))
    .update(`iratepilot-apaleo-oauth-v1.${encodedPayload}`)
    .digest("base64url");
}

export function createApaleoOAuthMarker(
  input: { connectionId: string; state: string; userId: string },
  now = Date.now(),
) {
  const key = signingKey();
  if (!key) throw new Error("Apaleo OAuth state signing is not configured.");
  const payload: ApaleoOAuthPayload = {
    connectionId: input.connectionId,
    exp: Math.floor(now / 1000) + apaleoOAuthMaxAge,
    state: input.state,
    sub: input.userId,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, key)}`;
}

export function verifyApaleoOAuthMarker(
  marker: string | null | undefined,
  input: { state: string; userId: string },
  now = Date.now(),
) {
  const key = signingKey();
  if (!marker || !key) return null;
  const [encoded, providedSignature, extra] = marker.split(".");
  if (!encoded || !providedSignature || extra) return null;
  const expected = Buffer.from(sign(encoded, key), "utf8");
  const provided = Buffer.from(providedSignature, "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ApaleoOAuthPayload>;
    if (payload.sub !== input.userId
      || payload.state !== input.state
      || !payload.connectionId
      || !Number.isInteger(payload.exp)
      || typeof payload.exp !== "number"
      || payload.exp <= Math.floor(now / 1000)) return null;
    return { connectionId: payload.connectionId };
  } catch {
    return null;
  }
}
