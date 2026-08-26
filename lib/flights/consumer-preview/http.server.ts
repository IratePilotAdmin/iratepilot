import "server-only";

import { NextResponse } from "next/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumPreviewBodyBytes = 32_768;

export function privateNoStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function validateSameOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function readPreviewIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim() ?? "";
  return uuidPattern.test(value) ? value.toLowerCase() : null;
}

export async function readPreviewJson(request: Request, maximumBytes = maximumPreviewBodyBytes) {
  if (
    !Number.isSafeInteger(maximumBytes)
    || maximumBytes < 1
    || maximumBytes > maximumPreviewBodyBytes
  ) throw new TypeError("Preview JSON limit is invalid.");
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { ok: false as const, error: "Content-Type must be application/json." };
  }
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)
  ) return { ok: false as const, error: "The request body is too large." };

  try {
    const reader = request.body?.getReader();
    if (!reader) return { ok: false as const, error: "A JSON request body is required." };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        return { ok: false as const, error: "The request body is too large." };
      }
      chunks.push(item.value);
    }
    const encoded = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      encoded.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(encoded)) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false as const, error: "A JSON object is required." };
    }
    return { ok: true as const, value };
  } catch {
    return { ok: false as const, error: "The JSON request body is invalid." };
  }
}
