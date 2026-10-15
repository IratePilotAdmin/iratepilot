import {
  decryptPmsCredentials,
  encryptPmsCredentials,
  type EncryptedPmsCredentials,
} from "./pms-credentials";

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

export function createApaleoOAuthMarker(
  input: { connectionId: string; state: string; userId: string },
  now = Date.now(),
) {
  const payload: ApaleoOAuthPayload = {
    connectionId: input.connectionId,
    exp: Math.floor(now / 1000) + apaleoOAuthMaxAge,
    state: input.state,
    sub: input.userId,
  };
  const encrypted = encryptPmsCredentials({
    payload: JSON.stringify(payload),
  });
  return Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url");
}

export function verifyApaleoOAuthMarker(
  marker: string | null | undefined,
  input: { state: string; userId: string },
  now = Date.now(),
) {
  if (!marker) return null;
  try {
    const encrypted = JSON.parse(
      Buffer.from(marker, "base64url").toString("utf8"),
    ) as EncryptedPmsCredentials;
    const values = decryptPmsCredentials(encrypted);
    const payload = JSON.parse(values.payload) as Partial<ApaleoOAuthPayload>;
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
