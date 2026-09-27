export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "unsupported_media_type" | "too_large" | "invalid_json" };

export type BoundedTextResult =
  | { ok: true; value: string }
  | { ok: false; reason: "too_large" | "invalid_body" };

/** Read an untrusted UTF-8 body under a strict streaming byte limit. */
export async function readBoundedText(request: Request, maximumBytes: number): Promise<BoundedTextResult> {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) throw new RangeError("A positive body limit is required.");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { ok: false, reason: "invalid_body" };
    if (Number(declaredLength) > maximumBytes) {
      await request.body?.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
  }
  if (!request.body) return { ok: false, reason: "invalid_body" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_body" };
  }
}

/** Read untrusted JSON without allowing a caller to force an unbounded allocation. */
export async function readBoundedJson(request: Request, maximumBytes = 16 * 1024): Promise<BoundedJsonResult> {
  const mediaType = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return { ok: false, reason: "unsupported_media_type" };
  const body = await readBoundedText(request, maximumBytes);
  if (!body.ok) return { ok: false, reason: body.reason === "too_large" ? "too_large" : "invalid_json" };
  try {
    return { ok: true, value: JSON.parse(body.value) as unknown };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
