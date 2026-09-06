export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new SyntaxError("Invalid Content-Length header.");
    }
    if (bytes > maxBytes) throw new RequestBodyTooLargeError();
  }
  if (!request.body) throw new SyntaxError("A JSON request body is required.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let source = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size violation is authoritative even if cancellation fails.
        }
        throw new RequestBodyTooLargeError();
      }
      source += decoder.decode(value, { stream: true });
    }
    source += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(source) as unknown;
}
